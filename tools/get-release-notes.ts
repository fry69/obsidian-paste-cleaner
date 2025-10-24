#!/usr/bin/env node
/**
 * Outputs the changelog entry for the specified version.
 *
 * Usage:
 *   node tools/get-release-notes.ts [version]
 *
 * If no version argument is provided, the version from manifest/package.json
 * (via getProjectInfo) is used.
 */

import { exit } from "node:process";
import { parseChangelog, getProjectInfo } from "./release-utils.ts";

async function main() {
  const versionArg = process.argv[2];
  const targetVersion = versionArg?.trim() || (await getProjectInfo()).version;

  if (!targetVersion) {
    console.error("ERROR: No version supplied and unable to determine current version.");
    exit(1);
  }

  const changelog = await parseChangelog();

  const matchingEntry = changelog.entries.find(
    (entry) => (entry.version ?? "").toLowerCase() === targetVersion.toLowerCase(),
  );

  if (!matchingEntry || !matchingEntry.content) {
    console.error(`ERROR: Could not find changelog entry for version ${targetVersion}.`);
    exit(1);
  }

  const body = `${matchingEntry.header}\n\n${matchingEntry.content}`.trimEnd();
  console.log(body);
}

main().catch((error) => {
  console.error("ERROR:", error?.message ?? error);
  exit(1);
});
