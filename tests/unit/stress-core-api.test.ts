/**
 * Core API stress tests.
 *
 * WHAT: Tries malformed arguments, pathological payloads, and mutation attempts against create/set/get APIs.
 * WHY: Production outages in state libraries commonly come from invalid inputs, huge payloads, and hidden mutability.
 */
import { describe, expect, it } from "vitest";
import { createSelector } from "stroid/selectors";
import { createStore, getStore, hasStore, setStore, store } from "stroid";
import { createMockStore } from "stroid/testing";
import { createDeepObject, createFlatObject } from "../shared/mocks";

describe("stress core api", () => {
    it("supports normal create + path updates + mutator updates", () => {
        createStore("unit.normal", { count: 0, nested: { value: 1 } });

        expect(setStore("unit.normal", "count", 2)).toEqual({ ok: true });
        expect(setStore("unit.normal", (draft: { count: number; nested: { value: number } }) => {
            draft.nested.value = 99;
        })).toEqual({ ok: true });

        expect(getStore("unit.normal")).toEqual({ count: 2, nested: { value: 99 } });
    });

    it("rejects invalid createStore keys and invalid initial payload types", () => {
        expect(createStore("", { value: 1 })).toBeUndefined();
        expect(createStore("__proto__", { value: 1 })).toBeUndefined();
        expect(createStore("constructor", { value: 1 })).toBeUndefined();
        expect(createStore("prototype", { value: 1 })).toBeUndefined();
        expect(createStore("unit.fn", (() => ({ value: 1 })) as unknown as { value: number })).toBeUndefined();
        expect(hasStore("unit.fn")).toBe(false);
    });

    it("survives malformed setStore calls and reports deterministic failure reasons", () => {
        expect(setStore("unit.missing", { value: 1 })).toEqual({ ok: false, reason: "not-found" });

        createStore("unit.badset", { value: 1 });
        expect(setStore("unit.badset", Number.NaN as unknown as { value: number }).ok).toBe(false);
        expect(setStore("unit.badset", ["value", "path", "too", "deep", "for", "default", "shape"], 1).ok).toBe(false);
        expect(setStore("unit.badset", Symbol("key") as unknown as Record<string, unknown>).ok).toBe(false);
        expect(setStore("unit.badset", { value: Number.POSITIVE_INFINITY })).toEqual({ ok: false, reason: "validate" });
    });

    it("rejects circular objects and non-finite values without crashing", () => {
        const circular: Record<string, unknown> = { value: 1 };
        circular.self = circular;
        expect(createStore("unit.circular", circular)).toBeUndefined();
        expect(hasStore("unit.circular")).toBe(false);

        createStore("unit.finite", { value: 1 });
        expect(setStore("unit.finite", { value: Number.NaN })).toEqual({ ok: false, reason: "validate" });
        expect(setStore("unit.finite", { value: Number.NEGATIVE_INFINITY })).toEqual({ ok: false, reason: "validate" });
    });

    it("sanitizes polluted and symbol-bearing objects before storing", () => {
        const symbolKey = Symbol("secret");
        const polluted = JSON.parse("{\"ok\":1,\"__proto__\":{\"polluted\":true}}") as Record<string, unknown>;
        polluted[symbolKey] = "hidden";
        (polluted as unknown as { constructor: unknown }).constructor = { x: 1 };
        (polluted as unknown as { prototype: unknown }).prototype = { y: 1 };

        createStore("unit.sanitize", { ok: 0 });
        expect(setStore("unit.sanitize", polluted)).toEqual({ ok: true });

        const snapshot = getStore("unit.sanitize") as Record<string, unknown>;
        expect(snapshot.ok).toBe(1);
        expect("polluted" in ({} as Record<string, unknown>)).toBe(false);
        expect(Object.getOwnPropertySymbols(snapshot)).toEqual([]);
        expect(Object.hasOwn(snapshot, "constructor")).toBe(false);
        expect(Object.hasOwn(snapshot, "prototype")).toBe(false);
    });

    it("handles boundary values: empty object, deeply nested shape, and 10k-key flat object", () => {
        createStore("unit.empty", {});
        expect(getStore("unit.empty")).toEqual({});

        const deep = createDeepObject(12);
        createStore("unit.deep", deep);
        expect(setStore("unit.deep", ["level0", "level1", "level2", "value"], 777)).toEqual({ ok: true });
        expect(getStore("unit.deep", ["level0", "level1", "level2", "value"])).toBe(777);

        const big = createFlatObject(10_000);
        createStore("unit.big", big);
        expect(setStore("unit.big", { k9999: 42 })).toEqual({ ok: true });
        expect(getStore("unit.big", "k9999")).toBe(42);
    });

    it("is stable when createStore is called twice with the same key", () => {
        createStore("unit.dup", { value: 1 });
        const second = createStore("unit.dup", { value: 999 });
        expect(second).toEqual({ name: "unit.dup" });
        expect(getStore("unit.dup")).toEqual({ value: 1 });
    });

    it("keeps store data immutable from external snapshot mutation attempts", () => {
        createStore("unit.snapshot", { nested: { value: 1 } });
        const read = getStore("unit.snapshot") as { nested: { value: number } };

        read.nested.value = 77;
        expect(getStore("unit.snapshot")).toEqual({ nested: { value: 1 } });
    });

    it("avoids selector recomputation on unrelated state updates", () => {
        createStore("unit.selector", { a: 1, b: 1, c: 1 });
        let computeCount = 0;
        const selector = createSelector<{ a: number; b: number; c: number }, number>("unit.selector", (state) => {
            computeCount += 1;
            return state.a * 2;
        });

        expect(selector()).toBe(2);
        expect(computeCount).toBe(1);

        expect(setStore("unit.selector", "b", 999)).toEqual({ ok: true });
        expect(selector()).toBe(2);
        expect(computeCount).toBe(1);

        expect(setStore("unit.selector", "a", 3)).toEqual({ ok: true });
        expect(selector()).toBe(6);
        expect(computeCount).toBe(2);
    });

    it("works with createMockStore helper for ergonomic test isolation", () => {
        const mock = createMockStore("unit.mock", { value: 0 });
        const handle = mock.use();
        mock.set({ value: 5 });
        expect(getStore(handle)).toEqual({ value: 5 });
        mock.reset();
        expect(getStore(handle)).toEqual({ value: 0 });
    });

    it("accepts store handles from store() in addition to raw string keys", () => {
        const handle = store<"unit.handle", { value: number }>("unit.handle");
        createStore(handle.name, { value: 1 });
        expect(setStore(handle, "value", 9)).toEqual({ ok: true });
        expect(getStore(handle)).toEqual({ value: 9 });
    });
});
