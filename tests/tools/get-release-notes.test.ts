/**
 * Unit tests for tools/get-release-notes.ts
 *
 * Ensures release notes can be extracted from CHANGELOG.md entries.
 */

import { expect, test } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function setupProject(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "get-release-notes-"));
  const cleanup = async () => {
    await rm(dir, { recursive: true, force: true });
  };

  try {
    await writeFile(
      join(dir, "manifest.json"),
      JSON.stringify({ id: "test", version: "1.2.3", minAppVersion: "1.0.0" }, null, 2),
    );
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "test", version: "1.2.3", scripts: {} }, null, 2),
    );
    await writeFile(join(dir, "versions.json"), JSON.stringify({ "1.2.3": "1.0.0" }, null, 2));
    await writeFile(
      join(dir, "CHANGELOG.md"),
      `# Changelog

## [Unreleased]

- Upcoming change

## [1.2.3] - 2025-01-01

- Fixed bugs
- Added feature
`,
    );

    return { dir, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function runGetReleaseNotes(
  cwd: string,
  args: string[] = [],
): Promise<{ stdout: string; stderr: string; code: number }> {
  const scriptPath = join(process.cwd(), "tools", "get-release-notes.ts");
  try {
    const { stdout, stderr } = await execFileAsync("node", [scriptPath, ...args], {
      cwd,
      env: {
        ...process.env,
      },
    });
    return { stdout, stderr, code: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      code: error.code ?? 1,
    };
  }
}

test("get-release-notes: extracts entry for current version by default", async () => {
  const project = await setupProject();
  try {
    const result = await runGetReleaseNotes(project.dir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("## [1.2.3] - 2025-01-01");
    expect(result.stdout).toContain("Fixed bugs");
    expect(result.stdout).toContain("Added feature");
  } finally {
    await project.cleanup();
  }
});

test("get-release-notes: extracts entry for provided version", async () => {
  const project = await setupProject();
  try {
    const result = await runGetReleaseNotes(project.dir, ["1.2.3"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("## [1.2.3] - 2025-01-01");
  } finally {
    await project.cleanup();
  }
});

test("get-release-notes: fails when entry not found", async () => {
  const project = await setupProject();
  try {
    const result = await runGetReleaseNotes(project.dir, ["9.9.9"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Could not find changelog entry for version 9.9.9");
  } finally {
    await project.cleanup();
  }
});
