/**
 * Storage pressure and persistence failure-mode stress tests.
 *
 * WHAT: Forces security errors, quota errors, non-string async payloads, and write-order races in persist drivers.
 * WHY: Real browsers can throw or degrade storage unpredictably; persistence must fail closed without taking app state down.
 */
import { describe, expect, it, vi } from "vitest";
import { createStore, getStore, setStore } from "stroid";
import { flushMicrotasks } from "../shared/mocks";

const flushPersist = async (): Promise<void> => {
    await flushMicrotasks(5);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushMicrotasks(5);
};

describe("stress persistence storage pressure", () => {
    it("falls back to initial state when persist getItem throws SecurityError", () => {
        const errors: string[] = [];
        const driver = {
            getItem: () => {
                const err = new Error("blocked") as Error & { name: string };
                err.name = "SecurityError";
                throw err;
            },
            setItem: () => {},
            removeItem: () => {},
        };

        expect(() => {
            createStore("persist.security-error", { value: "initial" }, {
                persist: {
                    driver,
                    key: "persist.security-error",
                    allowPlaintext: true,
                    checksum: "none",
                },
                onError: (message) => errors.push(message),
            });
        }).not.toThrow();

        expect(getStore("persist.security-error")).toEqual({ value: "initial" });
        expect(errors.some((message) => message.includes("Could not load store"))).toBe(true);
    });

    it("keeps in-memory writes alive when persist setItem repeatedly throws QuotaExceededError", async () => {
        const errors: string[] = [];
        const driver = {
            getItem: () => null,
            setItem: () => {
                const err = new Error("storage full") as Error & { name: string };
                err.name = "QuotaExceededError";
                throw err;
            },
            removeItem: () => {},
        };

        createStore("persist.quota-storm", { value: 0 }, {
            persist: {
                driver,
                key: "persist.quota-storm",
                allowPlaintext: true,
                checksum: "none",
            },
            onError: (message) => errors.push(message),
        });

        for (let i = 1; i <= 400; i += 1) {
            setStore("persist.quota-storm", { value: i });
        }
        await flushPersist();

        expect((getStore("persist.quota-storm") as { value: number }).value).toBe(400);
        expect(errors.some((message) => message.includes("Could not persist store") && message.includes("storage full"))).toBe(true);
    });

    it("reports async non-string persist payloads and keeps initial state", async () => {
        const errors: string[] = [];
        const driver = {
            getItem: async () => ({ not: "a-string" }) as unknown as string,
            setItem: async () => {},
            removeItem: async () => {},
        };

        createStore("persist.async-non-string", { value: "initial" }, {
            persist: {
                driver,
                key: "persist.async-non-string",
                allowPlaintext: true,
                checksum: "none",
                encryptAsync: async (value) => value,
                decryptAsync: async (value) => value,
            },
            onError: (message) => errors.push(message),
        });
        await flushPersist();

        expect(getStore("persist.async-non-string")).toEqual({ value: "initial" });
        expect(errors.some((message) => message.includes("non-string"))).toBe(true);
    });

    it("persists the newest value when earlier async write is stalled", async () => {
        vi.useFakeTimers();
        const errors: string[] = [];
        const writes: string[] = [];
        let releaseFirstWrite: (() => void) | null = null;
        let firstWrite = true;

        const driver = {
            getItem: () => null,
            setItem: async (_key: string, value: string) => {
                if (firstWrite) {
                    firstWrite = false;
                    await new Promise<void>((resolve) => {
                        releaseFirstWrite = resolve;
                    });
                }
                writes.push(value);
            },
            removeItem: () => {},
        };

        createStore("persist.write-order", { value: 0 }, {
            persist: {
                driver,
                key: "persist.write-order",
                allowPlaintext: true,
                checksum: "none",
            },
            onError: (message) => errors.push(message),
        });

        setStore("persist.write-order", { value: 1 });
        await vi.runOnlyPendingTimersAsync();
        await flushMicrotasks(5);
        expect(releaseFirstWrite).not.toBeNull();

        setStore("persist.write-order", { value: 2 });
        await vi.runOnlyPendingTimersAsync();
        await flushMicrotasks(5);

        releaseFirstWrite?.();
        await flushMicrotasks(10);
        await vi.runAllTimersAsync();
        await flushMicrotasks(10);

        expect(errors).toEqual([]);
        expect(writes.length).toBeGreaterThan(0);

        const latestEnvelope = JSON.parse(writes[writes.length - 1]) as { data: string };
        expect(JSON.parse(latestEnvelope.data)).toEqual({ value: 2 });
        expect(getStore("persist.write-order")).toEqual({ value: 2 });
    });
});
