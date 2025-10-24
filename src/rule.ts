/*
	Paste Cleaner Obsidian Plugin
	https://github.com/fry69/obsidian-paste-cleaner
	Copyright (c) 2025 fry69
	Licensed under the MIT license, see LICENSE file for details.
*/

export class RemovalRule {
  pattern: RegExp;
  isRegex: boolean;
  original: string;

  constructor(pattern: string, isRegex: boolean) {
    if (pattern === undefined || pattern === null) {
      throw new Error("Pattern must be provided.");
    }
    if (pattern.length === 0) {
      throw new Error("Pattern cannot be empty.");
    }

    this.original = pattern;
    this.isRegex = isRegex;
    if (isRegex) {
      // Ensure the regex has the global flag for multiple replacements
      this.pattern = new RegExp(pattern, "g");
    } else {
      // For literal strings, escape special regex characters and make it global
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      this.pattern = new RegExp(escaped, "g");
    }
  }
}

export function applyRules(source: string | null | undefined, rules: RemovalRule[]): string {
  if (source === undefined || source === null) {
    return "";
  }

  let result = source;

  // Apply all rules, removing all occurrences of each pattern
  for (const rule of rules) {
    // Reset the regex lastIndex to ensure it matches from the beginning
    rule.pattern.lastIndex = 0;
    result = result.replace(rule.pattern, "");
  }

  return result;
}
