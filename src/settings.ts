/*
	Paste Cleaner Obsidian Plugin
	https://github.com/fry69/obsidian-paste-cleaner
	Copyright (c) 2025 fry69
	Licensed under the MIT license, see LICENSE file for details.
*/

export interface PasteCleanerSettings {
  removalRules: string[];
  isRegex: boolean[];
  settingsFormatVersion: number;
  debugMode: boolean;
}

export const DEFAULT_SETTINGS: PasteCleanerSettings = {
  removalRules: [
    "?utm_source=chatgpt.com",
    "[?&](utm_medium|utm_campaign|utm_content|fbclid|gclid)=[^&\\s]*",
  ],
  isRegex: [false, true],
  settingsFormatVersion: 2,
  debugMode: false,
};
