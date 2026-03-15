/**
 * @fileoverview tests\utils.test.ts
 */
import test from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("suggestStoreName skips quadratic edit-distance work for hostile long names", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const utilsPath = path.join(repoRoot, "src", "utils.ts");
  const script = `
    const assert = (await import("node:assert")).default;
    const { pathToFileURL } = await import("node:url");
    const { suggestStoreName } = await import(pathToFileURL(${JSON.stringify(utilsPath)}).href);
    const reported = [];
    const originalConsoleError = console.error;
    console.error = (message) => {
      reported.push(String(message ?? ""));
    };

    try {
      const missing = "x".repeat(5000);
      suggestStoreName(missing, ["y".repeat(5000)]);
      assert.ok(reported.some((msg) => msg.includes('Store "' + missing + '" not found.')));
    } finally {
      console.error = originalConsoleError;
    }
  `;

  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "development",
    },
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
});

test("suggestStoreName still suggests close short matches", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const utilsPath = path.join(repoRoot, "src", "utils.ts");
  const script = `
    const assert = (await import("node:assert")).default;
    const { pathToFileURL } = await import("node:url");
    const { suggestStoreName } = await import(pathToFileURL(${JSON.stringify(utilsPath)}).href);
    const reported = [];
    const originalConsoleWarn = console.warn;
    console.warn = (message) => {
      reported.push(String(message ?? ""));
    };

    try {
      suggestStoreName("usr", ["user", "settings"]);
      assert.ok(reported.some((msg) => msg.includes('Did you mean "user"?')));
    } finally {
      console.warn = originalConsoleWarn;
    }
  `;

  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "development",
    },
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
});

