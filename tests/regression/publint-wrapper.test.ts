/**
 * @module tests/regression/publint-wrapper
 *
 * LAYER: Regression
 * OWNS:  Windows-safe command execution guarantees for the publint script wrapper.
 *
 * Consumers: Test runner.
 */
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runPublint } from "../../scripts/run-publint.mjs";

test("run-publint uses shell execution on win32 for .cmd entrypoints", () => {
  const cacheDir = path.join(os.tmpdir(), `stroid-publint-wrapper-${Date.now()}`);
  let captured: {
    command: string;
    args: string[];
    options: {
      shell?: boolean;
      env?: Record<string, string | undefined>;
    };
  } | null = null;

  const code = runPublint({
    argv: ["--version"],
    platform: "win32",
    env: {
      STROID_NPM_CACHE: cacheDir,
    },
    pid: 42,
    spawnSyncImpl: (command: string, args: ReadonlyArray<string>, options: unknown) => {
      captured = {
        command,
        args: [...args],
        options: options as { shell?: boolean; env?: Record<string, string | undefined> },
      };
      return {
        status: 0,
      };
    },
    stderr: {
      write: () => true,
    },
  });

  assert.strictEqual(code, 0);
  assert.ok(captured, "expected spawnSync to be called");
  assert.strictEqual(captured?.command, "publint.cmd");
  assert.deepStrictEqual(captured?.args, ["--version"]);
  assert.strictEqual(captured?.options.shell, true);
  assert.strictEqual(captured?.options.env?.npm_config_cache, cacheDir);
  assert.strictEqual(captured?.options.env?.NPM_CONFIG_CACHE, cacheDir);
  assert.strictEqual(fs.existsSync(cacheDir), true);
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

test("run-publint surfaces spawn errors and exits non-zero", () => {
  const errors: string[] = [];

  const code = runPublint({
    argv: ["--version"],
    platform: "win32",
    env: {},
    pid: 43,
    spawnSyncImpl: () => ({
      status: null,
      error: Object.assign(new Error("spawnSync publint.cmd EINVAL"), {
        code: "EINVAL",
      }),
    }),
    stderr: {
      write: (chunk: string) => {
        errors.push(String(chunk));
        return true;
      },
    },
  });

  assert.strictEqual(code, 1);
  const output = errors.join("");
  assert.match(output, /publint wrapper failed to start/i);
  assert.match(output, /EINVAL/i);
});
