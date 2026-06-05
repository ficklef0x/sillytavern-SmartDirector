
import {
    eventSource,
    event_types,
    main_api,
    saveSettingsDebounced,
    getRequestHeaders,
    Generate,
} from '../../../../script.js';
import {
    extension_settings,
    getContext,
    renderExtensionTemplateAsync,
} from '../../../extensions.js';
import { oai_settings, getChatCompletionModel } from '../../../openai.js';
import { textgenerationwebui_settings } from '../../../textgen-settings.js';
import { kai_settings } from '../../../kai-settings.js';
import { delay } from '../../../utils.js';

const MODULE_NAME = 'smart-order';
const EXTENSION_PATH = 'third-party/sillytavern-SmartDirector';

// ------------------------------------------------------------------
// Default Settings
// ------------------------------------------------------------------
const defaultSettings = Object.freeze({
    enabled: true,
    apiMode: 'auto',
    customUrl: '',
    customKey: '',
    model: '',
    maxTokens: 200,
    promptPreset: 'default',
    customPrompt: '',
    maxHistoryMessages: 20,
    autoTrigger: true,
});

function getSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extension_settings[MODULE_NAME], key)) {
            extension_settings[MODULE_NAME][key] = defaultSettings[key];
        }
    }
    return extension_settings[MODULE_NAME];
}

// ------------------------------------------------------------------
// Prompt Presets
// ------------------------------------------------------------------
const promptPresets = {
    default: `You are the Director AI. Your ONLY job is to pick the next speaker from the list below.

ACTIVE CHARACTERS: {{characters}}
FORBIDDEN (you MUST NEVER pick these): {{notChar}}

RECENT CONVERSATION:
{{history}}

RULES:
- Pick EXACTLY ONE name from ACTIVE CHARACTERS.
- NEVER pick anyone from FORBIDDEN. If the most logical choice is in FORBIDDEN, pick the next best character from ACTIVE CHARACTERS.
- Output valid JSON: {"speaker":"NameHere"}
- No extra text, no markdown, no explanations.

EXAMPLE:
{"speaker":"Charlie"}

NOW YOUR TURN:`,

    thinking: `DIRECTIVE: Pick the next speaker.

CHARACTERS: {{characters}}
FORBIDDEN (NEVER pick these): {{notChar}}

HISTORY:
{{history}}

RULES:
- Output MUST be valid JSON: {"speaker":"NameHere"}
- Name MUST come from CHARACTERS.
- NEVER pick from FORBIDDEN. If the obvious choice is FORBIDDEN, pick the next best from CHARACTERS.
- No extra text. No reasoning. Just the JSON object.

EXAMPLE:
{"speaker":"Alice"}

NOW YOUR TURN:`,

    xml: `You are the Director. Pick the next speaker.

Characters: {{characters}}
Forbidden (NEVER pick): {{notChar}}
History: {{history}}

Rules:
- Pick ONLY from Characters.
- NEVER pick from Forbidden.
- Output valid JSON: {"speaker":"NameHere"}
- No extra text.

{"speaker":"`,
};

function getPromptTemplate() {
    const settings = getSettings();
    if (settings.promptPreset === 'custom') {
        return settings.customPrompt || promptPresets.default;
    }
    return promptPresets[settings.promptPreset] || promptPresets.default;
}

// ------------------------------------------------------------------
// API Autodetect
// ------------------------------------------------------------------
function getDirectorEndpoint() {
    const settings = getSettings();
    if (settings.apiMode === 'custom') {
        return { endpoint: settings.customUrl, mode: 'custom' };
    }

    switch (main_api) {
        case 'openai':
            return { endpoint: '/api/backends/chat-completions/generate', mode: 'openai' };
        case 'textgenerationwebui':
            return { endpoint: '/api/backends/text-completions/generate', mode: 'textgen' };
        case 'kobold':
            return { endpoint: '/api/backends/kobold/generate', mode: 'kobold' };
        default:
            return { endpoint: null, mode: 'unsupported' };
    }
}

function buildDirectorRequest(prompt) {
    const settings = getSettings();
    const tokenLimit = settings.maxTokens || 200;

    const activeModel = settings.model
        || (typeof getChatCompletionModel === 'function' ? getChatCompletionModel() : null)
        || oai_settings[`${oai_settings.chat_completion_source}_model`]
        || oai_settings.openai_model
        || oai_settings.google_model
        || oai_settings.custom_model
        || 'gemini-2.5-flash';

    if (settings.apiMode === 'custom') {
        return {
            body: {
                model: activeModel,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: tokenLimit,
                temperature: 0.3,
            },
            mode: 'custom',
        };
    }

    switch (main_api) {
        case 'openai': {
            return {
                body: {
                    model: activeModel,
                    stream: false,
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: tokenLimit,
                    temperature: 0.1,
                    chat_completion_source: oai_settings.chat_completion_source,
                },
                mode: 'openai',
            };
        }
        case 'textgenerationwebui': {
            return {
                body: {
                    stream: false,
                    prompt: prompt,
                    max_tokens: tokenLimit,
                    max_new_tokens: tokenLimit,
                    temperature: 0.1,
                    api_type: textgenerationwebui_settings.type,
                    api_server: textgenerationwebui_settings.server_urls?.[textgenerationwebui_settings.type] || '',
                    stop: ['User:', 'Assistant:', 'System:'],
                },
                mode: 'textgen',
            };
        }
        case 'kobold': {
            return {
                body: {
                    prompt: prompt,
                    max_length: tokenLimit,
                    temperature: 0.1,
                    gui_settings: false,
                    streaming: false,
                    api_server: kai_settings.api_server || '',
                    stop_sequence: ['User:', 'Assistant:', 'System:'],
                },
                mode: 'kobold',
            };
        }
        default:
            return null;
    }
}

function parseDirectorResponse(data, mode) {
    if (!data) return '';

    switch (mode) {
        case 'openai':
            return data?.choices?.[0]?.message?.content
                || data?.choices?.[0]?.text
                || data?.text
                || '';
        case 'textgen':
            return data?.choices?.[0]?.text
                || data?.choices?.[0]?.message?.content
                || data?.content
                || data?.response
                || data?.[0]?.content
                || '';
        case 'kobold':
            return data?.results?.[0]?.text
                || data?.text
                || '';
        case 'custom':
            return data?.choices?.[0]?.message?.content
                || data?.content?.map?.(c => c.text)?.join('')
                || data?.candidates?.[0]?.content?.parts?.map?.(p => p.text)?.join('')
                || data?.text
                || '';
        default:
            return '';
    }
}

// ------------------------------------------------------------------
// Status UI
// ------------------------------------------------------------------
function setStatus(message, type = '') {
    const el = document.getElementById('smart_order_status');
    if (!el) return;
    el.textContent = message;
    el.className = 'smart-order-status marginTop5';
    if (type) el.classList.add(type);
    if (type !== 'thinking') {
        setTimeout(() => {
            if (el.textContent === message) {
                el.textContent = '';
                el.className = 'smart-order-status marginTop5';
            }
        }, 8000);
    }
}

// ------------------------------------------------------------------
// Settings UI
// ------------------------------------------------------------------
async function loadSettingsUI() {
    const settingsHtml = await renderExtensionTemplateAsync(EXTENSION_PATH, 'settings');
    const container = $(document.getElementById('smart_order_container') ?? document.getElementById('extensions_settings2'));
    container.append(settingsHtml);

    const settings = getSettings();

    // Populate values
    $('#smart_order_enabled').prop('checked', settings.enabled);
    $('#smart_order_api_mode').val(settings.apiMode);
    $('#smart_order_custom_url').val(settings.customUrl);
    $('#smart_order_custom_key').val(settings.customKey);
    $('#smart_order_model').val(settings.model);
    $('#smart_order_max_tokens').val(settings.maxTokens);
    $('#smart_order_prompt_preset').val(settings.promptPreset);
    $('#smart_order_custom_prompt').val(settings.customPrompt);
    $('#smart_order_max_history').val(settings.maxHistoryMessages);
    $('#smart_order_auto_trigger').prop('checked', settings.autoTrigger);

    // Show/hide conditional blocks
    toggleCustomApiSettings(settings.apiMode);
    updatePromptTextarea();

    // Event listeners
    $('#smart_order_enabled').on('change', function () {
        settings.enabled = !!$(this).prop('checked');
        saveSettingsDebounced();
        updateStatusFromSettings();
    });

    $('#smart_order_api_mode').on('change', function () {
        settings.apiMode = $(this).val();
        toggleCustomApiSettings(settings.apiMode);
        saveSettingsDebounced();
    });

    $('#smart_order_custom_url').on('input', function () {
        settings.customUrl = $(this).val();
        saveSettingsDebounced();
    });

    $('#smart_order_custom_key').on('input', function () {
        settings.customKey = $(this).val();
        saveSettingsDebounced();
    });

    $('#smart_order_model').on('input', function () {
        settings.model = $(this).val().trim();
        saveSettingsDebounced();
    });

    $('#smart_order_max_tokens').on('input', function () {
        const val = parseInt($(this).val());
        settings.maxTokens = isNaN(val) ? 200 : Math.max(10, Math.min(8192, val));
        saveSettingsDebounced();
    });

    $('#smart_order_prompt_preset').on('change', function () {
        settings.promptPreset = $(this).val();
        updatePromptTextarea();
        saveSettingsDebounced();
    });

    $('#smart_order_custom_prompt').on('input', function () {
        if (settings.promptPreset !== 'custom') {
            settings.promptPreset = 'custom';
            $('#smart_order_prompt_preset').val('custom');
        }
        settings.customPrompt = $(this).val();
        saveSettingsDebounced();
    });

    $('#smart_order_max_history').on('input', function () {
        const val = parseInt($(this).val());
        settings.maxHistoryMessages = isNaN(val) ? 20 : Math.max(1, Math.min(100, val));
        saveSettingsDebounced();
    });

    $('#smart_order_auto_trigger').on('change', function () {
        settings.autoTrigger = !!$(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#smart_order_test_connection').on('click', testConnection);

    updateStatusFromSettings();
}

function toggleCustomApiSettings(mode) {
    if (mode === 'custom') {
        $('#smart_order_custom_api_settings').show();
    } else {
        $('#smart_order_custom_api_settings').hide();
    }
}

function updatePromptTextarea() {
    const settings = getSettings();
    const textarea = $('#smart_order_custom_prompt');

    if (settings.promptPreset === 'custom') {
        textarea.val(settings.customPrompt);
        textarea.prop('readonly', false);
        textarea.css('opacity', '1');
    } else {
        const presetText = promptPresets[settings.promptPreset] || promptPresets.default;
        textarea.val(presetText);
        textarea.prop('readonly', true);
        textarea.css('opacity', '0.7');
    }
}

// Preserving downstream execution functions exactly below
function updateStatusFromSettings() {
    const settings = getSettings();
    if (!settings.enabled) {
        setStatus('Smart Director is disabled', 'error');
    } else {
        const { endpoint, mode } = getDirectorEndpoint();
        if (settings.apiMode === 'auto' && mode === 'unsupported') {
            setStatus(`Auto-detect: Unsupported API (${main_api})`, 'error');
        } else if (settings.apiMode === 'custom' && !settings.customUrl) {
            setStatus('Custom API URL not set', 'error');
        } else {
            setStatus('Ready', 'ready');
        }
    }
}

function injectSmartOrderOption() {
    const select = document.getElementById('rm_group_activation_strategy');
    if (!select || select.querySelector('option[value="4"]')) return;
    const option = document.createElement('option');
    option.value = '4';
    option.textContent = 'Smart Director';
    select.appendChild(option);
}

function watchForStrategyDropdown() {
    injectSmartOrderOption();
    const observer = new MutationObserver(() => { injectSmartOrderOption(); });
    observer.observe(document.body, { childList: true, subtree: true });
}

function getChatHistory(maxMessages) {
    const context = getContext();
    if (!context.chat || !Array.isArray(context.chat)) return '';
    return context.chat.slice(-maxMessages).map(m => `${m.name}: ${m.mes}`).join('\n');
}

function getActiveGroupMembers() {
    const context = getContext();
    if (!context.groupId || !context.groups || !context.characters) return [];
    const group = context.groups.find(g => g.id === context.groupId);
    if (!group || !group.members) return [];
    const disabled = group.disabled_members || [];
    const activeMembers = [];
    for (const avatar of group.members) {
        if (disabled.includes(avatar)) continue;
        const char = context.characters.find(c => c.avatar === avatar);
        if (char) activeMembers.push(char);
    }
    return activeMembers;
}

function getGroupCharacterByName(name) {
    const members = getActiveGroupMembers();
    if (!members.length) return null;
    const exact = members.find(c => c.name === name);
    if (exact) return exact;
    return members.find(c => c.name.toLowerCase() === name.toLowerCase()) || null;
}

function getExcludedNames() {
    const context = getContext();
    return context.name1 ? [context.name1] : [];
}

function buildPrompt(memberNames, history) {
    const template = getPromptTemplate();
    const excluded = getExcludedNames();
    return template
        .replace(/\{\{characters\}\}/g, memberNames.join(', '))
        .replace(/\{\{notChar\}\}/g, excluded.join(', ') || 'None')
        .replace(/\{\{history\}\}/g, history);
}

async function callDirectorApi(prompt) {
    const { endpoint, mode } = getDirectorEndpoint();
    const request = buildDirectorRequest(prompt);

    console.log('[Smart Director] API Endpoint:', endpoint);
    console.log('[Smart Director] API Mode:', mode);

    if (!endpoint || !request) throw new Error('API request assembly failure');

    console.log('[Smart Director] Request Body:', JSON.stringify(request.body, null, 2));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
        let response;
        if (mode === 'custom') {
            const settings = getSettings();
            const headers = { 'Content-Type': 'application/json' };
            if (settings.customKey) headers['Authorization'] = `Bearer ${settings.customKey}`;
            console.log('[Smart Director] Request Headers:', JSON.stringify(headers));
            response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(request.body),
                signal: controller.signal,
            });
        } else {
            console.log('[Smart Director] Using SillyTavern backend proxy');
            response = await fetch(endpoint, {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify(request.body),
                signal: controller.signal,
            });
        }

        clearTimeout(timeoutId);
        if (!response.ok) {
            const text = await response.text();
            console.error('[Smart Director] API HTTP Error:', response.status, text);
            throw new Error(`API Error ${response.status}: ${text}`);
        }
        const data = await response.json();
        console.log('[Smart Director] Raw API Response Data:', JSON.stringify(data, null, 2));
        const content = parseDirectorResponse(data, mode);
        if (!content) {
            console.warn('[Smart Director] Empty response from Director. Data:', data);
            throw new Error('Director returned empty response');
        }
        return content;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

function extractSpeaker(response, memberNames) {
    if (!response || !memberNames.length) return null;

    // 0. Try JSON parse first (strip reasoning blocks, then markdown code blocks)
    try {
        let jsonText = response
            .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');

        const codeBlockMatch = jsonText.match(/```json\s*([\s\S]*?)```/);
        if (codeBlockMatch) jsonText = codeBlockMatch[1];
        else {
            const genericBlockMatch = jsonText.match(/```\s*([\s\S]*?)```/);
            if (genericBlockMatch) jsonText = genericBlockMatch[1];
        }

        const parsed = JSON.parse(jsonText);
        if (parsed && typeof parsed.speaker === 'string') {
            const name = parsed.speaker.trim();
            const exact = memberNames.find(n => n === name);
            if (exact) return exact;
            const ci = memberNames.find(n => n.toLowerCase() === name.toLowerCase());
            if (ci) return ci;
        }
    } catch { /* Not valid JSON, continue */ }

    // 1. Try XML <speaker> tag (legacy fallback)
    const xmlMatch = response.match(/<speaker>([^<]+)<\/speaker>/i);
    if (xmlMatch) {
        const name = xmlMatch[1].trim();
        const exact = memberNames.find(n => n === name);
        if (exact) return exact;
        const ci = memberNames.find(n => n.toLowerCase() === name.toLowerCase());
        if (ci) return ci;
    }

    // 2. Strip common formatting artifacts and template echoes
    let stripped = response
        .replace(/\[\s*Character\s+Name\s*\]/gi, '')
        .replace(/\[\s*Name\s*\]/gi, '')
        .replace(/^[^a-zA-Z0-9]+/, '')
        .replace(/[^a-zA-Z0-9]+$/, '')
        .trim();

    // 3. Try <thinking> block followed by clean name
    const thinkMatch = response.match(/<\/?thinking>\s*([A-Za-z0-9_\-\s]+?)\s*(?:\n|$)/i);
    if (thinkMatch) {
        const name = thinkMatch[1].trim();
        const exact = memberNames.find(n => n === name);
        if (exact) return exact;
    }

    // 4. Extract last non-empty line
    const lines = stripped.split('\n').map(l => l.trim()).filter(Boolean);
    const lastLine = lines[lines.length - 1] || '';

    // 5. Clean common prefixes/suffixes and artifacts
    const cleaned = lastLine
        .replace(/^(Next speaker[\s:]+|Speaker[\s:]+|Name[\s:]+|Character[\s:]+|Selected[\s:]+|Response[\s:]+|DIRECTOR PICK[\s:]+)/i, '')
        .replace(/^[\[("']+/, '')
        .replace(/[\]\)"']+$/, '')
        .replace(/[.!?,:;]+$/, '')
        .trim();

    // Exact match
    const exact = memberNames.find(n => n === cleaned);
    if (exact) return exact;

    // Case-insensitive match
    const ci = memberNames.find(n => n.toLowerCase() === cleaned.toLowerCase());
    if (ci) return ci;

    // 6. Fuzzy: check if any member name appears as a standalone word in the response
    for (const name of memberNames) {
        const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(response)) return name;
    }

    // 7. Last resort: check if cleaned string contains a member name
    for (const name of memberNames) {
        if (cleaned.toLowerCase().includes(name.toLowerCase())) return name;
    }

    // 8. Ultra-last resort: check if ANY word in the response matches a member name
    const words = stripped.split(/\s+/);
    for (const word of words.reverse()) {
        const w = word.replace(/[^a-zA-Z0-9]/g, '');
        if (!w) continue;
        for (const name of memberNames) {
            const nameClean = name.replace(/[^a-zA-Z0-9]/g, '');
            if (w.toLowerCase() === nameClean.toLowerCase()) return name;
        }
    }

    return null;
}

async function runSmartOrder() {
    const settings = getSettings();
    console.log('[Smart Director] ========== SMART ORDER START ==========');
    console.log('[Smart Director] Settings:', JSON.stringify(settings));

    if (!settings.enabled) {
        console.log('[Smart Director] Extension is disabled, aborting');
        console.log('[Smart Director] ========== SMART ORDER END ==========');
        return false;
    }
    const context = getContext();
    if (!context.groupId) {
        console.log('[Smart Director] Not in a group chat, aborting');
        console.log('[Smart Director] ========== SMART ORDER END ==========');
        return false;
    }

    const activeMembers = getActiveGroupMembers();
    const memberNames = activeMembers.map(c => c.name);
    console.log('[Smart Director] Active Members:', memberNames);
    if (memberNames.length === 0) {
        console.warn('[Smart Director] No active members');
        toastr.warning('No active members in this group');
        console.log('[Smart Director] ========== SMART ORDER END ==========');
        return false;
    }

    const history = getChatHistory(settings.maxHistoryMessages);
    console.log('[Smart Director] Chat History length:', history?.length || 0);
    if (!history) {
        console.warn('[Smart Director] No chat history');
        toastr.warning('No chat history available');
        console.log('[Smart Director] ========== SMART ORDER END ==========');
        return false;
    }

    const prompt = buildPrompt(memberNames, history);
    console.log('[Smart Director] Prompt:');
    console.log(prompt);
    setStatus('Consulting the Director...', 'thinking');

    try {
        console.log('[Smart Director] Calling Director API...');
        const rawResponse = await callDirectorApi(prompt);
        console.log('[Smart Director] Raw Response:', rawResponse);

        const speakerName = extractSpeaker(rawResponse, memberNames);
        console.log('[Smart Director] Extracted Speaker:', speakerName);

        if (!speakerName) {
            console.error('[Smart Director] Could not extract speaker from response');
            setStatus('Could not understand Director response', 'error');
            console.log('[Smart Director] ========== SMART ORDER END ==========');
            return false;
        }

        const excludedNames = getExcludedNames();
        if (excludedNames.length > 0 && excludedNames.some(n => n.toLowerCase() === speakerName.toLowerCase())) {
            console.error('[Smart Director] Director picked excluded name:', speakerName);
            setStatus(`Director tried to pick excluded user "${speakerName}"`, 'error');
            toastr.error(`Director picked the user "${speakerName}". Try a different prompt preset or model.`);
            console.log('[Smart Director] ========== SMART ORDER END ==========');
            return false;
        }

        const char = getGroupCharacterByName(speakerName);
        console.log('[Smart Director] Character Found:', char ? char.name : null);
        if (!char) {
            console.error('[Smart Director] Character not found in group:', speakerName);
            setStatus(`Character "${speakerName}" not found in group`, 'error');
            console.log('[Smart Director] ========== SMART ORDER END ==========');
            return false;
        }

        const isInGroup = activeMembers.some(c => c.avatar === char.avatar);
        if (!isInGroup) {
            console.error('[Smart Director] Character not in active group:', speakerName);
            setStatus(`Character "${speakerName}" is not active in this group`, 'error');
            console.log('[Smart Director] ========== SMART ORDER END ==========');
            return false;
        }

        const chid = context.characters.indexOf(char);
        console.log('[Smart Director] Character Index (chid):', chid);
        if (chid === -1) {
            console.error('[Smart Director] Character index not found in global list');
            console.log('[Smart Director] ========== SMART ORDER END ==========');
            return false;
        }

        console.log('[Smart Director] Selected:', speakerName, '(chid:', chid, ')');
        setStatus(`Selected: ${speakerName}`, 'selected');

        console.log('[Smart Director] Triggering generation for chid:', chid);
        try {
            await Generate('normal', { force_chid: chid });
            console.log('[Smart Director] Generation triggered successfully');
            console.log('[Smart Director] ========== SMART ORDER END ==========');
            return true;
        } catch (genError) {
            console.error('[Smart Director] Generation failed:', genError);
            setStatus(`Generation failed: ${genError.message}`, 'error');
            console.log('[Smart Director] ========== SMART ORDER END ==========');
            return false;
        }
    } catch (error) {
        console.error('[Smart Director] Error:', error);
        setStatus(`Error: ${error.message}`, 'error');
        console.log('[Smart Director] ========== SMART ORDER END ==========');
        return false;
    }
}

// ------------------------------------------------------------------
// Test Connection
// ------------------------------------------------------------------
async function testConnection() {
    const settings = getSettings();
    if (!settings.enabled) {
        toastr.warning('Enable Smart Director first');
        return;
    }

    const { endpoint, mode } = getDirectorEndpoint();
    if (!endpoint) {
        toastr.error(`Unsupported API type for auto-detect: ${main_api}. Use Custom API mode.`);
        return;
    }

    setStatus('Testing connection...', 'thinking');

    try {
        const testPrompt = 'Reply with the word "OK" and nothing else.';
        let body;
        const tokenLimit = settings.maxTokens || 200;

        const activeModel = settings.model
            || (typeof getChatCompletionModel === 'function' ? getChatCompletionModel() : null)
            || oai_settings[`${oai_settings.chat_completion_source}_model`]
            || oai_settings.openai_model
            || oai_settings.google_model
            || oai_settings.custom_model
            || 'gemini-2.5-flash';

        if (mode === 'custom') {
            body = {
                model: activeModel,
                messages: [{ role: 'user', content: testPrompt }],
                max_tokens: tokenLimit,
                temperature: 0,
            };
        } else if (mode === 'openai') {
            body = {
                model: activeModel,
                stream: false,
                messages: [{ role: 'user', content: testPrompt }],
                max_tokens: tokenLimit,
                temperature: 0,
                chat_completion_source: oai_settings.chat_completion_source,
            };
        } else if (mode === 'textgen') {
            body = {
                stream: false,
                prompt: testPrompt,
                max_tokens: tokenLimit,
                max_new_tokens: tokenLimit,
                temperature: 0,
                api_type: textgenerationwebui_settings.type,
                api_server: textgenerationwebui_settings.server_urls?.[textgenerationwebui_settings.type] || '',
            };
        } else if (mode === 'kobold') {
            body = {
                prompt: testPrompt,
                max_length: tokenLimit,
                temperature: 0,
                gui_settings: false,
                streaming: false,
                api_server: kai_settings.api_server || '',
            };
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        let response;
        if (mode === 'custom') {
            const headers = { 'Content-Type': 'application/json' };
            if (settings.customKey) headers['Authorization'] = `Bearer ${settings.customKey}`;
            response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: controller.signal,
            });
        } else {
            response = await fetch(endpoint, {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify(body),
                signal: controller.signal,
            });
        }

        clearTimeout(timeoutId);
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`${response.status}: ${text}`);
        }

        const data = await response.json();
        const content = parseDirectorResponse(data, mode);
        if (!content) throw new Error('Empty response from API');

        setStatus('Connection successful!', 'ready');
        toastr.success('Director API connection successful');
    } catch (error) {
        console.error('[Smart Director] Connection test failed:', error);
        setStatus(`Connection failed: ${error.message}`, 'error');
        toastr.error(`Connection test failed: ${error.message}`);
    }
}

// ------------------------------------------------------------------
// Event Listeners & Init Block
// ------------------------------------------------------------------
let pendingSmartOrder = false;
let smartOrderRunning = false;

function setupEventListeners() {
    const removeBlankMessages = () => {
        const context = getContext();
        if (!context.groupId) return;
        const group = context.groups.find(g => g.id === context.groupId);
        if (!group || Number(group.activation_strategy) !== 4) return;

        const lastMessage = context.chat[context.chat.length - 1];
        if (lastMessage && lastMessage.is_user && !lastMessage.mes.trim()) {
            context.chat.pop();
            if (typeof context.saveChat === 'function') context.saveChat();
        }

        const $lastMes = $('#chat .mes').last();
        if ($lastMes.length) {
            const isUser = $lastMes.hasClass('mes_user') || $lastMes.attr('is_user') === 'true';
            const text = ($lastMes.find('.mes_text').text() || '').trim();
            if (isUser && !text) $lastMes.remove();
        }
    };

    let chatObserver = null;
    let pollInterval = null;

    eventSource.on(event_types.GROUP_WRAPPER_STARTED, () => {
        const context = getContext();
        if (!context.groupId) return;
        const group = context.groups.find(g => g.id === context.groupId);
        if (!group || Number(group.activation_strategy) !== 4) return;

        if (!chatObserver) {
            chatObserver = new MutationObserver((mutations) => {
                let shouldCheck = false;
                for (const mutation of mutations) {
                    if (mutation.addedNodes.length > 0) { shouldCheck = true; break; }
                }
                if (shouldCheck) removeBlankMessages();
            });
        }
        const chatContainer = document.getElementById('chat');
        if (chatContainer) chatObserver.observe(chatContainer, { childList: true, subtree: true });

        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(removeBlankMessages, 10);

        setTimeout(() => { if (pollInterval) { clearInterval(pollInterval); pollInterval = null; } }, 2000);
    });

    eventSource.on(event_types.GROUP_WRAPPER_FINISHED, () => {
        if (chatObserver) chatObserver.disconnect();
    });

    eventSource.on(event_types.MESSAGE_SENT, (messageId) => {
        const settings = getSettings();
        if (!settings.enabled || !settings.autoTrigger) return;
        const context = getContext();
        if (!context.groupId) return;
        const group = context.groups.find(g => g.id === context.groupId);
        if (!group || Number(group.activation_strategy) !== 4) return;
        pendingSmartOrder = true;
    });

    eventSource.on(event_types.GROUP_WRAPPER_FINISHED, () => {
        if (!pendingSmartOrder) return;
        pendingSmartOrder = false;
        if (smartOrderRunning) return;
        smartOrderRunning = true;

        setTimeout(async () => {
            try { await runSmartOrder(); } finally { smartOrderRunning = false; }
        }, 100);
    });
}

jQuery(async () => {
    getSettings();
    await loadSettingsUI();
    watchForStrategyDropdown();
    setupEventListeners();
});
