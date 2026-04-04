/**
 * Stress benchmark suite (custom runner).
 *
 * WHAT: Measures hot-path operations with ops/sec, p50/p95/p99 latency, and heap delta.
 * WHY: Performance regressions in state engines show up first in tail latency and memory churn.
 */
import fs from "node:fs";
import path from "node:path";
import { atom } from "jotai";
import { createStore as createJotaiStore } from "jotai/vanilla";
import { createStore as createZustandStore } from "zustand/vanilla";
import {
    createStore as createStroidStore,
    getStore as getStroidStore,
    setStore as setStroidStore,
} from "../../src/index.ts";
import { fetchStore } from "../../src/async.ts";
import { createSelector } from "../../src/selectors/index.ts";
import { installSync } from "../../src/sync.ts";
import { installPersist } from "../../src/persist.ts";
import { resetAllStoresForTest } from "../../src/helpers/testing.ts";
import { formatSummary, runCase, type BenchmarkSummary } from "./benchmark-helpers.bench.ts";

type LibraryName = "stroid" | "zustand" | "jotai";
type BenchmarkRecord = {
    id: string;
    library: LibraryName;
    summary: BenchmarkSummary;
    details?: Record<string, unknown>;
};

type SyncPayload = {
    v: number;
    protocol: number;
    type: "sync-state";
    name: string;
    clock: number;
    source: string;
    updatedAt: number;
    data: unknown;
    checksum: null;
};

class BenchBroadcastChannel {
    private static channels = new Map<string, Set<BenchBroadcastChannel>>();
    readonly name: string;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    constructor(name: string) {
        this.name = name;
        const peers = BenchBroadcastChannel.channels.get(name) ?? new Set<BenchBroadcastChannel>();
        peers.add(this);
        BenchBroadcastChannel.channels.set(name, peers);
    }
    postMessage(data: unknown): void {
        const peers = BenchBroadcastChannel.channels.get(this.name) ?? new Set<BenchBroadcastChannel>();
        peers.forEach((peer) => {
            if (peer === this) return;
            queueMicrotask(() => {
                peer.onmessage?.({ data });
            });
        });
    }
    close(): void {
        const peers = BenchBroadcastChannel.channels.get(this.name);
        peers?.delete(this);
        if (peers && peers.size === 0) BenchBroadcastChannel.channels.delete(this.name);
    }
    addEventListener(): void {}
    removeEventListener(): void {}
    dispatchEvent(): boolean { return true; }
    static reset(): void {
        BenchBroadcastChannel.channels.clear();
    }
}

const makeDeep = (value: number) => ({
    l1: {
        l2: {
            l3: {
                l4: {
                    l5: { value },
                },
            },
        },
    },
    cold: 0,
});

const makeAsyncState = () => ({
    data: null as unknown,
    loading: false,
    error: null as string | null,
    status: "idle" as const,
});

const identityPersistConfig = (driver: Map<string, string>, key: string) => ({
    driver: {
        getItem: (k: string) => driver.get(k) ?? null,
        setItem: (k: string, v: string) => {
            driver.set(k, v);
        },
        removeItem: (k: string) => {
            driver.delete(k);
        },
    },
    key,
    serialize: JSON.stringify,
    deserialize: JSON.parse,
    encrypt: (v: string) => v,
    decrypt: (v: string) => v,
    allowPlaintext: true,
    checksum: "hash" as const,
});

const roundSummaryToPerRequest = (roundSummary: BenchmarkSummary, requestsPerRound: number): BenchmarkSummary => {
    const totalRequests = roundSummary.iterations * requestsPerRound;
    return {
        ...roundSummary,
        iterations: totalRequests,
        opsPerSec: totalRequests / (roundSummary.totalMs / 1000),
        p50Ms: roundSummary.p50Ms / requestsPerRound,
        p95Ms: roundSummary.p95Ms / requestsPerRound,
        p99Ms: roundSummary.p99Ms / requestsPerRound,
    };
};

const run = async (): Promise<void> => {
    installSync();
    installPersist();

    const records: BenchmarkRecord[] = [];
    const push = (id: string, library: LibraryName, summary: BenchmarkSummary, details?: Record<string, unknown>): void => {
        records.push({ id, library, summary, details });
        // eslint-disable-next-line no-console
        console.log(formatSummary(summary));
    };

    // createStore x 10,000
    resetAllStoresForTest();
    {
        let counter = 0;
        const summary = await runCase({
            name: "stroid:createStore x10000",
            iterations: 10_000,
            run: () => {
                counter += 1;
                createStroidStore(`bench.stroid.create.${counter}`, { value: counter });
            },
        });
        push("create_store_10000", "stroid", summary);
    }
    resetAllStoresForTest();
    {
        let counter = 0;
        const summary = await runCase({
            name: "zustand:createStore x10000",
            iterations: 10_000,
            run: () => {
                counter += 1;
                const store = createZustandStore<{ value: number }>(() => ({ value: counter }));
                void store.getState().value;
            },
        });
        push("create_store_10000", "zustand", summary);
    }
    {
        let counter = 0;
        const summary = await runCase({
            name: "jotai:createStore x10000",
            iterations: 10_000,
            run: () => {
                counter += 1;
                const store = createJotaiStore();
                const stateAtom = atom(counter);
                store.get(stateAtom);
            },
        });
        push("create_store_10000", "jotai", summary);
    }

    // setStore primitive x 100,000
    resetAllStoresForTest();
    {
        createStroidStore("bench.stroid.primitive", { value: 0 });
        const summary = await runCase({
            name: "stroid:set primitive x100000",
            iterations: 100_000,
            run: (i) => {
                setStroidStore("bench.stroid.primitive", "value", i);
            },
        });
        push("set_primitive_100000", "stroid", summary);
    }
    resetAllStoresForTest();
    {
        const store = createZustandStore<{ value: number }>(() => ({ value: 0 }));
        const summary = await runCase({
            name: "zustand:set primitive x100000",
            iterations: 100_000,
            run: (i) => {
                store.setState({ value: i });
            },
        });
        push("set_primitive_100000", "zustand", summary);
    }
    {
        const store = createJotaiStore();
        const valueAtom = atom(0);
        const summary = await runCase({
            name: "jotai:set primitive x100000",
            iterations: 100_000,
            run: (i) => {
                store.set(valueAtom, i);
            },
        });
        push("set_primitive_100000", "jotai", summary);
    }

    // set deep nested object x 10,000
    resetAllStoresForTest();
    {
        createStroidStore("bench.stroid.deep", makeDeep(0));
        const summary = await runCase({
            name: "stroid:set deep x10000",
            iterations: 10_000,
            run: (i) => {
                setStroidStore("bench.stroid.deep", ["l1", "l2", "l3", "l4", "l5", "value"], i);
            },
        });
        push("set_deep_10000", "stroid", summary);
    }
    resetAllStoresForTest();
    {
        const store = createZustandStore(() => makeDeep(0));
        const summary = await runCase({
            name: "zustand:set deep x10000",
            iterations: 10_000,
            run: (i) => {
                store.setState((prev) => ({
                    ...prev,
                    l1: {
                        ...prev.l1,
                        l2: {
                            ...prev.l1.l2,
                            l3: {
                                ...prev.l1.l2.l3,
                                l4: {
                                    ...prev.l1.l2.l3.l4,
                                    l5: { value: i },
                                },
                            },
                        },
                    },
                }));
            },
        });
        push("set_deep_10000", "zustand", summary);
    }
    {
        const stateAtom = atom(makeDeep(0));
        const store = createJotaiStore();
        const summary = await runCase({
            name: "jotai:set deep x10000",
            iterations: 10_000,
            run: (i) => {
                const prev = store.get(stateAtom);
                store.set(stateAtom, {
                    ...prev,
                    l1: {
                        ...prev.l1,
                        l2: {
                            ...prev.l1.l2,
                            l3: {
                                ...prev.l1.l2.l3,
                                l4: {
                                    ...prev.l1.l2.l3.l4,
                                    l5: { value: i },
                                },
                            },
                        },
                    },
                });
            },
        });
        push("set_deep_10000", "jotai", summary);
    }

    // Selector recomputation on irrelevant update x 10,000
    resetAllStoresForTest();
    {
        createStroidStore("bench.stroid.selector", { hot: 1, cold: 0 });
        let recompute = 0;
        const selector = createSelector<{ hot: number; cold: number }, number>(
            "bench.stroid.selector",
            (state) => {
                recompute += 1;
                return state.hot;
            }
        );
        selector();
        const summary = await runCase({
            name: "stroid:selector irrelevant update x10000",
            iterations: 10_000,
            run: (i) => {
                setStroidStore("bench.stroid.selector", "cold", i);
                selector();
            },
        });
        push("selector_irrelevant_update_10000", "stroid", summary, { recompute });
    }
    resetAllStoresForTest();
    {
        const store = createZustandStore<{ hot: number; cold: number }>(() => ({ hot: 1, cold: 0 }));
        let recompute = 0;
        const selectHot = (state: { hot: number }): number => {
            recompute += 1;
            return state.hot;
        };
        selectHot(store.getState());
        const summary = await runCase({
            name: "zustand:selector irrelevant update x10000",
            iterations: 10_000,
            run: (i) => {
                store.setState({ cold: i });
                selectHot(store.getState());
            },
        });
        push("selector_irrelevant_update_10000", "zustand", summary, { recompute });
    }
    {
        const baseAtom = atom({ hot: 1, cold: 0 });
        let recompute = 0;
        const hotAtom = atom((get) => {
            recompute += 1;
            return get(baseAtom).hot;
        });
        const store = createJotaiStore();
        store.get(hotAtom);
        const summary = await runCase({
            name: "jotai:selector irrelevant update x10000",
            iterations: 10_000,
            run: (i) => {
                const prev = store.get(baseAtom);
                store.set(baseAtom, { ...prev, cold: i });
                store.get(hotAtom);
            },
        });
        push("selector_irrelevant_update_10000", "jotai", summary, { recompute });
    }

    // Full store serialize + persist x 1,000 (stroid specific)
    resetAllStoresForTest();
    {
        const persistDriver = new Map<string, string>();
        const key = "bench.persist.key";
        createStroidStore("bench.stroid.persist", {
            index: 0,
            payload: Array.from({ length: 512 }, (_, i) => `v-${i}`),
        }, {
            persist: identityPersistConfig(persistDriver, key),
        });

        const summary = await runCase({
            name: "stroid:serialize+persist x1000",
            iterations: 1_000,
            run: async (i) => {
                setStroidStore("bench.stroid.persist", {
                    index: i,
                    payload: Array.from({ length: 512 }, (_, j) => `v-${i}-${j}`),
                });
                await new Promise((resolve) => setTimeout(resolve, 0));
                if (!persistDriver.has(key)) {
                    throw new Error("persist driver did not receive payload");
                }
            },
        });
        push("persist_cycle_1000", "stroid", summary);
    }

    // BroadcastChannel dispatch + receive x 10,000 (stroid specific)
    resetAllStoresForTest();
    {
        const originalWindow = (globalThis as Record<string, unknown>).window;
        const originalBroadcast = (globalThis as Record<string, unknown>).BroadcastChannel;
        (globalThis as Record<string, unknown>).window = {
            addEventListener: () => {},
            removeEventListener: () => {},
        };
        (globalThis as Record<string, unknown>).BroadcastChannel = BenchBroadcastChannel as unknown as typeof BroadcastChannel;
        BenchBroadcastChannel.reset();

        try {
            createStroidStore("bench.stroid.sync", { value: 0 }, {
                sync: {
                    policy: "insecure",
                    channel: "bench.sync.channel",
                    checksum: "none",
                },
            });
            const peer = new BenchBroadcastChannel("bench.sync.channel");
            const summary = await runCase({
                name: "stroid:broadcast receive x10000",
                iterations: 10_000,
                run: async (i) => {
                    const payload: SyncPayload = {
                        v: 1,
                        protocol: 1,
                        type: "sync-state",
                        name: "bench.stroid.sync",
                        clock: i + 1,
                        source: "peer",
                        updatedAt: Date.now() + i,
                        data: { value: i },
                        checksum: null,
                    };
                    peer.postMessage(payload);
                    await Promise.resolve();
                },
            });
            push("broadcast_dispatch_receive_10000", "stroid", summary, {
                finalValue: (getStroidStore("bench.stroid.sync") as { value: number } | null)?.value ?? null,
            });
            peer.close();
        } finally {
            if (originalWindow === undefined) delete (globalThis as Record<string, unknown>).window;
            else (globalThis as Record<string, unknown>).window = originalWindow;

            if (originalBroadcast === undefined) delete (globalThis as Record<string, unknown>).BroadcastChannel;
            else (globalThis as Record<string, unknown>).BroadcastChannel = originalBroadcast;
        }
    }

    // Async store with TTL: 100 concurrent keys x 100 fetches each (10,000 requests total)
    resetAllStoresForTest();
    {
        const realFetch = globalThis.fetch;
        const controller = new AbortController();
        let responseId = 0;
        globalThis.fetch = (async () => {
            responseId += 1;
            return {
                ok: true,
                status: 200,
                statusText: "OK",
                headers: { get: () => "application/json" },
                json: async () => ({ id: responseId }),
                text: async () => JSON.stringify({ id: responseId }),
            } as unknown as Response;
        }) as typeof fetch;

        try {
            const keys = Array.from({ length: 100 }, (_, i) => `bench.stroid.async.${i}`);
            keys.forEach((key) => {
                createStroidStore(key, makeAsyncState());
            });

            const rounds = 100;
            const perRound = keys.length;
            const roundSummary = await runCase({
                name: "stroid:async ttl 100x100 (rounds)",
                iterations: rounds,
                run: async (round) => {
                    await Promise.all(keys.map((key, index) =>
                        fetchStore(
                            key,
                            `https://bench.async/${index}?r=${round}`,
                            {
                                ttl: 5,
                                dedupe: false,
                                signal: controller.signal,
                            }
                        )
                    ));
                },
            });
            const perRequestSummary = roundSummaryToPerRequest(roundSummary, perRound);
            push("async_ttl_100_concurrent_x_100_rounds", "stroid", perRequestSummary, {
                rounds,
                concurrentKeys: perRound,
                totalRequests: rounds * perRound,
                latencyMode: "round_latency_divided_by_concurrency",
            });
        } finally {
            controller.abort();
            globalThis.fetch = realFetch;
        }
    }

    const outputDir = path.resolve(process.cwd(), "scripts", "benchmark-results");
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, "latest.json");
    const report = {
        generatedAt: new Date().toISOString(),
        node: process.version,
        records,
    };
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");
    // eslint-disable-next-line no-console
    console.log(`[benchmark] wrote ${outputPath}`);
};

run().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[benchmark] failed", err);
    process.exit(1);
});
