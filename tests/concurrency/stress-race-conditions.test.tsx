/**
 * Concurrency and race-condition stress tests.
 *
 * WHAT: Simulates high-frequency writes, concurrent React consumers, and async dedupe/abort/TTL/focus races.
 * WHY: Race bugs only show up under timing pressure and can silently produce stale or divergent state in production.
 */
import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createStore, deleteStore, getStore, hasStore, setStore } from "stroid";
import { enableRevalidateOnFocus, fetchStore } from "stroid/async";
import { useAsyncStore, useStore } from "stroid/react";
import { flushMicrotasks } from "../shared/mocks";

const makeJsonResponse = (data: unknown): Response => ({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => "application/json" },
    json: async () => data,
    text: async () => JSON.stringify(data),
} as unknown as Response);

const ensureAsyncStore = (name: string): void => {
    createStore(name, {
        data: null,
        loading: false,
        error: null,
        status: "idle",
    });
};

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

describe("stress concurrency and race conditions", () => {
    it("converges after 100 rapid setStore calls in the same microtask tick", async () => {
        createStore("race.microtask", { value: 0 });

        queueMicrotask(() => {
            for (let i = 1; i <= 100; i += 1) {
                setStore("race.microtask", "value", i);
            }
        });

        await flushMicrotasks(5);
        expect(getStore("race.microtask")).toEqual({ value: 100 });
    });

    it("supports simultaneous reads and writes from multiple React components", async () => {
        createStore("race.react", { value: 0 });
        const seenA: number[] = [];
        const seenB: number[] = [];

        const Reader = ({ sink }: { sink: number[] }) => {
            const snapshot = useStore("race.react") as { value: number } | null;
            sink.push(snapshot?.value ?? -1);
            return null;
        };

        const Writer = () => {
            useEffect(() => {
                for (let i = 1; i <= 50; i += 1) {
                    setStore("race.react", "value", i);
                }
            }, []);
            return null;
        };

        render(
            <>
                <Reader sink={seenA} />
                <Reader sink={seenB} />
                <Writer />
            </>
        );

        await waitFor(() => {
            expect((getStore("race.react") as { value: number }).value).toBe(50);
        });
        expect(seenA.at(-1)).toBe(50);
        expect(seenB.at(-1)).toBe(50);
    });

    it("dedupes 3 simultaneous async callers to one network request", async () => {
        ensureAsyncStore("race.dedupe");
        const realFetch = globalThis.fetch;
        const pending = deferred<{ ok: boolean }>();
        let calls = 0;

        globalThis.fetch = vi.fn(async () => {
            calls += 1;
            const payload = await pending.promise;
            return makeJsonResponse(payload);
        }) as typeof fetch;

        const Fetcher = () => {
            useEffect(() => {
                void fetchStore("race.dedupe", "https://example.test/dedupe");
            }, []);
            useAsyncStore("race.dedupe");
            return null;
        };

        try {
            render(
                <>
                    <Fetcher />
                    <Fetcher />
                    <Fetcher />
                </>
            );

            await flushMicrotasks();
            expect(calls).toBe(1);

            pending.resolve({ ok: true });
            await waitFor(() => {
                const state = getStore("race.dedupe") as { status: string; data: unknown };
                expect(state.status).toBe("success");
                expect(state.data).toEqual({ ok: true });
            });
        } finally {
            globalThis.fetch = realFetch;
        }
    });

    it("ignores aborted in-flight result and accepts fresh retriggered data", async () => {
        ensureAsyncStore("race.abort");
        const first = deferred<{ value: string }>();
        const second = deferred<{ value: string }>();
        const controller = new AbortController();

        const firstRequest = fetchStore("race.abort", first.promise, {
            dedupe: false,
            signal: controller.signal,
        });
        controller.abort();
        first.resolve({ value: "stale" });

        const secondRequest = fetchStore("race.abort", second.promise, {
            dedupe: false,
            signal: new AbortController().signal,
        });
        second.resolve({ value: "fresh" });

        await Promise.all([firstRequest, secondRequest]);
        expect(getStore("race.abort")).toMatchObject({
            data: { value: "fresh" },
            status: "success",
        });
    });

    it("prevents stale overwrite in TTL expiry race between overlapping requests", async () => {
        vi.useFakeTimers();
        ensureAsyncStore("race.ttl");

        const first = deferred<{ value: string }>();
        const second = deferred<{ value: string }>();
        const sharedSignal = new AbortController().signal;

        const firstRequest = fetchStore("race.ttl", first.promise, {
            ttl: 99,
            dedupe: false,
            signal: sharedSignal,
        });
        await act(async () => {
            vi.advanceTimersByTime(99);
        });

        const secondRequest = fetchStore("race.ttl", second.promise, {
            ttl: 99,
            dedupe: false,
            signal: sharedSignal,
        });
        second.resolve({ value: "fresh" });
        await secondRequest;

        first.resolve({ value: "stale" });
        await firstRequest;

        expect(getStore("race.ttl")).toMatchObject({
            data: { value: "fresh" },
            status: "success",
        });
    });

    it("does not fan out duplicate fetches on focus revalidate while request is already in-flight", async () => {
        ensureAsyncStore("race.focus");
        const realFetch = globalThis.fetch;
        const pending = deferred<{ value: string }>();
        let calls = 0;

        globalThis.fetch = vi.fn(async () => {
            calls += 1;
            const payload = await pending.promise;
            return makeJsonResponse(payload);
        }) as typeof fetch;

        const cleanup = enableRevalidateOnFocus("race.focus", { debounceMs: 0 });
        try {
            void fetchStore("race.focus", "https://example.test/focus");
            await flushMicrotasks();
            expect(calls).toBe(1);

            window.dispatchEvent(new Event("focus"));
            await flushMicrotasks();
            expect(calls).toBe(1);

            pending.resolve({ value: "ok" });
            await waitFor(() => {
                expect((getStore("race.focus") as { status: string }).status).toBe("success");
            });
        } finally {
            cleanup();
            globalThis.fetch = realFetch;
        }
    });

    it("survives concurrent create/delete churn without resurrecting async stores", async () => {
        const realFetch = globalThis.fetch;
        let abortCount = 0;

        globalThis.fetch = vi.fn((_url: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
            const activeSignal = init?.signal;
            if (!activeSignal) return;
            const onAbort = () => {
                abortCount += 1;
                const abortErr = new Error("aborted");
                (abortErr as Error & { name: string }).name = "AbortError";
                reject(abortErr);
            };
            if (activeSignal.aborted) {
                onAbort();
                return;
            }
            activeSignal.addEventListener("abort", onAbort, { once: true });
        })) as unknown as typeof fetch;

        const timeoutToken = Symbol("timeout");
        const churnSize = 40;

        try {
            await Promise.all(Array.from({ length: churnSize }, async (_value, index) => {
                const name = `race.churn.${index}`;
                ensureAsyncStore(name);
                const controller = new AbortController();

                const request = fetchStore(name, "https://example.test/churn", {
                    dedupe: false,
                    signal: controller.signal,
                });

                await flushMicrotasks(2);
                deleteStore(name);

                const settled = await Promise.race([
                    request,
                    new Promise<typeof timeoutToken>((resolve) => {
                        setTimeout(() => resolve(timeoutToken), 300);
                    }),
                ]);

                expect(settled).toBeNull();
                expect(hasStore(name)).toBe(false);
            }));
        } finally {
            globalThis.fetch = realFetch;
        }

        expect(abortCount).toBeGreaterThanOrEqual(churnSize);
    });
});
