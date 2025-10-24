/*
	Paste Cleaner Obsidian Plugin
	https://github.com/fry69/obsidian-paste-cleaner
	Copyright (c) 2025 fry69
	Licensed under the MIT license, see LICENSE file for details.
*/

import { PluginSettingTab, Setting } from "obsidian";
import type { App, ButtonComponent, TextAreaComponent } from "obsidian";
import type PasteCleaner from "../main.ts";
import { applyRules } from "../rule.ts";

export class PasteCleanerSettingsTab extends PluginSettingTab {
  plugin: PasteCleaner;
  private testInputValue = "";

  constructor(app: App, plugin: PasteCleaner) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    let trySource: TextAreaComponent | null = null;
    let tryDest: TextAreaComponent | null = null;
    let addRuleButton: ButtonComponent | null = null;

    const plugin = this.plugin;
    const updateAddRuleButton = () => {
      if (!addRuleButton) {
        return;
      }

      const rules = plugin.settings.removalRules;
      const lastRule = rules.length > 0 ? rules[rules.length - 1] : undefined;
      const hasEmptyTail = lastRule !== undefined && lastRule.trim().length === 0;

      addRuleButton
        .setDisabled(hasEmptyTail)
        .setTooltip(hasEmptyTail ? "Fill the current rule before adding another" : "");
    };

    const handleChanges = () => {
      try {
        tryDest?.setValue(applyRules(trySource?.getValue(), plugin.rules));
      } catch (e) {
        tryDest?.setValue("ERROR:\n" + e);
      }
    };

    new Setting(containerEl)
      .setHeading()
      .setName("Removal rules")
      .setDesc("Define patterns to remove from pasted content. Rules are applied in order.");

    // Create grid container for rules
    const rulesContainer = containerEl.createDiv("paste-cleaner-rules-grid");

    // Add grid header
    rulesContainer.createEl("div", {
      text: "Regex",
      cls: "paste-cleaner-header",
    });
    rulesContainer.createEl("div", {
      text: "Pattern",
      cls: "paste-cleaner-header",
    });
    rulesContainer.createEl("div", {
      text: "\u00A0", // Non-breaking space for delete column
      cls: "paste-cleaner-header",
    });

    // Helper function to create a rule row
    const createRuleSetting = (index: number) => {
      // Column 1: Regex toggle
      const toggleCell = rulesContainer.createDiv("paste-cleaner-cell");
      new Setting(toggleCell).addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.isRegex[index] || false)
          .setTooltip("Enable for regex pattern, disable for literal text")
          .onChange(async (value) => {
            this.plugin.settings.isRegex[index] = value;
            try {
              this.plugin.compileRules();
              await this.plugin.saveSettings();
              handleChanges();
            } catch (e) {
              console.error("Failed to update rule type:", e);
            }
          });
      });

      // Column 2: Pattern input
      const patternCell = rulesContainer.createDiv("paste-cleaner-cell");
      new Setting(patternCell).addText((text) => {
        text.inputEl.addClass("paste-cleaner-input");
        text
          .setPlaceholder("Text or pattern to remove")
          .setValue(this.plugin.settings.removalRules[index] || "")
          .onChange(async (value) => {
            this.plugin.settings.removalRules[index] = value;
            try {
              this.plugin.compileRules();
              await this.plugin.saveSettings();
              handleChanges();
              updateAddRuleButton();
            } catch (e) {
              console.error("Failed to update rule:", e);
            }
          });
      });

      // Column 3: Delete button
      const deleteCell = rulesContainer.createDiv("paste-cleaner-cell");
      new Setting(deleteCell).addExtraButton((button) => {
        button
          .setIcon("trash")
          .setTooltip("Delete rule")
          .onClick(async () => {
            this.plugin.settings.removalRules.splice(index, 1);
            this.plugin.settings.isRegex.splice(index, 1);
            try {
              this.plugin.compileRules();
              await this.plugin.saveSettings();
              handleChanges();
              this.display(); // Refresh the display
            } catch (e) {
              console.error("Failed to delete rule:", e);
            }
          });
      });
    };

    // Create rows for existing rules
    for (let i = 0; i < plugin.settings.removalRules.length; i++) {
      createRuleSetting(i);
    }

    // Add new rule button
    new Setting(containerEl).addButton((button) => {
      addRuleButton = button;
      button
        .setButtonText("Add new rule")
        .setCta()
        .onClick(async () => {
          const rules = plugin.settings.removalRules;
          if (rules.length > 0 && rules[rules.length - 1].trim().length === 0) {
            return;
          }

          plugin.settings.removalRules.push("");
          plugin.settings.isRegex.push(false);
          await plugin.saveSettings();
          this.display(); // Refresh the display
        });
      updateAddRuleButton();
    });

    new Setting(containerEl).setHeading().setName("Test your rules");

    // Test input with clear button in description
    const testInputSetting = new Setting(containerEl).setName("Test input").addTextArea((ta) => {
      trySource = ta;
      ta.setPlaceholder("Paste test content here...");

      // Restore the previous test input value
      ta.setValue(this.testInputValue);

      // Make textarea larger
      ta.inputEl.rows = 6;
      ta.inputEl.cols = 50;
      ta.inputEl.addClass("paste-cleaner-test-textarea");

      ta.onChange((value) => {
        // Save the test input value so it persists across display() calls
        this.testInputValue = value;
        handleChanges();
      });
    });

    // Add clear button to the description area to save horizontal space
    const descEl = testInputSetting.descEl;
    descEl.empty();
    descEl.createSpan({
      text: "Paste or type test content here to see what gets removed.",
    });
    descEl.createEl("br");
    descEl.createEl("br");
    const clearButton = descEl.createEl("a", {
      text: "Clear test content",
      cls: "paste-cleaner-clear-link",
    });
    clearButton.addEventListener("click", (e: PointerEvent) => {
      e.preventDefault();
      this.testInputValue = "";
      if (trySource) {
        trySource.setValue("");
        handleChanges();
      }
    });

    // Test output
    new Setting(containerEl)
      .setName("Test result")
      .setDesc("This shows what the content looks like after applying the removal rules")
      .addTextArea((ta) => {
        tryDest = ta;
        ta.setPlaceholder("Result will appear here...");
        ta.setDisabled(true);

        // Make textarea larger
        ta.inputEl.rows = 6;
        ta.inputEl.cols = 50;
        ta.inputEl.addClass("paste-cleaner-test-textarea");

        // Update the result after creating the textarea
        handleChanges();
      });

    // Debug mode toggle
    new Setting(containerEl)
      .setName("Debug mode")
      .setDesc("Enable console logging for troubleshooting")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.debugMode);
        toggle.onChange(async (value) => {
          this.plugin.settings.debugMode = value;
          await this.plugin.saveSettings();
        });
      });

    updateAddRuleButton();
  }
}
