#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { valid } from "semver-ts";

const ROOT_DIR = process.cwd();

export interface ProjectInfo {
  id: string;
  version: string;
  minAppVersion: string;
  pkgVersion: string;
  versions: Record<string, string>;
}

export async function getProjectInfo(): Promise<ProjectInfo> {
  const manifestPath = join(ROOT_DIR, "manifest.json");
  const packagePath = join(ROOT_DIR, "package.json");
  const versionsPath = join(ROOT_DIR, "versions.json");

  const [manifestContent, packageContent, versionsContent] = await Promise.all([
    readFile(manifestPath, "utf-8"),
    readFile(packagePath, "utf-8"),
    readFile(versionsPath, "utf-8"),
  ]);

  const manifest = JSON.parse(manifestContent);
  const pkg = JSON.parse(packageContent);
  const versions = JSON.parse(versionsContent);

  if (!manifest.version) throw new Error("No version found in manifest.json");
  if (!manifest.id) throw new Error("No id found in manifest.json");
  if (!manifest.minAppVersion) {
    throw new Error("No minAppVersion found in manifest.json");
  }
  if (!pkg.version) throw new Error("No version found in package.json");

  return {
    id: manifest.id,
    version: manifest.version,
    minAppVersion: manifest.minAppVersion,
    pkgVersion: pkg.version,
    versions,
  };
}

export function checkVersionCoherency(info: ProjectInfo) {
  if (info.version !== info.pkgVersion) {
    throw new Error(
      `Version mismatch: manifest.json has ${info.version}, but package.json has ${info.pkgVersion}.`,
    );
  }
  if (!info.versions[info.version]) {
    throw new Error(`Version ${info.version} not found in versions.json.`);
  }
}

export interface ChangelogEntry {
  version: string | null;
  header: string;
  content: string;
}

export interface ParsedChangelog {
  title: string;
  description: string;
  entries: ChangelogEntry[];
  warnings: string[];
}

export async function parseChangelog(): Promise<ParsedChangelog> {
  const changelogPath = join(ROOT_DIR, "CHANGELOG.md");
  const content = await readFile(changelogPath, "utf-8");
  const lines = content.split(/\r?\n/);

  const title = lines.find((line) => line.startsWith("# "))?.trim() || "Changelog";
  let description = "";
  const entries: ChangelogEntry[] = [];
  const warnings: string[] = [];
  let currentEntry: ChangelogEntry | null = null;

  let firstHeaderFound = false;
  for (const line of lines) {
    const match = line.match(/^##(?!#)\s*(.*)/);
    if (match) {
      firstHeaderFound = true;
      if (currentEntry) {
        entries.push({ ...currentEntry, content: currentEntry.content.trim() });
      }

      const header = line.trim();
      const headerText = match[1].trim();
      const versionMatch = headerText.match(
        /(?:\(|\[)?\s*v?([0-9]+\.[0-9]+\.[0-9]+(?:[-+._][0-9A-Za-z.-]+)?)\s*(?:\)|\])?/,
      );
      let version: string | null = null;
      if (versionMatch) {
        const normalized = versionMatch[1].trim();
        const semver = valid(normalized);
        if (semver) {
          version = semver;
        } else {
          warnings.push(
            `CHANGELOG.md: Header "${header}" does not contain a valid SemVer identifier.`,
          );
        }
      } else if (headerText.toLowerCase().includes("unreleased")) {
        version = "unreleased";
      }

      currentEntry = { version, header, content: "" };
    } else if (currentEntry) {
      currentEntry.content += line + "\n";
    } else if (!firstHeaderFound && !line.startsWith("# ")) {
      description += line + "\n";
    }
  }

  if (currentEntry) {
    entries.push({ ...currentEntry, content: currentEntry.content.trim() });
  }

  // Handle case where there's content before the first version header
  const unreleasedContent = description.trim();
  if (unreleasedContent && !entries.some((e) => e.version === "unreleased")) {
    const unreleasedEntry: ChangelogEntry = {
      version: "unreleased",
      header: "## [Unreleased]",
      content: unreleasedContent,
    };

    entries.unshift(unreleasedEntry);
    description = "";
  }
  if (!entries.some((e) => e.version === "unreleased")) {
    warnings.push("CHANGELOG.md: Missing [Unreleased] section; creating an empty placeholder.");
    entries.unshift({
      version: "unreleased",
      header: "## [Unreleased]",
      content: "",
    });
  }

  const unreleasedEntry = entries.find((e) => e.version === "unreleased");
  if (unreleasedEntry && unreleasedEntry.content.trim().length === 0) {
    warnings.push("CHANGELOG.md: Unreleased section is empty.");
  }

  return { title, description: description.trim(), entries, warnings };
}

export async function updateChangelog(
  parsed: ParsedChangelog,
  nextVersion: string,
): Promise<string> {
  const changelogPath = join(ROOT_DIR, "CHANGELOG.md");
  const today = new Date().toISOString().split("T")[0];

  const unreleased = parsed.entries.find((e) => e.version === "unreleased");
  if (!unreleased || !unreleased.content) {
    throw new Error("No unreleased changes found in CHANGELOG.md.");
  }

  // Create new header for the release
  const newHeader = `## [${nextVersion}] - ${today}`;
  const newEntry: ChangelogEntry = {
    version: nextVersion,
    header: newHeader,
    content: unreleased.content,
  };

  // Filter out the old unreleased entry and add the new entry at the top
  const otherEntries = parsed.entries.filter((e) => e.version !== "unreleased");
  const newEntries = [newEntry, ...otherEntries];

  // Create a new clean unreleased section
  const newUnreleasedSection = "## [Unreleased]";

  // Reconstruct the changelog
  let newContent = `${parsed.title}

`;
  if (parsed.description) {
    newContent += `${parsed.description}

`;
  }
  newContent += `${newUnreleasedSection}

`;

  for (const entry of newEntries) {
    newContent += `${entry.header}

${entry.content}

`;
  }

  // Remove trailing whitespace and ensure a single newline at the end
  newContent = newContent.trim() + "\n";

  await writeFile(changelogPath, newContent);

  return newEntry.content;
}
