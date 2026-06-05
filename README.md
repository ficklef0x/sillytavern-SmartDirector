# Smart Director for SillyTavern

An AI-powered extension for SillyTavern that intelligently selects the next speaker in group chats using an external "Director" AI.

## What It Does

Instead of using static rules (Natural, List, Manual, Pooled) to decide who speaks next in a group chat, Smart Director sends your conversation history to an AI and asks it to pick the most logical next character based on context, story flow, and character motivations.

## Features

- **Auto-detect API**: Automatically uses SillyTavern's currently connected API (OpenAI, Claude, Kobold, TextGen, etc.)
- **Custom API support**: Use any OpenAI-compatible endpoint
- **Built-in prompt presets**: Default, Thinking Models (for reasoning-heavy AIs), and XML-tagged prompts
- **Editable prompts**: View and customize the Director's instructions
- **Player exclusion**: Automatically excludes the player's name from selection
- **Group strategy integration**: Seamlessly integrates into SillyTavern's Group Reply Strategy dropdown
- **JSON output format**: Reliable structured output for consistent character selection

## Installation

Paste this URL into SillyTavern's **Install Extension** input:
```
https://github.com/ficklef0x/sillytavern-SmartDirector
```

Then enable **Smart Director** from the Extensions panel (cubes icon).

## Usage

1. **Enable the extension** in the Extensions settings panel.
2. **Select Smart Director** from the Group Reply Strategy dropdown in your group chat.
3. The Director will automatically run after each message and select the next speaker.

### Settings

- **API Mode**: Auto-detect (uses your current API) or Custom (define your own URL/key)
- **Model Override**: Manually specify a model (e.g., `gemini-2.5-pro`, `deepseek-chat`). Leave blank to use the currently selected SillyTavern model.
- **Max Tokens**: Limit how many tokens the Director can use for its response (default 200). Increase for reasoning models that need more space.
- **Prompt Preset**: Choose from built-in templates or edit your own
- **Director Prompt**: View and customize the prompt sent to the AI. Uses macros:
  - `{{characters}}` - List of active characters
  - `{{notChar}}` - Names to exclude (player)
  - `{{history}}` - Recent chat history
- **Max History Messages**: How many messages to include in the Director's context
- **Auto-trigger**: Automatically run after each message

## How It Works

1. When a message is sent in a group with Smart Director strategy:
   - The extension captures recent chat history
   - Builds a prompt asking the AI to select the next speaker
   - Sends the prompt to the configured API
   - Parses the JSON response to extract the chosen character name
   - Triggers generation for that specific character

2. The Director considers:
   - Conversation flow and context
   - Character motivations and personalities
   - Story progression and dramatic timing
   - Player exclusion rules

## Prompt Presets

### Default
Standard prompt for well-behaved models. Instructs the Director to pick one character and output JSON.

### Thinking Models
Ultra-constrained prompt for reasoning models (Claude 3.7, DeepSeek-R1, o3, etc.) that tend to overthink. Explicitly forbids explanations and reasoning.

### XML Tagged
Uses `<speaker>` tags for clean extraction. Compatible with models that support structured XML output.

### Custom
Edit the prompt directly. The prompt supports three macros:
- `{{characters}}` - Active group members
- `{{notChar}}` - Excluded names (player characters)
- `{{history}}` - Recent conversation

## Requirements

- SillyTavern (latest stable version)
- A configured API (OpenAI, Claude, Kobold, TextGen, or custom)
- Group chat with multiple characters

## Troubleshooting

**Blank user messages**: When using Smart Director with an empty send box (Continue), a blank message may briefly appear and be automatically removed. This is normal behavior due to how SillyTavern handles group strategies.

**Director picks wrong character**: Check that:
- Character names in the group match exactly
- The API is responding with valid JSON
- Try a different prompt preset

**API errors**: Verify your API configuration in SillyTavern's main settings, or switch to Custom API mode and check your URL/key.

## License

MIT License - feel free to use, modify, and distribute.

## Author

vibecoded with kimi 2.6 and gemma 4 by ficklef0x

## Version History

- **1.0.3** - Robust parsing + configurable token limit:
  - Restores 8 fallback parsing strategies for messy model output (newlines, markdown blocks, XML tags, fuzzy matching, etc.).
  - Adds a configurable **Max Tokens** setting so you can tune the Director's response length.
  - Brings back `[Smart Director]` console logging for easier debugging.
- **1.0.2** - Model override fix (thanks again to RetiredHippie on the SillyTavern Discord):
  - Adds a **Model Override** input field so you can manually specify which model the Director uses.
  - Falls back to the currently selected SillyTavern model when left blank.
- **1.0.1** - API compatibility fix (thanks to RetiredHippie on the SillyTavern Discord):
  - Adds the missing `model` parameter for OpenAI/custom API requests.
  - Switches message role from `system` to `user` for broader provider compatibility.
  - Expands token limits to prevent response truncation on reasoning models.
- **1.0.0** - Initial release as Smart Director. AI-powered next speaker selection for group chats with API autodetect, JSON output, prompt presets, and group strategy integration.
