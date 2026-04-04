/**
 * Regression test for benchmark script layout and command wiring.
 *
 * WHAT: Verifies benchmark npm scripts resolve to existing files under the categorized scripts folders.
 * WHY: Prevents path drift after benchmark file moves (core/ssr/hydration/react/guarantees/comparison).
 */
import fs from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageJsonPath = path.join(repoRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
};

const benchmarkScriptNames = Object.keys(packageJson.scripts ?? {})
    .filter((name) => name.startsWith("benchmark:"))
    .concat(["bench:stress", "bench:stress:check"])
    .filter((name, index, all) => all.indexOf(name) === index);

test("benchmark script layout regression: benchmark commands stay wired to categorized folders", () => {
    for (const name of benchmarkScriptNames) {
        const command = packageJson.scripts?.[name];
        assert.equal(typeof command, "string", `missing npm script: ${name}`);
        const match = command!.match(/scripts\/[A-Za-z0-9_./-]+\.(?:ts|bench\.ts)/);
        assert.ok(match, `script command for ${name} should reference a scripts/*.ts entry`);
        const relativeScriptPath = match[0]!;
        const absoluteScriptPath = path.resolve(repoRoot, relativeScriptPath);
        assert.equal(fs.existsSync(absoluteScriptPath), true, `missing file for ${name}: ${relativeScriptPath}`);
        if (name.startsWith("benchmark:")) {
            assert.equal(
                /^scripts\/(core|ssr|hydration|react|guarantees|comparison)\//.test(relativeScriptPath),
                true,
                `benchmark script ${name} should be in a categorized scripts folder: ${relativeScriptPath}`,
            );
        }
    }
});
