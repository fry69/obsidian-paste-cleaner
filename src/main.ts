/*
	Paste Cleaner Obsidian Plugin
	https://github.com/fry69/obsidian-paste-cleaner
	Copyright (c) 2025 fry69
	Licensed under the MIT license, see LICENSE file for details.

	Version 0.3.0
*/

import { Plugin } from "obsidian";
import type { App, PluginManifest } from "obsidian";
import { onPaste } from "./events.ts";
import { RemovalRule } from "./rule.ts";
import { DEFAULT_SETTINGS, type PasteCleanerSettings } from "./settings.ts";
import { PasteCleanerSettingsTab } from "./ui/settingsTab.ts";

export default class PasteCleaner extends Plugin {
  settings: PasteCleanerSettings = DEFAULT_SETTINGS;
  rules: RemovalRule[] = [];

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
  }

  override async onload() {
    await this.loadSettings();

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new PasteCleanerSettingsTab(this.app, this));

    this.registerEvent(this.app.workspace.on("editor-paste", onPaste.bind(this)));
  }

  override onunload() {}

  async loadSettings() {
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded) as PasteCleanerSettings;

    this.settings.removalRules = Array.isArray(this.settings.removalRules)
      ? [...this.settings.removalRules]
      : [...DEFAULT_SETTINGS.removalRules];

    this.settings.isRegex = Array.isArray(this.settings.isRegex)
      ? [...this.settings.isRegex]
      : [...DEFAULT_SETTINGS.isRegex];

    this.compileRules();
  }

  compileRules() {
    this.rules = [];
    const { removalRules, isRegex } = this.settings;
    const minIndex = Math.min(removalRules.length, isRegex.length);
    for (let i = 0; i < minIndex; i++) {
      const pattern = removalRules[i];
      if (!pattern) {
        if (this.settings.debugMode) {
          console.warn(`Paste Cleaner: Skipping empty removal rule at index ${i}.`);
        }
        continue;
      }

      try {
        const compiledRule = new RemovalRule(pattern, Boolean(isRegex[i]));
        this.rules.push(compiledRule);
      } catch (e) {
        if (this.settings.debugMode) {
          console.error(`Failed to compile rule "${pattern}":`, e);
        }
      }
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
