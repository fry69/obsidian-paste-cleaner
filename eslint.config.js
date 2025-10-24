// @ts-nocheck
// eslint.config.js
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";
import typescriptParser from "@typescript-eslint/parser";
import typescriptPlugin from "@typescript-eslint/eslint-plugin";

// Prettier flat config (disables ESLint rules that conflict with Prettier)
import prettierFlat from "eslint-config-prettier/flat";

export default defineConfig([
  // Base config for all TypeScript files
  {
    files: ["**/*.ts"],
    plugins: {
      "@typescript-eslint": typescriptPlugin,
    },
    rules: {
      ...typescriptPlugin.configs.recommended.rules,
    },
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project: true,
        tsx: true,
        tscRoot: import.meta.dirname,
      },
    },
  },
  // Config for src/ folder
  {
    files: ["src/**/*.ts"],
    plugins: {
      ...obsidianmd,
    },
    rules: {
      ...obsidianmd.configs.recommended.rules,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  // Config for tools/ folder
  {
    files: ["tools/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // Config for tests/tools/ folder
  {
    files: ["tests/tools/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // keep project-wide ignores (same as before)
  globalIgnores([
    "node_modules",
    "dist",
    "esbuild.config.mjs",
    "eslint.config.js",
    "version-bump.mjs",
    "versions.json",
    "main.js",
  ]),

  // Put Prettier's "flat" config last so it disables conflicting ESLint rules
  prettierFlat,
]);
