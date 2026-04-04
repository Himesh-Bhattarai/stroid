/**
 * Event-loop batch consistency stress tests.
 *
 * WHAT: Mixes microtasks, promise callbacks, and timer callbacks while issuing batched multi-store writes.
 * WHY: Real production apps interleave writes across event-loop phases; if batching is fragile, invariants tear.
 */
import { useEffect } from "react";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createStore, getStore, setStore, setStoreBatch } from "stroid";
import { useStore } from "stroid/react";
import { flushMicrotasks } from "../shared/mocks";

describe("stress event-loop batch consistency", () => {
    it("preserves cross-store invariants under mixed-phase batched writes", async () => {
        vi.useFakeTimers();
        createStore("loop.batch.a", { value: 0 });
        createStore("loop.batch.b", { value: 0 });

        const observedValues: number[] = [];
        const invariantViolations: Array<{ a: number; b: number }> = [];

        const Probe = () => {
            const a = useStore("loop.batch.a", "value") as number | null;
            const b = useStore("loop.batch.b", "value") as number | null;

            useEffect(() => {
                if (a == null || b == null) return;
                observedValues.push(a);
                if (b !== a * 2) {
                    invariantViolations.push({ a, b });
                }
            }, [a, b]);

            return null;
        };

        render(<Probe />);
        const totalWrites = 90;

        for (let i = 1; i <= totalWrites; i += 1) {
            const commit = () => {
                setStoreBatch(() => {
                    setStore("loop.batch.a", "value", i);
                    setStore("loop.batch.b", "value", i * 2);
                });
            };

            if (i % 3 === 0) {
                queueMicrotask(commit);
            } else if (i % 3 === 1) {
                Promise.resolve().then(commit);
            } else {
                setTimeout(commit, 0);
            }
        }

        await act(async () => {
            await vi.runAllTimersAsync();
        });
        await flushMicrotasks(20);

        const finalA = (getStore("loop.batch.a") as { value: number }).value;
        const finalB = (getStore("loop.batch.b") as { value: number }).value;
        expect(finalA).toBeGreaterThan(0);
        expect(finalB).toBe(finalA * 2);
        expect(observedValues).toContain(finalA);
        expect(invariantViolations).toEqual([]);
    });
});
