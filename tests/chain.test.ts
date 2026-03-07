import test from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("chain surfaces missing-store reads and writes in production", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const chainPath = path.join(repoRoot, "src", "chain.ts");
  const script = `
    const assert = (await import("node:assert")).default;
    const { pathToFileURL } = await import("node:url");
    const { chain } = await import(pathToFileURL(${JSON.stringify(chainPath)}).href);

    const reported = [];
    const originalConsoleError = console.error;
    console.error = (message) => {
      reported.push(String(message ?? ""));
    };

    try {
      const missing = chain("missingStore");
      assert.strictEqual(missing.value, null);
      missing.set({ value: 1 });
      assert.strictEqual(missing.target("field").value, null);
      missing.target("field").set(1);
      assert.ok(reported.some((msg) => msg.includes('chain("missingStore") cannot read because the store does not exist yet')));
      assert.ok(reported.some((msg) => msg.includes('chain("missingStore") cannot write because the store does not exist yet')));
    } finally {
      console.error = originalConsoleError;
    }
  `;

  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
});
