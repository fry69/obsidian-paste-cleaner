import {App, Plugin, PluginSettingTab, Setting, TextAreaComponent} from 'obsidian';

interface PasteCleanerSettings {
	removalRules: string[];
	isRegex: boolean[];
	settingsFormatVersion: number;
	debugMode: boolean;
}

const DEFAULT_SETTINGS: PasteCleanerSettings = {
	removalRules: [
		"?utm_source=chatgpt.com",
		"[?&](utm_medium|utm_campaign|utm_content|fbclid|gclid)=[^&\\s]*",
	],
	isRegex: [
		false,
		true,
	],
	settingsFormatVersion: 2,
	debugMode: false,
}

class RemovalRule {
	pattern: RegExp;
	isRegex: boolean;
	original: string;

	constructor(pattern: string, isRegex: boolean) {
		this.original = pattern;
		this.isRegex = isRegex;
		if (isRegex) {
			// Ensure the regex has the global flag for multiple replacements
			this.pattern = new RegExp(pattern, 'g');
		} else {
			// For literal strings, escape special regex characters and make it global
			const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			this.pattern = new RegExp(escaped, 'g');
		}
	}
}

export default class PasteCleaner extends Plugin {
	settings: PasteCleanerSettings;
	rules: RemovalRule[];

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new PasteCleanerSettingsTab(this.app, this));

		this.registerEvent(this.app.workspace.on("editor-paste", (event) => this.onPaste(event)));
	}

	onPaste(event: ClipboardEvent) {
		if (event.defaultPrevented) {
			if (this.settings.debugMode) {
				console.log("Paste event already prevented, skipping rules.");
			}
			return;
		}

		const types = event.clipboardData?.types;
		if (this.settings.debugMode) {
			console.log("Paste Cleaner: clipboard content types:", types);
		}

		// Check if text/plain is available (don't require it to be the ONLY type)
		if (!types || !Array.from(types).includes("text/plain")) {
			if (this.settings.debugMode) {
				console.log("Paste Cleaner: No text/plain content available, skipping.");
			}
			return;
		}

		const plainText = event.clipboardData?.getData("text/plain");
		if (plainText === undefined || plainText === "") {
			if (this.settings.debugMode) {
				console.log("Paste Cleaner: Empty text/plain content, skipping.");
			}
			return;
		}

		const result = this.applyRules(plainText);
		if (this.settings.debugMode) {
			console.log(`Paste Cleaner: Original length: ${plainText.length}, Result length: ${result.length}`);
			console.log(`Paste Cleaner: '${plainText}' -> '${result}'`);
		}

		if (result !== plainText) {
			this.app.workspace.activeEditor?.editor?.replaceSelection(result);
			event.preventDefault();
		}
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.compileRules();
	}

	compileRules() {
		this.rules = [];
		const minIndex = Math.min(this.settings.removalRules.length, this.settings.isRegex.length);
		for (let i = 0; i < minIndex; i++) {
			try {
				this.rules.push(
					new RemovalRule(this.settings.removalRules[i], this.settings.isRegex[i])
				);
			} catch (e) {
				if (this.settings.debugMode) {
					console.error(`Failed to compile rule "${this.settings.removalRules[i]}":`, e);
				}
			}
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	public applyRules(source: string | null | undefined): string {
		if (source === undefined || source === null) {
			return "";
		}

		let result = source;

		// Apply all rules, removing all occurrences of each pattern
		for (const rule of this.rules) {
			// Reset the regex lastIndex to ensure it matches from the beginning
			rule.pattern.lastIndex = 0;
			result = result.replace(rule.pattern, "");
		}

		return result;
	}
}

class PasteCleanerSettingsTab extends PluginSettingTab {
	plugin: PasteCleaner;
	private testInputValue = "";

	constructor(app: App, plugin: PasteCleaner) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		let trySource: TextAreaComponent | null = null;
		let tryDest: TextAreaComponent | null = null;

		const plugin = this.plugin;
		const handleChanges = () => {
			try {
				tryDest?.setValue(plugin.applyRules(trySource?.getValue()));
			} catch (e) {
				tryDest?.setValue("ERROR:\n" + e);
			}
		};

		// Description header
		containerEl.createEl("h2", {text: "Removal Rules"});
		containerEl.createEl("p", {
			text: "Define patterns to remove from pasted content. Rules are applied in order."
		});

		// Create grid container for rules
		const rulesContainer = containerEl.createDiv("paste-cleaner-rules-grid");

		// Add grid header
		rulesContainer.createEl("div", {text: "Pattern", cls: "paste-cleaner-header"});
		rulesContainer.createEl("div", {text: "Regex", cls: "paste-cleaner-header"});
		rulesContainer.createEl("div", {text: "", cls: "paste-cleaner-header"}); // Empty for delete column

		// Helper function to create a rule row
		const createRuleSetting = (index: number) => {
			// Column 1: Pattern input (plain text input for simplicity)
			const patternCell = rulesContainer.createDiv("paste-cleaner-cell");
			const textInput = patternCell.createEl("input", {
				type: "text",
				placeholder: "Text or pattern to remove",
				value: plugin.settings.removalRules[index] || "",
				cls: "paste-cleaner-input"
			});
			textInput.addEventListener("input", async (e) => {
				const target = e.target as HTMLInputElement;
				plugin.settings.removalRules[index] = target.value;
				try {
					plugin.compileRules();
					await plugin.saveSettings();
					handleChanges();
				} catch (e) {
					console.error("Failed to update rule:", e);
				}
			});

			// Column 2: Regex toggle (using Obsidian's Setting API)
			const toggleCell = rulesContainer.createDiv("paste-cleaner-cell");
			new Setting(toggleCell)
				.addToggle(toggle => {
					toggle
						.setValue(plugin.settings.isRegex[index] || false)
						.setTooltip("Enable for regex pattern, disable for literal text")
						.onChange(async (value) => {
							plugin.settings.isRegex[index] = value;
							try {
								plugin.compileRules();
								await plugin.saveSettings();
								handleChanges();
							} catch (e) {
								console.error("Failed to update rule type:", e);
							}
						});
				});

			// Column 3: Delete button
			const deleteCell = rulesContainer.createDiv("paste-cleaner-cell");
			new Setting(deleteCell)
				.addExtraButton(button => {
					button
						.setIcon("trash")
						.setTooltip("Delete rule")
						.onClick(async () => {
							plugin.settings.removalRules.splice(index, 1);
							plugin.settings.isRegex.splice(index, 1);
							try {
								plugin.compileRules();
								await plugin.saveSettings();
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
		new Setting(containerEl)
			.addButton(button => {
				button
					.setButtonText("Add new rule")
					.setCta()
					.onClick(async () => {
						plugin.settings.removalRules.push("");
						plugin.settings.isRegex.push(false);
						await plugin.saveSettings();
						this.display(); // Refresh the display
					});
			});

		// Test area header
		containerEl.createEl("h3", {text: "Test your rules"});

		// Test input with clear button in description
		const testInputSetting = new Setting(containerEl)
			.setName("Test input")
			.addTextArea(ta => {
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
		descEl.createSpan({text: "Paste or type test content here to see what gets removed."});
		descEl.createEl("br");
		descEl.createEl("br");
		const clearButton = descEl.createEl("a", {
			text: "Clear test content",
			cls: "paste-cleaner-clear-link"
		});
		clearButton.addEventListener("click", (e) => {
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
			.addTextArea(ta => {
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
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.debugMode);
				toggle.onChange(async (value) => {
					this.plugin.settings.debugMode = value;
					await this.plugin.saveSettings();
				});
			});
	}
}
