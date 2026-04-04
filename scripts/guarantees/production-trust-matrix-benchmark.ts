/**
 * Production trust matrix benchmark.
 *
 * WHAT: Benchmarks write latency and lifecycle churn across scope/snapshot/middleware configurations,
 * while asserting cross-store invariants after stress writes.
 * WHY: Production confidence requires proving behavior under different runtime contracts, not one default config.
 */
import fs from "node:fs";
import path from "node:path";
import {
    configureStroid,
    createStore,
    deleteStore,
    getStore,
    hasStore,
    setStore,
    setStoreBatch,
    type StoreOptions,
} from "../../src/index.ts";
import { runCase, formatSummary, type BenchmarkSummary } from "../core/benchmark-helpers.bench.ts";
import { resetAllStoresForTest } from "../../src/helpers/testing.ts";

type Scope = "request" | "global" | "temp";
type Snapshot = "deep" | "shallow" | "ref";
type ResetClone = "deep" | "shallow" | "none";

type TrustScenario = {
    id: string;
    scope: Scope;
    snapshot: Snapshot;
    resetClone: ResetClone;
    middlewareDepth: number;
    writeIterations: number;
    churnIterations: number;
};

type ScenarioResult = {
    id: string;
    scope: Scope;
    snapshot: Snapshot;
    resetClone: ResetClone;
    middlewareDepth: number;
    write: BenchmarkSummary;
    churn: BenchmarkSummary;
    invariants: {
        writeInvariantViolations: number;
        finalPrimary: number | null;
        finalReplica: number | null;
        deleteLeakCount: number;
    };
    passed: boolean;
};

const scenarios: TrustScenario[] = [
    {
        id: "request-deep-default",
        scope: "request",
        snapshot: "deep",
        resetClone: "deep",
        middlewareDepth: 0,
        writeIterations: 20_000,
        churnIterations: 4_000,
    },
    {
        id: "request-shallow-mid-10",
        scope: "request",
        snapshot: "shallow",
        resetClone: "shallow",
        middlewareDepth: 10,
        writeIterations: 20_000,
        churnIterations: 4_000,
    },
    {
        id: "global-ref-mid-4",
        scope: "global",
        snapshot: "ref",
        resetClone: "none",
        middlewareDepth: 4,
        writeIterations: 20_000,
        churnIterations: 4_000,
    },
    {
        id: "temp-deep-mid-2",
        scope: "temp",
        snapshot: "deep",
        resetClone: "deep",
        middlewareDepth: 2,
        writeIterations: 20_000,
        churnIterations: 4_000,
    },
];

const createMiddlewareChain = (depth: number): NonNullable<StoreOptions<{ value: number }>["middleware"]> =>
    Array.from({ length: depth }, (_, index) => (ctx) => {
        // Deliberately touch metadata to simulate real-world middleware fanout.
        if (index === depth - 1 && ctx.action === "set") {
            return ctx.next;
        }
        return undefined;
    });

const runScenario = async (scenario: TrustScenario): Promise<ScenarioResult> => {
    resetAllStoresForTest();
    configureStroid({
        defaultSnapshotMode: scenario.snapshot,
        resetCloneMode: scenario.resetClone,
    });

    const options: StoreOptions<{ value: number }> = {
        scope: scenario.scope,
        snapshot: scenario.snapshot,
        resetClone: scenario.resetClone,
        middleware: createMiddlewareChain(scenario.middlewareDepth),
    };

    const primaryStore = `trust.${scenario.id}.primary`;
    const replicaStore = `trust.${scenario.id}.replica`;
    createStore(primaryStore, { value: 0 }, options);
    createStore(replicaStore, { value: 0 }, options);

    let invariantViolations = 0;
    const write = await runCase({
        name: `trust:${scenario.id}:batched-write`,
        iterations: scenario.writeIterations,
        run: (iteration) => {
            setStoreBatch(() => {
                setStore(primaryStore, "value", iteration);
                setStore(replicaStore, "value", iteration * 2);
            });

            if (iteration % 200 === 0) {
                const primary = getStore(primaryStore, "value") as number | null;
                const replica = getStore(replicaStore, "value") as number | null;
                if (primary != null && replica != null && replica !== primary * 2) {
                    invariantViolations += 1;
                }
            }
        },
    });
    // eslint-disable-next-line no-console
    console.log(formatSummary(write));

    let deleteLeakCount = 0;
    const churn = await runCase({
        name: `trust:${scenario.id}:create-delete-churn`,
        iterations: scenario.churnIterations,
        run: (iteration) => {
            const name = `trust.${scenario.id}.ephemeral.${iteration}`;
            createStore(name, { value: iteration }, options);
            setStore(name, "value", iteration + 1);
            deleteStore(name);
            if (hasStore(name)) {
                deleteLeakCount += 1;
            }
        },
    });
    // eslint-disable-next-line no-console
    console.log(formatSummary(churn));

    const finalPrimary = getStore(primaryStore, "value") as number | null;
    const finalReplica = getStore(replicaStore, "value") as number | null;
    const expectedPrimary = scenario.writeIterations - 1;
    const expectedReplica = expectedPrimary * 2;
    const passed = invariantViolations === 0
        && deleteLeakCount === 0
        && finalPrimary === expectedPrimary
        && finalReplica === expectedReplica;

    return {
        id: scenario.id,
        scope: scenario.scope,
        snapshot: scenario.snapshot,
        resetClone: scenario.resetClone,
        middlewareDepth: scenario.middlewareDepth,
        write,
        churn,
        invariants: {
            writeInvariantViolations: invariantViolations,
            finalPrimary,
            finalReplica,
            deleteLeakCount,
        },
        passed,
    };
};

const main = async (): Promise<void> => {
    const results: ScenarioResult[] = [];
    for (const scenario of scenarios) {
        // eslint-disable-next-line no-console
        console.log(`\n[trust-matrix] running ${scenario.id}`);
        const result = await runScenario(scenario);
        results.push(result);
        // eslint-disable-next-line no-console
        console.log(`[trust-matrix] ${scenario.id} => ${result.passed ? "pass" : "fail"}`);
    }

    const outputDir = path.resolve(process.cwd(), "scripts", "benchmark-results");
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, "production-trust-matrix-output.json");
    const report = {
        generatedAt: new Date().toISOString(),
        node: process.version,
        scenarioCount: results.length,
        passCount: results.filter((result) => result.passed).length,
        failCount: results.filter((result) => !result.passed).length,
        results,
    };
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");
    // eslint-disable-next-line no-console
    console.log(`[trust-matrix] wrote ${outputPath}`);

    if (report.failCount > 0) {
        throw new Error(`[trust-matrix] ${report.failCount} scenario(s) failed invariant checks.`);
    }
};

main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("[trust-matrix] failed", error);
    process.exit(1);
});

