#!/usr/bin/env node
/**
 * Extract project metadata for the Obsidian plugin
 *
 * Reads manifest.json for plugin-specific data and package.json for build tasks.
 * Outputs metadata in GitHub Actions output format.
 *
 * This tool is used by the release workflow.
 *
 * @module
 */

import { join } from "node:path";
import { readFileSync } from "node:fs";

/** Version of the get-meta tool */
export const VERSION = "0.0.6"; // Updated version
const ROOT_DIR = process.cwd();

// Helper: Read and parse JSON file
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getJson(filePath: string): any {
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (error.code === "ENOENT") {
      return null;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERROR: Failed to read or parse ${filePath}:`, message);
    process.exit(1);
  }
}

// Read manifest.json for plugin metadata
const manifest = getJson(join(ROOT_DIR, "manifest.json"));
if (!manifest) {
  console.error("ERROR: manifest.json not found.");
  process.exit(1);
}

const id = manifest.id as string;
const version = manifest.version as string;

if (!id) {
  console.error("ERROR: 'id' field is required in manifest.json");
  process.exit(1);
}
if (!version) {
  console.error("ERROR: 'version' field is required in manifest.json");
  process.exit(1);
}

// Read package.json to check for build task
const packageJson = getJson(join(ROOT_DIR, "package.json"));

if (packageJson === null) {
  console.error("ERROR: package.json not found.");
  process.exit(1);
}

// Check if a build script is defined
const hasBuildTask =
  packageJson &&
  packageJson.scripts &&
  typeof packageJson.scripts === "object" &&
  "build" in packageJson.scripts;

// Output to stdout in format: tool_name=<name>\ntool_version=<version>\nhas_build_task=<true|false>
console.log(
  `tool_name=${id}\ntool_version=${version}\nhas_build_task=${hasBuildTask ? "true" : "false"}`,
);
