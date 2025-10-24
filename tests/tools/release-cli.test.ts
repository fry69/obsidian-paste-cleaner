/**
 * CLI tests for tools/release.ts
 *
 * Tests command-line interface and argument parsing:
 * - Help and version display
 * - Error handling for invalid inputs
 * - Argument validation
 *
 * Note: Full integration tests are in release-workflow.test.ts
 */

import { expect, test } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, mkdir, copyFile, readFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile, exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { inc } from "semver-ts";

// Promisify exec for async/await usage
const exec = promisify(execCb);

// Helper function to create a temporary git repository from a fixture
async function createTempGitRepo(
  fixturePath: string,
): Promise<{ tempDir: string; cleanup: () => Promise<void> }> {
  // Create a temporary directory
  const tempDir = await mkdtemp(join(tmpdir(), "release-test-"));

  // Copy fixture files to the temporary directory
  await cp(fixturePath, tempDir, { recursive: true });
  await cp(join(process.cwd(), "tools"), join(tempDir, "tools"), { recursive: true });

  // Initialize a git repository, add files, and make an initial commit
  await exec("git init", { cwd: tempDir });
  await exec('git config user.name "Test User"', { cwd: tempDir });
  await exec('git config user.email "test@example.com"', { cwd: tempDir });
  await exec("git remote add origin https://github.com/test/test.git", { cwd: tempDir });
  await exec("git add .", { cwd: tempDir });
  await exec('git commit -m "Initial commit"', { cwd: tempDir });

  // Define a cleanup function to remove the temporary directory
  const cleanup = async () => {
    await rm(tempDir, { recursive: true, force: true });
  };

  return { tempDir, cleanup };
}

test("release: updates changelog correctly, preserving old entries", async () => {
  const fixturePath = "tests/fixtures/basic";
  const { tempDir, cleanup } = await createTempGitRepo(fixturePath);

  try {
    // Run the release script for a patch release
    const result = await runRelease(["--yes", "--no-push", "patch"], tempDir);
    expect(result.code).toBe(0);

    // Verify the new version in manifest.json
    const manifest = JSON.parse(await readFile(join(tempDir, "manifest.json"), "utf-8"));
    expect(manifest.version).toBe("1.1.1");

    // Verify CHANGELOG.md contents
    const changelog = await readFile(join(tempDir, "CHANGELOG.md"), "utf-8");
    expect(changelog).toContain("## [Unreleased]");
    expect(changelog).toContain("## [1.1.1]");
    expect(changelog).toContain("- New feature for the next release");
    expect(changelog).toContain("- Another new feature");
    expect(changelog).toContain("## [1.1.0] - 2025-03-15");

    // Versions map should include the new release
    const versions = JSON.parse(await readFile(join(tempDir, "versions.json"), "utf-8"));
    expect(versions["1.1.1"]).toBe("1.0.0");

    // Tag should be created even in no-push (script instructs how to clean up)
    const { stdout: tags } = await exec("git tag --list", { cwd: tempDir });
    const tagList = tags.trim().split(/\r?\n/).filter(Boolean);
    expect(tagList).toContain("1.1.1");
  } finally {
    // Clean up the temporary directory
    await cleanup();
  }
});

const execFileAsync = promisify(execFile);

async function runRelease(
  args: string[],
  cwd: string = process.cwd(),
  env: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const scriptPath = join(process.cwd(), "tools", "release.ts");

  try {
    const { stdout, stderr } = await execFileAsync("node", [scriptPath, ...args], {
      cwd,
      env: {
        ...process.env,
        CI: "true", // Disables interactive prompts in the script
        NO_COLOR: "true",
        ...env,
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

async function getRootVersionExamples() {
  const pkgContent = await readFile(join(process.cwd(), "package.json"), "utf-8");
  const pkg = JSON.parse(pkgContent) as { version: string };
  const current = pkg.version;
  const patch = inc(current, "patch") ?? current;
  const minor = inc(current, "minor") ?? current;
  const major = inc(current, "major") ?? current;
  const preid = "beta";
  const rawPre = inc(current, "prerelease", {}, preid);
  const prerelease = rawPre ? rawPre.replace(/\.(?=\d+$)/, "") : `${patch}-beta0`;
  return { current, patch, minor, major, prerelease, preid };
}

test("release: shows help with --help", async () => {
  const result = await runRelease(["--help"]);
  const versions = await getRootVersionExamples();

  expect(result.code).toBe(0);
  expect(result.stdout).toContain("Usage:");
  expect(result.stdout).toContain("major");
  expect(result.stdout).toContain("minor");
  expect(result.stdout).toContain("patch");
  expect(result.stdout).toContain("--no-push");
  expect(result.stdout).toContain("--strict");
  expect(result.stdout).toContain("--yes");
  expect(result.stdout).toContain("--quiet");
  expect(result.stdout).toContain(`Current version: ${versions.current}`);
  expect(result.stdout).toContain(`release ${versions.patch}`);
  expect(result.stdout).toContain(`${versions.current} -> ${versions.patch}`);
  expect(result.stdout).toContain(`${versions.current} -> ${versions.minor}`);
  expect(result.stdout).toContain(`${versions.current} -> ${versions.major}`);
  expect(result.stdout).toContain(`${versions.current} -> ${versions.prerelease}`);
});

test("release: shows help with -h", async () => {
  const result = await runRelease(["-h"]);

  expect(result.code).toBe(0);
  expect(result.stdout).toContain("Usage:");
});

test("release: shows version with --version", async () => {
  const result = await runRelease(["--version"]);

  expect(result.code).toBe(0);
  expect(result.stdout).toMatch(/release version \d+\.\d+\.\d+/);
});

test("release: shows version with -v", async () => {
  const result = await runRelease(["-v"]);

  expect(result.code).toBe(0);
  expect(result.stdout).toMatch(/release version \d+\.\d+\.\d+/);
});

test("release: requires version argument", async () => {
  const result = await runRelease([]);

  expect(result.code).toBe(1);
  expect(result.stderr).toContain("Missing version argument");
  expect(result.stdout).toContain("Usage:");
});

test("release: help takes precedence over other flags", async () => {
  const result = await runRelease(["--help", "--version"]);

  expect(result.code).toBe(0);
  expect(result.stdout).toContain("Usage:");
  expect(result.stdout).not.toMatch(/release version \d+\.\d+\.\d+/);
});

test("release: version flag takes precedence over version argument", async () => {
  const result = await runRelease(["--version", "1.0.0"]);

  expect(result.code).toBe(0);
  expect(result.stdout).toMatch(/release version/);
});

test("release: recognizes major/minor/patch keywords", async () => {
  // These should fail later (not at argument parsing stage) when trying to run git
  for (const keyword of ["major", "minor", "patch"]) {
    const tempDir = await mkdtemp(join(tmpdir(), "release-cli-test-"));
    try {
      // Create minimal mock files so the script gets past the initial checks
      await writeFile(
        join(tempDir, "manifest.json"),
        JSON.stringify({
          id: "test",
          version: "1.0.0",
          minAppVersion: "1.0.0",
        }),
      );
      await writeFile(join(tempDir, "versions.json"), JSON.stringify({ "1.0.0": "1.0.0" }));
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify({
          version: "1.0.0",
          scripts: { lint: "echo 'Mock lint'" },
        }),
      );
      await writeFile(
        join(tempDir, "CHANGELOG.md"),
        "# Changelog\n\n## [Unreleased]\n\n- Initial unreleased changes.\n",
      );
      await mkdir(join(tempDir, "tools"), { recursive: true });
      await copyFile(
        join(process.cwd(), "tools", "release-utils.ts"),
        join(tempDir, "tools", "release-utils.ts"),
      );

      const result = await runRelease(["--yes", keyword], tempDir);

      // Should fail trying to run git, not complaining about the keyword
      expect(result.stderr).not.toContain("Invalid version");
      expect(result.stderr).not.toContain("Missing version argument");
      expect(result.stderr).toContain("Git commit failed"); // Expected failure point
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
});

test("release: accepts explicit version numbers", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "release-cli-test-"));
  try {
    await writeFile(
      join(tempDir, "manifest.json"),
      JSON.stringify({ id: "test", version: "1.0.0", minAppVersion: "1.0.0" }),
    );
    await writeFile(join(tempDir, "versions.json"), JSON.stringify({ "1.0.0": "1.0.0" }));
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({
        version: "1.0.0",
        scripts: { lint: "echo 'Mock lint'" },
      }),
    );
    await writeFile(
      join(tempDir, "CHANGELOG.md"),
      "# Changelog\n\n## [Unreleased]\n\n- Initial unreleased changes.\n",
    );
    await mkdir(join(tempDir, "tools"), { recursive: true });
    await copyFile(
      join(process.cwd(), "tools", "release-utils.ts"),
      join(tempDir, "tools", "release-utils.ts"),
    );

    const result = await runRelease(["--yes", "1.2.3"], tempDir);

    // Should fail trying to run git, not complaining about version format
    expect(result.stderr).not.toContain("Invalid version: 1.2.3");
    expect(result.stderr).not.toContain("Missing version argument");
    expect(result.stderr).toContain("Git commit failed"); // Expected failure point
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("release: rejects clearly invalid version format", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "release-cli-test-"));
  try {
    await writeFile(
      join(tempDir, "manifest.json"),
      JSON.stringify({ id: "test", version: "1.0.0", minAppVersion: "1.0.0" }),
    );
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ version: "1.0.0", scripts: { lint: "echo 'Mock lint'" } }),
    );
    await writeFile(join(tempDir, "versions.json"), JSON.stringify({ "1.0.0": "1.0.0" }));
    await writeFile(
      join(tempDir, "CHANGELOG.md"),
      "# Changelog\n\n## [Unreleased]\n\n- Initial unreleased changes.\n",
    );

    const result = await runRelease(["--yes", "not-a-version"], tempDir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Invalid version");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("release: no-push flag is recognized", async () => {
  // Just verify the flag is parsed, actual behavior tested in integration tests
  const result = await runRelease(["--help"]);
  expect(result.stdout).toContain("--no-push");
  expect(result.stdout).toContain("-n");
});

test("release: strict flag is recognized", async () => {
  const result = await runRelease(["--help"]);
  expect(result.stdout).toContain("--strict");
});

test("release: yes flag is recognized", async () => {
  const result = await runRelease(["--help"]);
  expect(result.stdout).toContain("--yes");
  expect(result.stdout).toContain("-y");
});

test("release: quiet flag is recognized", async () => {
  const result = await runRelease(["--help"]);
  expect(result.stdout).toContain("--quiet");
  expect(result.stdout).toContain("-q");
});

test("release: help shows examples", async () => {
  const result = await runRelease(["--help"]);
  const versions = await getRootVersionExamples();

  expect(result.stdout).toContain("Examples:");
  expect(result.stdout).toContain(`release ${versions.patch}`);
  expect(result.stdout).toContain("release patch");
  expect(result.stdout).toContain("release --no-push patch");
  expect(result.stdout).toContain("release --strict patch");
  expect(result.stdout).toContain(`${versions.current} -> ${versions.patch}`);
  expect(result.stdout).toContain(`${versions.current} -> ${versions.prerelease}`);
});

test("release: strict mode aborts on changelog warnings", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "release-cli-test-"));
  try {
    await writeFile(
      join(tempDir, "manifest.json"),
      JSON.stringify({ id: "test", version: "1.0.0", minAppVersion: "1.0.0" }),
    );
    await writeFile(join(tempDir, "versions.json"), JSON.stringify({ "1.0.0": "1.0.0" }));
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ version: "1.0.0", scripts: { lint: "echo 'Mock lint'" } }),
    );
    await writeFile(
      join(tempDir, "CHANGELOG.md"),
      "# Changelog\n\n## [1.0.0] - 2024-01-01\n\n- Initial release\n",
    );
    await mkdir(join(tempDir, "tools"), { recursive: true });
    await copyFile(
      join(process.cwd(), "tools", "release-utils.ts"),
      join(tempDir, "tools", "release-utils.ts"),
    );

    const result = await runRelease(["--yes", "--no-push", "--strict", "patch"], tempDir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Strict mode");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("release: recognizes prerelease keyword and --preid", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "release-cli-test-"));
  try {
    await writeFile(
      join(tempDir, "manifest.json"),
      JSON.stringify({ id: "test", version: "1.0.0", minAppVersion: "1.0.0" }),
    );
    await writeFile(join(tempDir, "versions.json"), JSON.stringify({ "1.0.0": "1.0.0" }));
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ version: "1.0.0", scripts: { lint: "echo 'Mock lint'" } }),
    );
    await writeFile(
      join(tempDir, "CHANGELOG.md"),
      "# Changelog\n\n## [Unreleased]\n\n- Initial unreleased changes.\n",
    );

    const result = await runRelease(["--yes", "prerelease", "--preid", "beta"], tempDir, {
      TEST_DEFAULT_BRANCH: "main",
      TEST_CURRENT_BRANCH: "develop",
    });

    expect(result.stdout).toContain("Version bump: 1.0.0 -> 1.0.1-beta0");
    expect(result.stderr).toContain("Git commit failed"); // Expected failure point
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("release: fails on prerelease from default branch", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "release-cli-test-"));
  try {
    await writeFile(
      join(tempDir, "manifest.json"),
      JSON.stringify({ id: "test", version: "1.0.0", minAppVersion: "1.0.0" }),
    );
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ version: "1.0.0", scripts: { lint: "echo 'Mock lint'" } }),
    );
    await writeFile(join(tempDir, "versions.json"), JSON.stringify({ "1.0.0": "1.0.0" }));
    await writeFile(
      join(tempDir, "CHANGELOG.md"),
      "# Changelog\n\n## [Unreleased]\n\n- Initial unreleased changes.\n",
    );

    const result = await runRelease(["prerelease"], tempDir, {
      TEST_DEFAULT_BRANCH: "main",
      TEST_CURRENT_BRANCH: "main",
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Pre-releases must be created from a non-default branch");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("release: allows prerelease from non-default branch", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "release-cli-test-"));
  try {
    await writeFile(
      join(tempDir, "manifest.json"),
      JSON.stringify({ id: "test", version: "1.0.0", minAppVersion: "1.0.0" }),
    );
    await writeFile(join(tempDir, "versions.json"), JSON.stringify({ "1.0.0": "1.0.0" }));
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({
        version: "1.0.0",
        scripts: { lint: "echo 'Mock lint'" },
      }),
    );
    await writeFile(
      join(tempDir, "CHANGELOG.md"),
      "# Changelog\n\n## [Unreleased]\n\n- Initial unreleased changes.\n",
    );
    await mkdir(join(tempDir, "tools"), { recursive: true });
    await copyFile(
      join(process.cwd(), "tools", "release-utils.ts"),
      join(tempDir, "tools", "release-utils.ts"),
    );
    const result = await runRelease(["--yes", "prerelease"], tempDir, {
      TEST_DEFAULT_BRANCH: "main",
      TEST_CURRENT_BRANCH: "develop",
    });

    expect(result.stderr).not.toContain("Pre-releases must be created from a non-default branch");
    expect(result.stderr).toContain("Git commit failed"); // Expected failure point
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
