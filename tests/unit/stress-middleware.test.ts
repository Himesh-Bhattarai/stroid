/**
 * Middleware stress tests.
 *
 * WHAT: Validates blocking, transformation, failure, and long-chain execution semantics for middleware.
 * WHY: Middleware is a high-risk extension point; ordering or error-handling bugs can corrupt state globally.
 */
import { describe, expect, it } from "vitest";
import { createStore, getStore, setStore } from "stroid";

describe("stress middleware", () => {
    it("can block updates and keep store unchanged", () => {
        createStore("mw.block", { value: 1 }, {
            middleware: [
                ({ prev }) => prev,
            ],
        });

        expect(setStore("mw.block", { value: 99 })).toEqual({ ok: true });
        expect(getStore("mw.block")).toEqual({ value: 1 });
    });

    it("can transform updates before commit", () => {
        createStore("mw.transform", { value: 1 }, {
            middleware: [
                ({ next }) => ({ ...(next as { value: number }), value: 1234 }),
            ],
        });

        expect(setStore("mw.transform", { value: 2 })).toEqual({ ok: true });
        expect(getStore("mw.transform")).toEqual({ value: 1234 });
    });

    it("aborts write when middleware throws and preserves previous state", () => {
        createStore("mw.throw", { value: 1 }, {
            middleware: [
                () => {
                    throw new Error("middleware boom");
                },
            ],
        });

        expect(setStore("mw.throw", { value: 2 })).toEqual({ ok: false, reason: "middleware" });
        expect(getStore("mw.throw")).toEqual({ value: 1 });
    });

    it("runs chained middleware in registration order", () => {
        const order: number[] = [];
        const chain = Array.from({ length: 10 }, (_, i) =>
            ({ next }: { next: { value: number } }) => {
                order.push(i);
                return { value: next.value + 1 };
            }
        );

        createStore("mw.chain", { value: 0 }, { middleware: chain });
        expect(setStore("mw.chain", { value: 1 })).toEqual({ ok: true });

        expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(getStore("mw.chain")).toEqual({ value: 11 });
    });
});

