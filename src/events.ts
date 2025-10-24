/*
  Paste Cleaner Obsidian Plugin
  https://github.com/fry69/obsidian-paste-cleaner
  Copyright (c) 2025 fry69
  Licensed under the MIT license, see LICENSE file for details.
*/

import { applyRules } from "./rule.ts";
import type PasteCleaner from "./main.ts";

export function onPaste(this: PasteCleaner, event: ClipboardEvent) {
  if (event.defaultPrevented) {
    if (this.settings.debugMode) {
      console.debug("Paste event already prevented, skipping rules.");
    }
    return;
  }

  const types = event.clipboardData?.types;
  if (this.settings.debugMode) {
    console.debug("Paste Cleaner: clipboard content types:", types);
  }

  // Check if text/plain is available (don't require it to be the ONLY type)
  if (!types || !Array.from(types).includes("text/plain")) {
    if (this.settings.debugMode) {
      console.debug("Paste Cleaner: No text/plain content available, skipping.");
    }
    return;
  }

  const plainText = event.clipboardData?.getData("text/plain");
  if (plainText === undefined || plainText === "") {
    if (this.settings.debugMode) {
      console.debug("Paste Cleaner: Empty text/plain content, skipping.");
    }
    return;
  }

  const result = applyRules(plainText, this.rules);
  if (this.settings.debugMode) {
    console.debug(
      `Paste Cleaner: Original length: ${plainText.length}, Result length: ${result.length}`,
    );
    console.debug(`Paste Cleaner: '${plainText}' -> '${result}'`);
  }

  if (result !== plainText) {
    this.app.workspace.activeEditor?.editor?.replaceSelection(result);
    event.preventDefault();
  }
}
