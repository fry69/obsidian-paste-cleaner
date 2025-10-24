# Obsidian Paste Cleaner

Automatically removes unwanted strings from pasted content in Obsidian.

## Installation

> [!NOTE]
> Until [available](https://github.com/obsidianmd/obsidian-releases/pull/8137#issuecomment-3396033387) in the Obsidian community plugins list, install manually:
>
> Either get the latest release from the [Releases](https://github.com/fry69/obsidian-paste-cleaner/releases) page, or build from source (see [Development](#development)).
>
> Set `VAULT_PATH` to your Obsidian vault path, then run:
> ```shell
> mkdir -p $(VAULT_PATH)/.obsidian/plugins/paste-cleaner
> cp manifest.json main.js styles.css $(VAULT_PATH)/.obsidian/plugins/paste-cleaner/
> ```

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
- Example: `[?&](utm_medium|utm_campaign|fbclid)=[^&]*`
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
2. Regex: `[?&](utm_medium|utm_campaign|utm_content|fbclid|gclid)=[^&]*` (Regex ON)

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

### Copy to Vault

Set `VAULT_PATH` to your Obsidian vault path, then run:
```shell
mkdir -p $(VAULT_PATH)/.obsidian/plugins/paste-cleaner
cp manifest.json main.js styles.css $(VAULT_PATH)/.obsidian/plugins/paste-cleaner/
```

### Release Process

The release process is automated via a script and GitHub Actions.

1.  **Run the release script:**
    This script bumps the version in all necessary files, updates the `CHANGELOG.md`, and creates a git commit and tag.
    ```bash
    # For a patch release
    node tools/release.ts patch

    # For a specific version
    node tools/release.ts 1.2.3
    ```
    The script will then push the commit and tag to GitHub. For pre-releases, use keywords like `prerelease` from a non-default branch.

2.  **GitHub Release Creation:**
    Pushing a tag to GitHub triggers a workflow that builds the plugin and creates a corresponding release with the necessary artifacts (`main.js`, `manifest.json`, `styles.css`).

### Code Quality

This project uses:
- [Obsidian ESLint plugin](https://github.com/obsidianmd/eslint-plugin) for linting
- [Prettier](https://prettier.io/) for code formatting
- [Knip](https://knip.dev/) for unused code detection
- [Typos](https://github.com/crate-ci/typos) for spell checking (needs to be installed globally)

Use the following command to run all checks:

```bash
npm run check
```

## Acknowledgments

An early draft of this plugin was based on [obsidian-paste-transform](https://github.com/rekby/obsidian-paste-transform) by [Timofey Koolin](https://github.com/rekby) (Apache-2.0 license), but was completely rewritten to focus on pattern removal rather than transformation.

## License

MIT License - see [LICENSE](LICENSE) file for details.
