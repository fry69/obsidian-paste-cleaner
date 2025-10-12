# Obsidian Paste Cleaner

Automatically removes unwanted strings from pasted content in Obsidian.

## Installation

1. Enable the plugin in Obsidian settings
2. Configure removal rules in Settings → Paste Cleaner
3. Paste content anywhere in Obsidian

## Usage

### Adding Rules

1. Go to Settings → Paste Cleaner
2. Click "Add new rule"
3. Enter the text or pattern to remove
4. Enable "Regex" toggle for regular expressions, leave off for literal text
5. Delete rules using the trash icon

### Rule Types

**Literal text** (Regex OFF):
- Matches exact text
- Special characters are automatically escaped
- Example: `?utm_source=chatgpt.com`

**Regular expressions** (Regex ON):
- Uses JavaScript RegExp syntax with global matching
- All matched patterns are removed, unmatched text is preserved
- Example: `[?&](utm_medium|utm_campaign|fbclid)=[^&\s]*`
  - Removes: tracking parameters like `&utm_medium=social` or `?fbclid=abc123`
  - Preserves: URLs and other text not matching the pattern

### Testing Rules

Use the test area in settings to preview rule behavior before applying them to actual pastes.

## Technical Details

- Processes `text/plain` clipboard content
- Applies rules in order from top to bottom
- Removes all occurrences of each pattern
- Works with multi-format clipboards (text/html, text/plain, etc.)

## Example

**Rules:**
1. Literal: `?utm_source=chatgpt.com` (Regex OFF)
2. Regex: `[?&](utm_medium|utm_campaign|utm_content|fbclid|gclid)=[^&\s]*` (Regex ON)

**Input:**
```
https://example.com?utm_source=chatgpt.com
https://example.com?fbclid=this
https://example.com?test&gclid=asdfasdf text
```

**Output:**
```
https://example.com
https://example.com
https://example.com?test text
```

## Troubleshooting

**Plugin not working:**
- Enable debug mode and check browser console (Ctrl+Shift+I / Cmd+Option+I)
- Verify rules in the test area
- Ensure regex patterns are valid
- Reload Obsidian (Ctrl+R / Cmd+R)

**Nothing removed:**
- Check that pattern matches the text exactly
- Verify Regex toggle is set correctly
- Test in the test area first
- Check for leading/trailing whitespace in rules

**Reordering rules:**
- Delete and recreate rules in desired order
- Rules apply top to bottom

## Development

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run dev
```

### Manual Installation

Copy `main.js`, `styles.css`, `manifest.json` to:
```
<vault>/.obsidian/plugins/paste-cleaner/
```

### Release Process

1. Update version in `manifest.json` and `minAppVersion`
2. Update `versions.json` with version mapping
3. Create GitHub release (tag = version number, no `v` prefix)
4. Attach `manifest.json`, `main.js`, `styles.css` to release

Or use: `npm version patch|minor|major`

### Code Quality

Run ESLint:
```bash
npm install -g eslint
eslint main.ts
```

## Acknowledgments

An early draft of this plugin was based on [obsidian-paste-transform](https://github.com/rekby/obsidian-paste-transform) by [Timofey Koolin](https://github.com/rekby) (Apache-2.0 license), but was completely rewritten to focus on pattern removal rather than transformation.

## License

MIT License - see [LICENSE](LICENSE) file for details.
