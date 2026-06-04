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

1. Download or clone this repository into your SillyTavern extensions folder:
   ```
   SillyTavern/public/scripts/extensions/third-party/
   ```

2. Restart SillyTavern or reload extensions.

3. In SillyTavern, go to **Extensions** panel (cubes icon) and enable **Smart Director**.

## Usage

1. **Enable the extension** in the Extensions settings panel.
2. **Select Smart Director** from the Group Reply Strategy dropdown in your group chat.
3. The Director will automatically run after each message and select the next speaker.

### Settings

- **API Mode**: Auto-detect (uses your current API) or Custom (define your own URL/key)
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

Created by ficklef0x

## Version History

- **1.0** - Initial release
