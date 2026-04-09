/**
 * Gate Me suite runner.
 *
 * WHAT: Runs the full test + benchmark matrix used for on-demand deep gating.
 * WHY: "status(010): Gate me" should execute an exhaustive pass without making every push/PR pay that cost.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const pkgPath = path.resolve(root, "package.json");
const outputDir = path.resolve(root, "scripts", "benchmark-results");
const reportJsonPath = path.join(outputDir, "gate-me-report.json");
const reportMdPath = path.join(outputDir, "gate-me-report.md");
const benchmarkSummaryPath = path.join(outputDir, "run-all-benchmarks-summary.json");

const marker = process.env.GATE_MARKER ?? "status(010): Gate me";
const eventName = process.env.GATE_EVENT_NAME ?? "local";
const refName = process.env.GATE_REF ?? "local";
const sha = process.env.GATE_SHA ?? "local";
const actor = process.env.GATE_ACTOR ?? "local";
const triggerReason = process.env.GATE_TRIGGER_REASON ?? "manual/local";

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const scriptNames = Object.keys(pkg.scripts ?? {});

const isWrapper = new Set(["test:all", "test:full", "test:heavy"]);
const coveredByTypes = scriptNames.includes("test:types")
    ? new Set(["test:dts", "test:package"])
    : new Set();
const testScripts = scriptNames
    .filter((name) => name === "test" || name.startsWith("test:"))
    .filter((name) => !isWrapper.has(name))
    // test:types already runs build + test:dts + test:package in this repo.
    // Running those standalone before test:types can fail on a clean checkout.
    .filter((name) => !coveredByTypes.has(name))
    .sort((a, b) => {
        if (a === "test") return -1;
        if (b === "test") return 1;
        return a.localeCompare(b);
    });

const benchmarkScripts = ["benchmark:all", "bench:stress:check"]
    .filter((name) => scriptNames.includes(name));

const runCommand = (command, type) => {
    const startedAtMs = Date.now();
    // eslint-disable-next-line no-console
    console.log(`\n[gate-me] running ${command}`);
    const result = spawnSync(command, {
        shell: true,
        cwd: root,
        env: process.env,
        encoding: "utf8",
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    const endedAtMs = Date.now();
    const exitCode = typeof result.status === "number" ? result.status : 1;
    return {
        type,
        command,
        startedAt: new Date(startedAtMs).toISOString(),
        endedAt: new Date(endedAtMs).toISOString(),
        durationMs: endedAtMs - startedAtMs,
        exitCode,
        ok: exitCode === 0,
        error: result.error ? `${result.error.name}: ${result.error.message}` : null,
    };
};

const startedAt = new Date().toISOString();
const runs = [];

for (const scriptName of testScripts) {
    const command = scriptName === "test" ? "npm test" : `npm run ${scriptName}`;
    runs.push(runCommand(command, "test"));
}

for (const scriptName of benchmarkScripts) {
    runs.push(runCommand(`npm run ${scriptName}`, "benchmark"));
}

let benchmarkSummary = null;
if (fs.existsSync(benchmarkSummaryPath)) {
    benchmarkSummary = JSON.parse(fs.readFileSync(benchmarkSummaryPath, "utf8"));
}

const finishedAt = new Date().toISOString();
const failedRuns = runs.filter((run) => !run.ok);
const hasBenchmarkFailures = benchmarkSummary !== null && Number(benchmarkSummary.failCount ?? 0) > 0;
const ok = failedRuns.length === 0 && !hasBenchmarkFailures;

const report = {
    marker,
    eventName,
    refName,
    sha,
    actor,
    triggerReason,
    startedAt,
    finishedAt,
    node: process.version,
    totals: {
        scriptRuns: runs.length,
        passedRuns: runs.filter((run) => run.ok).length,
        failedRuns: failedRuns.length,
    },
    tests: {
        selectedScripts: testScripts,
        runCount: runs.filter((run) => run.type === "test").length,
    },
    benchmarks: {
        selectedScripts: benchmarkScripts,
        runCount: runs.filter((run) => run.type === "benchmark").length,
        benchmarkAllSummary: benchmarkSummary,
    },
    runs,
    ok,
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2), "utf8");

const testRows = runs
    .filter((run) => run.type === "test")
    .map((run) => `| ${run.command} | ${(run.durationMs / 1000).toFixed(2)} | ${run.exitCode} | ${run.ok ? "pass" : "fail"} |`);

const benchmarkRows = runs
    .filter((run) => run.type === "benchmark")
    .map((run) => `| ${run.command} | ${(run.durationMs / 1000).toFixed(2)} | ${run.exitCode} | ${run.ok ? "pass" : "fail"} |`);

const benchmarkAllRows = benchmarkSummary?.runs
    ? benchmarkSummary.runs.map((run) =>
        `| ${run.name} | ${(Number(run.durationMs) / 1000).toFixed(2)} | ${run.exitCode} | ${run.ok ? "pass" : "fail"} |`)
    : [];

const lines = [
    "# Gate Me Report",
    "",
    "## Trigger",
    `- Marker: \`${marker}\``,
    `- Event: \`${eventName}\``,
    `- Ref: \`${refName}\``,
    `- SHA: \`${sha}\``,
    `- Actor: \`${actor}\``,
    `- Reason: \`${triggerReason}\``,
    "",
    "## Overall",
    `- Started: \`${startedAt}\``,
    `- Finished: \`${finishedAt}\``,
    `- Node: \`${process.version}\``,
    `- Script runs: \`${report.totals.scriptRuns}\``,
    `- Passed: \`${report.totals.passedRuns}\``,
    `- Failed: \`${report.totals.failedRuns}\``,
    `- Final status: \`${ok ? "PASS" : "FAIL"}\``,
    "",
    "## Tests",
    "| Command | Duration (s) | Exit | Status |",
    "| --- | ---: | ---: | --- |",
    ...(testRows.length > 0 ? testRows : ["| (none) | 0.00 | 0 | pass |"]),
    "",
    "## Benchmarks",
    "| Command | Duration (s) | Exit | Status |",
    "| --- | ---: | ---: | --- |",
    ...(benchmarkRows.length > 0 ? benchmarkRows : ["| (none) | 0.00 | 0 | pass |"]),
    "",
    "## benchmark:all details",
    ...(benchmarkSummary
        ? [
            `- Scripts: \`${benchmarkSummary.scriptCount}\``,
            `- Passed: \`${benchmarkSummary.passCount}\``,
            `- Failed: \`${benchmarkSummary.failCount}\``,
            "",
            "| Script | Duration (s) | Exit | Status |",
            "| --- | ---: | ---: | --- |",
            ...benchmarkAllRows,
        ]
        : ["- benchmark:all summary file not found"]),
    "",
];

fs.writeFileSync(reportMdPath, `${lines.join("\n")}\n`, "utf8");

// eslint-disable-next-line no-console
console.log(`[gate-me] wrote ${reportJsonPath}`);
// eslint-disable-next-line no-console
console.log(`[gate-me] wrote ${reportMdPath}`);

if (!ok) {
    // eslint-disable-next-line no-console
    console.error("[gate-me] suite failed");
    process.exit(1);
}
