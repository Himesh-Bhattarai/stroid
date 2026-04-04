/**
 * Regression test for benchmark script layout and command wiring.
 *
 * WHAT: Verifies benchmark npm scripts resolve to existing files under the categorized scripts folders.
 * WHY: Prevents path drift after benchmark file moves (core/ssr/hydration/react/guarantees/comparison).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageJsonPath = path.join(repoRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
};

const benchmarkScriptNames = Object.keys(packageJson.scripts ?? {})
    .filter((name) => name.startsWith("benchmark:"))
    .concat(["bench:stress", "bench:stress:check"])
    .filter((name, index, all) => all.indexOf(name) === index);

describe("benchmark script layout regression", () => {
    it("keeps benchmark commands pointed at categorized script folders", () => {
        for (const name of benchmarkScriptNames) {
            const command = packageJson.scripts?.[name];
            expect(command, `missing npm script: ${name}`).toBeTypeOf("string");
            const match = command!.match(/scripts\/[A-Za-z0-9_./-]+\.(?:ts|bench\.ts)/);
            expect(match, `script command for ${name} should reference a scripts/*.ts entry`).not.toBeNull();
            const relativeScriptPath = match![0]!;
            const absoluteScriptPath = path.resolve(repoRoot, relativeScriptPath);
            expect(fs.existsSync(absoluteScriptPath), `missing file for ${name}: ${relativeScriptPath}`).toBe(true);
            if (name.startsWith("benchmark:")) {
                expect(
                    /^scripts\/(core|ssr|hydration|react|guarantees|comparison)\//.test(relativeScriptPath),
                    `benchmark script ${name} should be in a categorized scripts folder: ${relativeScriptPath}`,
                ).toBe(true);
            }
        }
    });
});
