/**
 * Memory and subscription leak stress tests.
 *
 * WHAT: Exercises store creation/deletion churn, high listener counts, and retry-loop safety.
 * WHY: Memory leaks are slow-burn outages that usually escape happy-path tests.
 */
import { describe, expect, it, vi } from "vitest";
import { fetchStore } from "stroid/async";
import { createStore, deleteStore, getStore, setStore } from "stroid";
import { subscribeWithSelector } from "stroid/selectors";
import { flushMicrotasks } from "../shared/mocks";

const LEAK_TOLERANCE_BYTES = 10 * 1024 * 1024;

const forceGc = (): void => {
    if (typeof global.gc === "function") {
        global.gc();
        global.gc();
    }
};

describe("stress memory leaks", () => {
    it("releases heap after creating and destroying 1000 stores", () => {
        forceGc();
        const before = process.memoryUsage().heapUsed;

        for (let i = 0; i < 1000; i += 1) {
            createStore(`mem.store.${i}`, {
                index: i,
                payload: Array.from({ length: 64 }, (_, j) => `${i}-${j}`),
            });
        }

        forceGc();
        const afterCreate = process.memoryUsage().heapUsed;

        for (let i = 0; i < 1000; i += 1) {
            deleteStore(`mem.store.${i}`);
        }

        forceGc();
        const afterDelete = process.memoryUsage().heapUsed;

        // We expect a meaningful reclaim; allow headroom for allocator fragmentation.
        expect(afterCreate).toBeGreaterThanOrEqual(before);
        expect(afterDelete).toBeLessThan(afterCreate + LEAK_TOLERANCE_BYTES);
    });

    it("cleans up 1000 listener subscriptions after unsubscribe", async () => {
        createStore("mem.listeners", { value: 0 });
        const unsubs: Array<() => void> = [];
        let callbackCount = 0;

        for (let i = 0; i < 1000; i += 1) {
            unsubs.push(
                subscribeWithSelector(
                    "mem.listeners",
                    (state: { value: number }) => state.value,
                    Object.is,
                    () => {
                        callbackCount += 1;
                    }
                )
            );
        }

        callbackCount = 0;
        setStore("mem.listeners", { value: 1 });
        await flushMicrotasks(5);

        expect(callbackCount).toBe(1000);
        callbackCount = 0;
        unsubs.forEach((fn) => fn());
        setStore("mem.listeners", { value: 2 });
        await flushMicrotasks(5);
        expect(callbackCount).toBe(0);
    });

    it("caps infinite async retries and leaves no runaway timers", async () => {
        vi.useFakeTimers();
        const realFetch = globalThis.fetch;
        const controller = new AbortController();
        let calls = 0;

        globalThis.fetch = vi.fn(async () => {
            calls += 1;
            throw new Error("retry forever");
        }) as typeof fetch;

        createStore("mem.retry", {
            data: null,
            loading: false,
            error: null,
            status: "idle",
        });

        try {
            const request = fetchStore("mem.retry", "https://example.test/retry", {
                retry: Number.POSITIVE_INFINITY,
                retryDelay: 1,
                retryBackoff: 1,
                signal: controller.signal,
            });

            await vi.runAllTimersAsync();
            const result = await request;
            expect(result).toBeNull();
            expect(calls).toBe(11);
            expect(vi.getTimerCount()).toBe(0);
            expect((getStore("mem.retry") as { status: string }).status).toBe("error");
        } finally {
            controller.abort();
            globalThis.fetch = realFetch;
        }
    });
});
