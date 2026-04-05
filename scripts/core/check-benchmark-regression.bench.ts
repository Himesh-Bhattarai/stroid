/**
 * Benchmark regression gate.
 *
 * WHAT: Compares latest benchmark ops/sec against a stored baseline.
 * WHY: Protects PRs from silently introducing significant (>20%) performance regressions.
 */
import fs from "node:fs";
import path from "node:path";

type BenchmarkSummary = {
    name: string;
    iterations: number;
    opsPerSec: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    totalMs: number;
    memoryDeltaBytes: number;
};

type BenchmarkRecord = {
    id: string;
    library: string;
    summary: BenchmarkSummary;
    details?: Record<string, unknown>;
};

type BenchmarkReport = {
    generatedAt: string;
    node: string;
    environment?: {
        platform?: string;
        arch?: string;
        node?: string;
        cpuModel?: string;
        cpuCount?: number;
        totalMemMb?: number;
        freeMemMb?: number;
        loadAvg?: number[];
        host?: string;
        runContext?: {
            ci?: boolean;
            githubRunId?: string | null;
            githubSha?: string | null;
            githubRef?: string | null;
        };
    };
    records: BenchmarkRecord[];
};

const REGRESSION_THRESHOLD = 0.80; // fail below 80% of baseline ops/sec
const root = process.cwd();
const latestPath = process.argv[2] ?? path.resolve(root, "scripts", "benchmark-results", "latest.json");
const baselinePath = process.argv[3] ?? path.resolve(root, "scripts", "benchmark-results", "baseline.json");
const summaryPath = path.resolve(root, "scripts", "benchmark-results", "summary.md");

const readReport = (filePath: string): BenchmarkReport => {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Benchmark file not found: ${filePath}`);
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as BenchmarkReport;
};

const keyOf = (record: BenchmarkRecord): string => `${record.id}::${record.library}`;

const formatPct = (ratio: number): string => `${(ratio * 100).toFixed(2)}%`;

const formatEnv = (report: BenchmarkReport): string => {
    const env = report.environment;
    if (!env) return `node=${report.node}, generatedAt=${report.generatedAt}`;
    const load = Array.isArray(env.loadAvg) ? env.loadAvg.map((value) => value.toFixed(2)).join(", ") : "n/a";
    return [
        `node=${env.node ?? report.node}`,
        `platform=${env.platform ?? "unknown"}`,
        `arch=${env.arch ?? "unknown"}`,
        `cpu=${env.cpuModel ?? "unknown"} x${env.cpuCount ?? "?"}`,
        `mem=${env.totalMemMb ?? "?"}MB`,
        `load=[${load}]`,
        `generatedAt=${report.generatedAt}`,
        env.runContext?.githubRunId ? `runId=${env.runContext.githubRunId}` : "",
        env.runContext?.githubSha ? `sha=${env.runContext.githubSha?.slice(0, 12)}` : "",
    ].filter(Boolean).join(", ");
};

const main = (): void => {
    const latest = readReport(latestPath);
    const baseline = readReport(baselinePath);
    const latestMap = new Map(latest.records.map((record) => [keyOf(record), record]));

    const lines: string[] = [
        "# Benchmark Comparison",
        "",
        `- Baseline: \`${baselinePath}\``,
        `- Latest: \`${latestPath}\``,
        `- Threshold: ${formatPct(REGRESSION_THRESHOLD)} of baseline ops/sec`,
        `- Baseline origin: ${formatEnv(baseline)}`,
        `- Latest origin: ${formatEnv(latest)}`,
        "",
        "| Benchmark | Library | Baseline ops/sec | Latest ops/sec | Ratio | Status |",
        "|---|---:|---:|---:|---:|---|",
    ];

    const failures: string[] = [];

    baseline.records.forEach((baseRecord) => {
        const latestRecord = latestMap.get(keyOf(baseRecord));
        if (!latestRecord) {
            const label = `${baseRecord.id} (${baseRecord.library})`;
            failures.push(`missing benchmark in latest report: ${label}`);
            lines.push(`| ${baseRecord.id} | ${baseRecord.library} | ${baseRecord.summary.opsPerSec.toFixed(2)} | n/a | n/a | missing |`);
            return;
        }

        const baseOps = baseRecord.summary.opsPerSec;
        const latestOps = latestRecord.summary.opsPerSec;
        const ratio = baseOps <= 0 ? 1 : latestOps / baseOps;
        const status = ratio < REGRESSION_THRESHOLD ? "regressed" : "ok";
        lines.push(
            `| ${baseRecord.id} | ${baseRecord.library} | ${baseOps.toFixed(2)} | ${latestOps.toFixed(2)} | ${formatPct(ratio)} | ${status} |`
        );

        if (ratio < REGRESSION_THRESHOLD) {
            failures.push(
                `${baseRecord.id} (${baseRecord.library}) regressed to ${formatPct(ratio)} `
                + `(baseline ${baseOps.toFixed(2)} ops/sec, latest ${latestOps.toFixed(2)} ops/sec)`
            );
        }
    });

    fs.writeFileSync(summaryPath, `${lines.join("\n")}\n`, "utf8");

    if (failures.length > 0) {
        // eslint-disable-next-line no-console
        console.error("[benchmark-regression] failed:");
        failures.forEach((failure) => {
            // eslint-disable-next-line no-console
            console.error(`- ${failure}`);
        });
        process.exit(1);
    }

    // eslint-disable-next-line no-console
    console.log(`[benchmark-regression] passed. Summary: ${summaryPath}`);
};

main();
