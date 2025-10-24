/**
 * Full workflow integration tests for tools/release.ts
 *
 * Tests the complete release workflow for an Obsidian plugin in isolated
 * temporary directories.
 *
 * Tests cover:
 * - Version bumps (patch, minor, major)
 * - Updates to manifest.json, package.json, versions.json
 * - Changelog integration
 * - Git commit and tag creation (without 'v' prefix)
 * - no-push mode
 */

import { expect, test } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, readFile, mkdir, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

interface TestProject {
  dir: string;
  cleanup: () => Promise<void>;
}

interface ProjectOptions {
  changelog?: string;
}

async function createTestProject(
  name: string,
  version = "1.0.0",
  options: ProjectOptions = {},
): Promise<TestProject> {
  const dir = await mkdtemp(join(tmpdir(), `release-workflow-${name}-`));

  const cleanup = async () => {
    await rm(dir, { recursive: true, force: true });
  };

  try {
    // Create manifest.json
    await writeFile(
      join(dir, "manifest.json"),
      JSON.stringify(
        {
          id: name,
          name: `Test Plugin - ${name}`,
          version,
          minAppVersion: "1.0.0",
          description: "A test plugin",
        },
        null,
        2,
      ),
    );

    // Create package.json
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ version, scripts: { lint: 'echo "Mock lint passed"' } }, null, 2),
    );

    // Create versions.json
    await writeFile(join(dir, "versions.json"), JSON.stringify({ [version]: "1.0.0" }, null, 2));

    // Create CHANGELOG.md
    const changelog =
      options.changelog ??
      `# Changelog

## [Unreleased]

- New stuff for next release.

## [${version}] - 2024-01-01

- Initial release
`;

    await writeFile(join(dir, "CHANGELOG.md"), changelog);

    // Create tools directory and copy required tool scripts
    await mkdir(join(dir, "tools"), { recursive: true });
    const toolsSource = join(process.cwd(), "tools");
    for (const script of ["release.ts", "release-utils.ts"]) {
      await copyFile(join(toolsSource, script), join(dir, "tools", script));
    }

    // Initialize git
    const commands = [
      "git init",
      "git config user.name 'Test User'",
      "git config user.email 'test@example.com'",
      "git add -A",
      "git commit -m 'Initial commit'",
    ];

    for (const cmd of commands) {
      await execAsync(cmd, { cwd: dir });
    }

    return { dir, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function runRelease(
  projectDir: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const scriptPath = join(process.cwd(), "tools", "release.ts");
  try {
    const { stdout, stderr } = await execFileAsync("node", [scriptPath, ...args], {
      cwd: projectDir,
      env: {
        ...process.env,
        NO_COLOR: "true", // Disable ANSI colors for stable output
      },
    });
    return { stdout, stderr, code: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout,
      stderr: error.stderr,
      code: error.code ?? 1,
    };
  }
}

async function captureGit(dir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: dir });
  return stdout.trim();
}

test("release workflow: patch version bump", async () => {
  const project = await createTestProject("patch-test", "1.2.3");
  try {
    const result = await runRelease(project.dir, ["--yes", "--no-push", "patch"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Version bump: 1.2.3 -> 1.2.4");

    // Verify manifest.json
    const manifest = JSON.parse(await readFile(join(project.dir, "manifest.json"), "utf-8"));
    expect(manifest.version).toBe("1.2.4");

    // Verify package.json
    const pkg = JSON.parse(await readFile(join(project.dir, "package.json"), "utf-8"));
    expect(pkg.version).toBe("1.2.4");

    // Verify versions.json
    const versions = JSON.parse(await readFile(join(project.dir, "versions.json"), "utf-8"));
    expect(versions["1.2.4"]).toBe("1.0.0");

    // Verify git commit
    const commitMsg = await captureGit(project.dir, ["log", "-1", "--pretty=%s"]);
    expect(commitMsg).toContain("chore: release 1.2.4");

    // Verify git tag (no 'v' prefix)
    const tagName = await captureGit(project.dir, ["tag", "--list"]);
    expect(tagName).toBe("1.2.4");
  } finally {
    await project.cleanup();
  }
});

test("release workflow: minor version bump", async () => {
  const project = await createTestProject("minor-test", "1.2.3");
  try {
    const result = await runRelease(project.dir, ["--yes", "--no-push", "minor"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Version bump: 1.2.3 -> 1.3.0");

    const manifest = JSON.parse(await readFile(join(project.dir, "manifest.json"), "utf-8"));
    expect(manifest.version).toBe("1.3.0");

    const commitMsg = await captureGit(project.dir, ["log", "-1", "--pretty=%s"]);
    expect(commitMsg).toContain("chore: release 1.3.0");

    const tagName = await captureGit(project.dir, ["tag", "--list"]);
    expect(tagName).toBe("1.3.0");
  } finally {
    await project.cleanup();
  }
});

test("release workflow: major version bump", async () => {
  const project = await createTestProject("major-test", "1.2.3");
  try {
    const result = await runRelease(project.dir, ["--yes", "--no-push", "major"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Version bump: 1.2.3 -> 2.0.0");

    const manifest = JSON.parse(await readFile(join(project.dir, "manifest.json"), "utf-8"));
    expect(manifest.version).toBe("2.0.0");

    const commitMsg = await captureGit(project.dir, ["log", "-1", "--pretty=%s"]);
    expect(commitMsg).toContain("chore: release 2.0.0");

    const tagName = await captureGit(project.dir, ["tag", "--list"]);
    expect(tagName).toBe("2.0.0");
  } finally {
    await project.cleanup();
  }
});

test("release workflow: no-push is respected", async () => {
  const project = await createTestProject("no-push-test", "1.0.0");
  try {
    const result = await runRelease(project.dir, ["--yes", "--no-push", "patch"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("no-push mode");
    expect(result.stdout).toContain("stopping before push");
  } finally {
    await project.cleanup();
  }
});

test("release workflow: missing Unreleased section is recovered", async () => {
  const project = await createTestProject("missing-unreleased", "1.0.0", {
    changelog: `# Changelog

## [1.0.0] - 2024-01-01

- Initial release
`,
  });
  try {
    const result = await runRelease(project.dir, ["--yes", "--no-push", "patch"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Missing [Unreleased] section");

    const changelog = await readFile(join(project.dir, "CHANGELOG.md"), "utf-8");
    expect(changelog).toContain("## [Unreleased]");
    expect(changelog).toContain("- _No changes recorded._");
    expect(changelog).toContain("## [1.0.1]");
  } finally {
    await project.cleanup();
  }
});

test("release workflow: empty Unreleased content gets placeholder", async () => {
  const project = await createTestProject("empty-unreleased", "1.0.0", {
    changelog: `# Changelog

## [Unreleased]


## [1.0.0] - 2024-01-01

- Initial release
`,
  });

  try {
    const result = await runRelease(project.dir, ["--yes", "--no-push", "patch"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("[Unreleased] section is empty");

    const changelog = await readFile(join(project.dir, "CHANGELOG.md"), "utf-8");
    expect(changelog).toContain("- _No changes recorded._");
    expect(changelog).toContain("## [1.0.1]");
  } finally {
    await project.cleanup();
  }
});

test("release workflow: strict mode aborts on changelog warnings", async () => {
  const project = await createTestProject("strict-missing-unreleased", "1.0.0", {
    changelog: `# Changelog

## [1.0.0] - 2024-01-01

- Initial release
`,
  });
  try {
    const result = await runRelease(project.dir, ["--yes", "--no-push", "--strict", "patch"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Strict mode");
  } finally {
    await project.cleanup();
  }
});

test("release workflow: parentheses version headers are parsed", async () => {
  const project = await createTestProject("paren-version", "1.0.0", {
    changelog: `# Changelog

## (Unreleased)

- Parenthesis style unreleased entry.

## (1.0.0) - 2024-01-01

- Initial release
`,
  });
  try {
    const result = await runRelease(project.dir, ["--yes", "--no-push", "patch"]);
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("CHANGELOG.md: Header");
    const changelog = await readFile(join(project.dir, "CHANGELOG.md"), "utf-8");
    expect(changelog).toContain("## [1.0.1]");
    expect(changelog).toContain("Parenthesis style unreleased entry.");
  } finally {
    await project.cleanup();
  }
});

test("release workflow: bare version headers are parsed", async () => {
  const project = await createTestProject("bare-version", "1.0.0", {
    changelog: `# Changelog

## Unreleased

- Bare version style unreleased entry.

## v1.0.0 - 2024-01-01

- Initial release
`,
  });
  try {
    const result = await runRelease(project.dir, ["--yes", "--no-push", "patch"]);
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("CHANGELOG.md: Header");
    const changelog = await readFile(join(project.dir, "CHANGELOG.md"), "utf-8");
    expect(changelog).toContain("## [1.0.1]");
    expect(changelog).toContain("Bare version style unreleased entry.");
  } finally {
    await project.cleanup();
  }
});

test("release workflow: top-level entries before headers become unreleased notes", async () => {
  const project = await createTestProject("top-level-bullets", "1.0.0", {
    changelog: `# Changelog

- Change captured before any heading
- Another pending change

## [1.0.0] - 2024-01-01

- Initial release
`,
  });
  try {
    const result = await runRelease(project.dir, ["--yes", "--no-push", "patch"]);
    expect(result.code).toBe(0);

    const changelog = await readFile(join(project.dir, "CHANGELOG.md"), "utf-8");
    expect(changelog).toContain("## [1.0.1]");
    expect(changelog).toContain("Change captured before any heading");
    expect(changelog).toContain("Another pending change");
    expect(changelog.startsWith("# Changelog")).toBe(true);
  } finally {
    await project.cleanup();
  }
});
