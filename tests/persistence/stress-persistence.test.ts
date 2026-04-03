/**
 * Persistence stress tests.
 *
 * WHAT: Verifies restore behavior across reloads, corrupted payload handling, migrations, falsy values, and large payloads.
 * WHY: Storage corruption and version drift are frequent production failure modes in long-lived frontends.
 */
import { performance } from "node:perf_hooks";
import { describe, expect, it, vi } from "vitest";
import { createStore, getStore, setStore } from "stroid";
import { resetAllStoresForTest } from "stroid/testing";
import { createMemoryStorageDriver, flushMicrotasks } from "../shared/mocks";

type PersistedState = {
    value?: string;
    count?: number;
    nullable?: null | string;
    zero?: number;
    flag?: boolean;
};

const makePersistConfig = (driver: ReturnType<typeof createMemoryStorageDriver>, key: string) => ({
    driver,
    key,
    allowPlaintext: true,
    checksum: "hash" as const,
    serialize: JSON.stringify,
    deserialize: JSON.parse,
    encrypt: (v: string) => v,
    decrypt: (v: string) => v,
});

const flushPersist = async (): Promise<void> => {
    await flushMicrotasks(3);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushMicrotasks(3);
};

describe("stress persistence", () => {
    it("restores persisted state after simulated reload", async () => {
        const driver = createMemoryStorageDriver();
        const config = makePersistConfig(driver, "persist.reload.key");

        createStore("persist.reload", { count: 1 }, { persist: config });
        setStore("persist.reload", { count: 42 });
        await flushPersist();

        expect(driver.getItem("persist.reload.key")).not.toBeNull();

        resetAllStoresForTest();
        createStore("persist.reload", { count: 0 }, { persist: config });

        expect(getStore("persist.reload")).toEqual({ count: 42 });
    });

    it("falls back to initial state for invalid JSON/truncated payload/checksum mismatch", () => {
        const badJson = createMemoryStorageDriver({
            "persist.bad.json": "{ this is not json",
        });
        const onErrorBadJson = vi.fn();
        createStore("persist.bad.json", { value: "initial" }, {
            persist: makePersistConfig(badJson, "persist.bad.json"),
            onError: onErrorBadJson,
        });
        expect(getStore("persist.bad.json")).toEqual({ value: "initial" });
        expect(onErrorBadJson).toHaveBeenCalled();

        const truncated = createMemoryStorageDriver({
            "persist.bad.truncated": "{\"v\":1,\"data\":\"{\\\"value\\\":\\\"x\\\"}\"",
        });
        const onErrorTruncated = vi.fn();
        createStore("persist.bad.truncated", { value: "initial" }, {
            persist: makePersistConfig(truncated, "persist.bad.truncated"),
            onError: onErrorTruncated,
        });
        expect(getStore("persist.bad.truncated")).toEqual({ value: "initial" });
        expect(onErrorTruncated).toHaveBeenCalled();

        const wrongChecksum = createMemoryStorageDriver({
            "persist.bad.checksum": JSON.stringify({
                v: 1,
                checksum: 12345,
                data: JSON.stringify({ value: "corrupt" }),
            }),
        });
        createStore("persist.bad.checksum", { value: "initial" }, {
            persist: makePersistConfig(wrongChecksum, "persist.bad.checksum"),
        });
        expect(getStore("persist.bad.checksum")).toEqual({ value: "initial" });
    });

    it("migrates persisted v1 payload to v2 schema", () => {
        const driver = createMemoryStorageDriver({
            "persist.migrate": JSON.stringify({
                v: 1,
                checksum: 0,
                data: JSON.stringify({ name: "Ada" }),
            }),
        });

        createStore("persist.migrate", { name: "", active: false }, {
            version: 2,
            migrations: {
                2: (state: { name: string }) => ({ ...state, active: true }),
            },
            persist: {
                ...makePersistConfig(driver, "persist.migrate"),
                checksum: "none",
            },
        });

        expect(getStore("persist.migrate")).toEqual({ name: "Ada", active: true });
    });

    it("persists null/0/false/undefined values without treating falsy as missing", async () => {
        const driver = createMemoryStorageDriver();
        const key = "persist.falsy";
        const config = makePersistConfig(driver, key);

        createStore("persist.falsy", {
            value: undefined,
            nullable: null,
            zero: 0,
            flag: false,
        } as PersistedState, {
            persist: config,
        });

        setStore("persist.falsy", {
            value: undefined,
            nullable: null,
            zero: 0,
            flag: false,
        });
        await flushPersist();

        resetAllStoresForTest();
        createStore("persist.falsy", {
            value: "fallback",
            nullable: "fallback",
            zero: 1,
            flag: true,
        } as PersistedState, {
            persist: config,
        });

        const restored = getStore("persist.falsy") as PersistedState;
        expect(restored.nullable).toBeNull();
        expect(restored.zero).toBe(0);
        expect(restored.flag).toBe(false);
        // JSON.stringify drops undefined properties during persistence.
        expect(Object.hasOwn(restored, "value")).toBe(false);
    });

    it("persists and restores a ~1MB payload within acceptable timing", async () => {
        const driver = createMemoryStorageDriver();
        const key = "persist.large";
        const config = makePersistConfig(driver, key);
        const oneMbPayload = "x".repeat(1024 * 1024);

        const writeStart = performance.now();
        createStore("persist.large", { payload: oneMbPayload }, { persist: config });
        setStore("persist.large", { payload: oneMbPayload });
        await flushPersist();
        const writeMs = performance.now() - writeStart;

        const reloadStart = performance.now();
        resetAllStoresForTest();
        createStore("persist.large", { payload: "" }, { persist: config });
        const restored = getStore("persist.large") as { payload: string };
        const reloadMs = performance.now() - reloadStart;

        expect(restored.payload.length).toBe(oneMbPayload.length);
        expect(writeMs).toBeLessThan(3000);
        expect(reloadMs).toBeLessThan(3000);
    });
});
