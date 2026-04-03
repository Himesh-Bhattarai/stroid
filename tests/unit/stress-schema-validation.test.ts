/**
 * Schema validation stress tests.
 *
 * WHAT: Exercises strict schema guards on create and set operations, including partial merge updates.
 * WHY: Validation bugs silently corrupt persisted/synced state and are expensive to roll back in production.
 */
import { describe, expect, it, vi } from "vitest";
import { createStore, getStore, hasStore, setStore } from "stroid";

type StrictState = {
    required: string;
    count: number;
    optional?: string;
};

const strictSchema = {
    safeParse: (value: unknown): { success: true; data: StrictState } | { success: false; error: string } => {
        const state = value as Partial<StrictState>;
        const valid =
            typeof state?.required === "string"
            && state.required.length > 0
            && typeof state.count === "number"
            && Number.isFinite(state.count)
            && state.count >= 0
            && (state.optional === undefined || typeof state.optional === "string");
        return valid
            ? { success: true, data: state as StrictState }
            : { success: false, error: "strict schema failed" };
    },
};

describe("stress schema validation", () => {
    it("accepts valid data and rejects invalid initial state", () => {
        const onError = vi.fn();
        const ok = createStore("schema.ok", { required: "yes", count: 1 }, { validate: strictSchema, onError });
        const bad = createStore("schema.bad", { required: "", count: -1 }, { validate: strictSchema, onError });

        expect(ok).toEqual({ name: "schema.ok" });
        expect(bad).toBeUndefined();
        expect(hasStore("schema.bad")).toBe(false);
        expect(onError).toHaveBeenCalled();
    });

    it("fails invalid updates without silently accepting them", () => {
        createStore("schema.update", { required: "ok", count: 0 }, { validate: strictSchema });
        const result = setStore("schema.update", { count: -100 });

        expect(result).toEqual({ ok: false, reason: "validate" });
        expect(getStore("schema.update")).toEqual({ required: "ok", count: 0 });
    });

    it("validates merged result for partial object updates", () => {
        createStore("schema.partial", { required: "present", count: 3 }, { validate: strictSchema });

        // This partial merge becomes invalid after merge because count is negative.
        expect(setStore("schema.partial", { count: -1 })).toEqual({ ok: false, reason: "validate" });
        expect(getStore("schema.partial")).toEqual({ required: "present", count: 3 });

        // Optional field can be omitted and later added.
        expect(setStore("schema.partial", { optional: "added" })).toEqual({ ok: true });
        expect(getStore("schema.partial")).toEqual({ required: "present", count: 3, optional: "added" });
    });

    it("supports function validators that transform accepted values", () => {
        createStore(
            "schema.transform",
            { required: "x", count: 1 },
            {
                validate: (state: StrictState) => ({
                    ...state,
                    required: state.required.trim(),
                }),
            }
        );

        expect(setStore("schema.transform", { required: "   padded   " })).toEqual({ ok: true });
        expect(getStore("schema.transform")).toEqual({ required: "padded", count: 1 });
    });
});

