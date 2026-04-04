/**
 * Run all benchmark scripts and capture execution metadata.
 *
 * WHAT: Executes every benchmark entrypoint plus stress benchmarks in sequence.
 * WHY: Production certification should use one deterministic command that proves the whole benchmark matrix still runs.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const packageJsonPath = path.resolve(root, "package.json");
const outputDir = path.resolve(root, "scripts", "benchmark-results");
const outputJsonPath = path.join(outputDir, "run-all-benchmarks-summary.json");
const outputMdPath = path.join(outputDir, "run-all-benchmarks-summary.md");

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
};
const scriptNames = Object.keys(packageJson.scripts ?? {});

const benchmarkScripts = scriptNames
    .filter((name) => name.startsWith("benchmark:") && name !== "benchmark:all")
    .sort((a, b) => a.localeCompare(b));

const extras = ["bench:stress"]
    .filter((name) => scriptNames.includes(name));

const uniqueScripts = [...benchmarkScripts];
extras.forEach((name) => {
    if (!uniqueScripts.includes(name)) uniqueScripts.push(name);
});

const startedAtIso = new Date().toISOString();
const runs: Array<{
    name: string;
    startedAt: string;
    endedAt: string;
    durationMs: number;
    exitCode: number;
    ok: boolean;
    spawnError: string | null;
}> = [];

for (const name of uniqueScripts) {
    const startedAt = Date.now();
    // eslint-disable-next-line no-console
    console.log(`\n[benchmark:all] running ${name}`);
    const result = spawnSync(`npm run ${name}`, {
        shell: true,
        cwd: root,
        stdio: "inherit",
        env: process.env,
    });
    const endedAt = Date.now();
    const durationMs = endedAt - startedAt;
    const spawnError = result.error
        ? `${result.error.name}: ${result.error.message}`
        : null;
    const exitCode = typeof result.status === "number" ? result.status : 1;
    runs.push({
        name,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
        durationMs,
        exitCode,
        ok: exitCode === 0,
        spawnError,
    });
}

const failed = runs.filter((run) => !run.ok);
const report = {
    startedAt: startedAtIso,
    finishedAt: new Date().toISOString(),
    node: process.version,
    scriptCount: runs.length,
    passCount: runs.length - failed.length,
    failCount: failed.length,
    runs,
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputJsonPath, JSON.stringify(report, null, 2), "utf8");

const markdownLines = [
    "# Benchmark Run Summary",
    "",
    `- Started: \`${report.startedAt}\``,
    `- Finished: \`${report.finishedAt}\``,
    `- Node: \`${report.node}\``,
    `- Scripts: \`${report.scriptCount}\``,
    `- Passed: \`${report.passCount}\``,
    `- Failed: \`${report.failCount}\``,
    "",
    "| Script | Duration (s) | Exit | Status |",
    "| --- | ---: | ---: | --- |",
    ...runs.map((run) =>
        `| ${run.name} | ${(run.durationMs / 1000).toFixed(2)} | ${run.exitCode} | ${run.ok ? "pass" : "fail"} |`
    ),
    "",
];
fs.writeFileSync(outputMdPath, `${markdownLines.join("\n")}\n`, "utf8");

// eslint-disable-next-line no-console
console.log(`[benchmark:all] wrote ${outputJsonPath}`);
// eslint-disable-next-line no-console
console.log(`[benchmark:all] wrote ${outputMdPath}`);

if (failed.length > 0) {
    // eslint-disable-next-line no-console
    console.error("[benchmark:all] failing scripts:");
    failed.forEach((run) => {
        // eslint-disable-next-line no-console
        console.error(`- ${run.name} (exit ${run.exitCode}${run.spawnError ? `, ${run.spawnError}` : ""})`);
    });
    process.exit(1);
}
