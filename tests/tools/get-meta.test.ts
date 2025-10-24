/**
 * Unit tests for tools/get-meta.ts
 *
 * Tests metadata extraction for an Obsidian plugin, reading from:
 * - manifest.json (for id, version)
 * - package.json (for build script detection)
 */

import { expect, test } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function runGetMeta(
  tempDir: string,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const scriptPath = join(process.cwd(), "tools", "get-meta.ts");

  try {
    const { stdout, stderr } = await execFileAsync("node", [scriptPath], { cwd: tempDir });
    return { stdout, stderr, code: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout,
      stderr: error.stderr,
      code: error.code ?? 1,
    };
  }
}

async function createManifest(tempDir: string, manifest: Record<string, unknown>) {
  const path = join(tempDir, "manifest.json");
  await writeFile(path, JSON.stringify(manifest, null, 2));
}

async function createPackageJson(tempDir: string, config: Record<string, unknown>) {
  const path = join(tempDir, "package.json");
  await writeFile(path, JSON.stringify(config, null, 2));
}

test("get-meta: valid manifest and package.json with build script", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "get-meta-test-"));
  try {
    await createManifest(tempDir, {
      id: "my-plugin",
      version: "1.2.3",
      minAppVersion: "1.0.0",
    });
    await createPackageJson(tempDir, {
      scripts: {
        build: "node esbuild.config.mjs production",
      },
    });

    const result = await runGetMeta(tempDir);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("tool_name=my-plugin");
    expect(result.stdout).toContain("tool_version=1.2.3");
    expect(result.stdout).toContain("has_build_task=true");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("get-meta: no build script found", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "get-meta-test-"));
  try {
    await createManifest(tempDir, {
      id: "my-plugin",
      version: "1.2.3",
      minAppVersion: "1.0.0",
    });
    await createPackageJson(tempDir, {
      scripts: {
        lint: "eslint .",
      },
    });

    const result = await runGetMeta(tempDir);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("has_build_task=false");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("get-meta: no package.json file found", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "get-meta-test-"));
  try {
    await createManifest(tempDir, {
      id: "my-plugin",
      version: "1.2.3",
      minAppVersion: "1.0.0",
    });

    const result = await runGetMeta(tempDir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ERROR: package.json not found");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("get-meta: error when manifest.json missing", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "get-meta-test-"));
  try {
    await createPackageJson(tempDir, {});
    const result = await runGetMeta(tempDir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ERROR: manifest.json not found");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("get-meta: error when id is missing from manifest", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "get-meta-test-"));
  try {
    await createManifest(tempDir, { version: "1.0.0", minAppVersion: "1.0.0" });
    await createPackageJson(tempDir, {});
    const result = await runGetMeta(tempDir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ERROR: 'id' field is required in manifest.json");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("get-meta: error when version is missing from manifest", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "get-meta-test-"));
  try {
    await createManifest(tempDir, { id: "my-plugin", minAppVersion: "1.0.0" });
    await createPackageJson(tempDir, {});
    const result = await runGetMeta(tempDir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ERROR: 'version' field is required in manifest.json");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
