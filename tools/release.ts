#!/usr/bin/env node
/**
 * Release script for Obsidian plugins
 * - Bumps version in manifest.json, package.json, and versions.json
 * - Updates CHANGELOG.md with the release date
 * - Commits, tags, and pushes the release
 *
 * Usage:
 *   release [--no-push] <version|major|minor|patch>
 *
 * @module
 */

import { parseArgs } from "node:util";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { inc, valid, prerelease, gt } from "semver-ts";
import chalk from "chalk";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import prompts from "prompts";
import {
  getProjectInfo,
  checkVersionCoherency,
  parseChangelog,
  updateChangelog,
} from "./release-utils.ts";

const exec = promisify(execCb);

// Script metadata
const VERSION = "0.3.0";
const SCRIPT_NAME = "release";

// Project root directory (current working directory)
const ROOT_DIR = process.cwd();

// Global state for quiet mode
let isQuiet = false;

// Helper: Logging with consistent formatting
const log = {
  success: (msg: string) => !isQuiet && console.log(chalk.green("✓") + " " + msg),
  warn: (msg: string) => console.log(chalk.yellow("⚠") + " " + msg),
  error: (msg: string) => console.error(chalk.red("✗") + " " + msg),
  step: (msg: string) => !isQuiet && console.log("\n" + chalk.bold(msg)),
  info: (msg: string) => !isQuiet && console.log("  " + msg),
  blank: () => !isQuiet && console.log(),
};

// Helper: Exit with error message
function exitError(msg: string): never {
  log.error(msg);
  process.exit(1);
}

// Helper: Run command and return success status
async function run(cmd: string, opts?: { silent?: boolean }): Promise<boolean> {
  try {
    const promise = exec(cmd, { cwd: ROOT_DIR });
    if (!opts?.silent) {
      promise.child.stdout?.pipe(process.stdout);
      promise.child.stderr?.pipe(process.stderr);
    }
    await promise;
    return true;
  } catch {
    if (!opts?.silent) {
      log.error(`Command failed: ${cmd}`);
    }
    return false;
  }
}

// Helper: Run command and capture output
async function capture(cmd: string): Promise<string> {
  const { stdout } = await exec(cmd, { cwd: ROOT_DIR });
  return stdout.trim();
}

// Helper: Get current git branch
async function getCurrentBranch(): Promise<string | null> {
  if (process.env.TEST_CURRENT_BRANCH) {
    return process.env.TEST_CURRENT_BRANCH;
  }
  try {
    return await capture("git rev-parse --abbrev-ref HEAD");
  } catch {
    return null;
  }
}

// Helper: Get default git branch from remote
async function getDefaultBranch(remote: string): Promise<string | null> {
  if (process.env.TEST_DEFAULT_BRANCH) {
    return process.env.TEST_DEFAULT_BRANCH;
  }
  try {
    const output = await capture(`git ls-remote --symref ${remote} HEAD`);
    const match = /ref: refs\/heads\/(.*)\s+HEAD/.exec(output);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

interface HelpExamples {
  current: string;
  patch?: string;
  minor?: string;
  major?: string;
  prerelease?: string;
  preid?: string;
}

async function buildHelpExamples(): Promise<HelpExamples | null> {
  try {
    const packagePath = join(ROOT_DIR, "package.json");
    const pkgContent = await readFile(packagePath, "utf-8");
    const pkg = JSON.parse(pkgContent);
    const currentVersion = valid(pkg.version);
    if (!currentVersion) {
      return null;
    }

    const patch = inc(currentVersion, "patch") ?? undefined;
    const minor = inc(currentVersion, "minor") ?? undefined;
    const major = inc(currentVersion, "major") ?? undefined;
    const preid = "beta";
    const prereleaseBase = inc(currentVersion, "prerelease", {}, preid) ?? undefined;
    const prerelease = prereleaseBase ? prereleaseBase.replace(/\.(?=\d+$)/, "") : undefined;

    return {
      current: currentVersion,
      patch,
      minor,
      major,
      prerelease,
      preid,
    };
  } catch {
    return null;
  }
}

// Helper: Show usage information
function showHelp(examples: HelpExamples | null = null) {
  const exampleLines = examples
    ? `
${chalk.bold("Current version:")} ${chalk.green(examples.current)}

${chalk.bold("Examples:")}
  ${SCRIPT_NAME} ${chalk.red(examples.patch ?? examples.current)}                    # Set explicit version
  ${SCRIPT_NAME} patch                    # ${chalk.green(examples.current)} -> ${chalk.red(examples.patch ?? examples.current)}
  ${SCRIPT_NAME} minor                    # ${chalk.green(examples.current)} -> ${chalk.red(examples.minor ?? examples.current)}
  ${SCRIPT_NAME} major                    # ${chalk.green(examples.current)} -> ${chalk.red(examples.major ?? examples.current)}
  ${SCRIPT_NAME} prerelease --preid ${examples.preid ?? "beta"}  # ${chalk.green(examples.current)} -> ${chalk.red(examples.prerelease ?? `${examples.current}-beta0`)}
  ${SCRIPT_NAME} --no-push patch          # Stop before pushing to GitHub
  ${SCRIPT_NAME} --strict patch           # Fail if changelog is not ready
  ${SCRIPT_NAME} --yes --quiet patch      # Non-interactive mode`
    : `
${chalk.bold("Examples:")}
  ${SCRIPT_NAME} ${chalk.red("1.2.4")}                    # Set specific version
  ${SCRIPT_NAME} patch                    # Bump patch (${chalk.green("1.2.3")} -> ${chalk.red("1.2.4")})
  ${SCRIPT_NAME} minor                    # Bump minor (${chalk.green("1.2.3")} -> ${chalk.red("1.3.0")})
  ${SCRIPT_NAME} major                    # Bump major (${chalk.green("1.2.3")} -> ${chalk.red("2.0.0")})
  ${SCRIPT_NAME} prerelease --preid beta  # Bump pre-release (${chalk.green("1.2.3")} -> ${chalk.red("1.2.4-beta0")})
  ${SCRIPT_NAME} --no-push patch          # Stop before pushing to GitHub
  ${SCRIPT_NAME} --strict patch           # Fail if changelog is not ready
  ${SCRIPT_NAME} --yes --quiet patch      # Non-interactive mode`;

  console.log(`
${chalk.bold("Usage:")} ${SCRIPT_NAME} [options] <version|major|minor|patch|premajor|preminor|prepatch|prerelease>

${chalk.bold("Options:")}
  -n, --no-push      Stop before pushing to GitHub
  -y, --yes          Skip confirmation prompt (auto-confirm)
  -q, --quiet        Suppress non-essential output
  --preid <id>       Identifier for pre-release versions (e.g., 'alpha', 'beta')
  --strict           Fail on changelog warnings instead of auto-recovering
  -h, --help         Show this help message
  -v, --version      Show script version
${exampleLines}
`);
}

// Main execution logic
async function main() {
  const { values: args, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "no-push": { type: "boolean", short: "n" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      yes: { type: "boolean", short: "y" },
      quiet: { type: "boolean", short: "q" },
      preid: { type: "string" },
      strict: { type: "boolean" },
    },
    allowPositionals: true,
  });

  if (args.help) {
    const examples = await buildHelpExamples();
    showHelp(examples);
    return;
  }

  if (args.version) {
    console.log(`${SCRIPT_NAME} version ${VERSION}`);
    return;
  }

  const versionArg = positionals[0];
  if (!versionArg) {
    const examples = await buildHelpExamples();
    showHelp(examples);
    exitError("Missing version argument.");
  }

  const noPush = args["no-push"];
  const strictMode = args.strict ?? false;

  if (noPush) {
    log.warn("🏃 Running in no-push mode. No changes will be pushed to the remote.");
  } else {
    log.info("🔒 Running in push mode. Changes will be pushed to the remote.");
  }

  const autoConfirm = args.yes;
  isQuiet = args.quiet ?? false;
  const preid = args.preid as string | undefined;

  log.step("Verifying project state...");
  const meta = await getProjectInfo();
  checkVersionCoherency(meta);
  const current = meta.version;
  log.success("Project state is coherent.");

  const parsedChangelog = await parseChangelog();
  if (parsedChangelog.warnings.length > 0) {
    for (const warning of parsedChangelog.warnings) {
      log.warn(warning);
    }
    if (strictMode) {
      exitError("Strict mode: aborting due to changelog warnings.");
    }
  }

  let unreleasedEntry = parsedChangelog.entries.find((e) => e.version === "unreleased");
  if (!unreleasedEntry) {
    const message = "CHANGELOG.md: Unable to locate or create [Unreleased] section.";
    if (strictMode) {
      exitError(message);
    }
    log.warn(message);
    unreleasedEntry = {
      version: "unreleased",
      header: "## [Unreleased]",
      content: "",
    };
    parsedChangelog.entries.unshift(unreleasedEntry);
  }

  if (unreleasedEntry.content.trim().length === 0) {
    const message =
      "CHANGELOG.md: [Unreleased] section is empty; using placeholder entry for release notes.";
    if (strictMode) {
      exitError(message);
    }
    log.warn(message);
    unreleasedEntry.content = "- _No changes recorded._";
  }

  // Calculate next version
  let nextVersion: string | null;
  const releaseTypes = [
    "major",
    "minor",
    "patch",
    "premajor",
    "preminor",
    "prepatch",
    "prerelease",
  ];
  if (releaseTypes.includes(versionArg)) {
    const releaseType = versionArg as
      | "major"
      | "minor"
      | "patch"
      | "premajor"
      | "preminor"
      | "prepatch"
      | "prerelease";

    // Check if this is a pre-release
    const isPreRelease = releaseType.startsWith("pre") || prerelease(current);
    if (isPreRelease) {
      const defaultBranch = await getDefaultBranch("origin");
      const currentBranch = await getCurrentBranch();
      if (defaultBranch && currentBranch && currentBranch === defaultBranch) {
        exitError("Pre-releases must be created from a non-default branch.");
      }
    }

    nextVersion = inc(current, releaseType, {}, preid);
  } else {
    nextVersion = valid(versionArg);
  }

  if (!nextVersion) {
    exitError(`Invalid version: ${versionArg}`);
  }

  // BRAT compatibility: remove dot from pre-release versions (e.g., 1.2.3-beta.0 -> 1.2.3-beta0)
  if (prerelease(nextVersion)) {
    nextVersion = nextVersion.replace(/\.(?=\d+$)/, "");
  }

  const nextVersionTag = nextVersion;

  // Check for higher versions in changelog
  const higherVersions = parsedChangelog.entries.filter(
    (e) => e.version && e.version !== "unreleased" && gt(e.version, nextVersion),
  );
  if (higherVersions.length > 0) {
    exitError(
      `Changelog contains versions higher than the target version: ${higherVersions
        .map((e) => e.version)
        .join(", ")}`,
    );
  }

  log.blank();
  log.info(
    `${chalk.bold("Version bump:")} ${chalk.green(current)} -> ${chalk.yellow(nextVersion)}`,
  );
  log.blank();

  // Confirmation prompt
  if (!autoConfirm) {
    if (!process.stdin.isTTY) {
      exitError("Running in non-interactive mode without --yes flag. Use --yes to auto-confirm.");
    }
    const response = await prompts({
      type: "confirm",
      name: "value",
      message: "Proceed with version update?",
      initial: true,
    });
    if (!response.value) {
      log.info("Cancelled.");
      process.exit(0);
    }
  }
  log.blank();

  // Update manifest.json
  log.step("Updating manifest.json...");
  const manifestPath = join(ROOT_DIR, "manifest.json");
  const manifestContent = await readFile(manifestPath, "utf-8");
  const manifestJson = JSON.parse(manifestContent);
  manifestJson.version = nextVersion;
  await writeFile(manifestPath, JSON.stringify(manifestJson, null, "\t") + "\n");
  log.success(`Updated manifest.json to ${nextVersion}`);

  // Update package.json
  log.step("Updating package.json...");
  const packagePath = join(ROOT_DIR, "package.json");
  const packageContent = await readFile(packagePath, "utf-8");
  const packageJson = JSON.parse(packageContent);
  packageJson.version = nextVersion;
  await writeFile(packagePath, JSON.stringify(packageJson, null, "\t") + "\n");
  log.success(`Updated package.json to ${nextVersion}`);

  // Update versions.json
  log.step("Updating versions.json...");
  const versionsPath = join(ROOT_DIR, "versions.json");
  const versionsContent = await readFile(versionsPath, "utf-8");
  const versionsJson = JSON.parse(versionsContent);
  if (!versionsJson[nextVersion]) {
    versionsJson[nextVersion] = meta.minAppVersion;
    await writeFile(versionsPath, JSON.stringify(versionsJson, null, "\t") + "\n");
    log.success(`Added ${nextVersion} to versions.json`);
  } else {
    log.warn(`Version ${nextVersion} already exists in versions.json`);
  }

  // Update CHANGELOG.md
  log.step("Updating CHANGELOG.md...");
  const changelog = await updateChangelog(parsedChangelog, nextVersion);
  log.success("Updated CHANGELOG.md");

  // Run tests
  log.blank();
  log.step("Running checks...");
  if (!(await run("npm run check"))) {
    exitError("Checks failed. Please fix issues before releasing.");
  }
  log.success("All checks passed!");

  // Git operations
  log.blank();
  log.step("Creating release commit and tag...");

  const commitMessage = `chore: release ${nextVersionTag}\n\n${changelog}`;

  if (!(await run(`git commit -am "${commitMessage.replace(/"/g, '\"')}"`))) {
    exitError("Git commit failed. Please check git status.");
  }
  log.success("Changes committed");

  if (!(await run(`git tag -a ${nextVersionTag} -m "${changelog.replace(/"/g, '\"')}"`))) {
    exitError("Git tag creation failed.");
  }
  log.success(`Tag ${nextVersionTag} created`);

  // Handle no-push or push
  if (noPush) {
    log.blank();
    log.warn(chalk.bold("🏃 no-push mode - stopping before push"));
    log.blank();
    log.step("To revert:");
    log.info(chalk.yellow(`git reset --hard HEAD~1 && git tag -d ${nextVersionTag}`));
    log.blank();
    log.step("To complete release:");
    log.info(chalk.yellow(`git push && git push --tags`));
    log.blank();
    process.exit(0);
  }

  log.blank();
  log.step("Pushing to remote...");
  if (!(await run("git push"))) {
    exitError("Git push failed.");
  }
  if (!(await run("git push --tags"))) {
    exitError("Git push tags failed.");
  }
  log.success("Pushed to remote");

  log.blank();
  log.success(chalk.bold(`🎉 Release ${nextVersionTag} complete!`));
  log.blank();
}

// Run main
main().catch((e) => exitError(e.message));
