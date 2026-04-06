/**
 * Stress regressions for notification reentrancy safety.
 *
 * WHAT: Exercises pathological subscriber feedback loops and bounded cyclic fanout.
 * WHY: Inline flush loops can starve the event loop if reentrant writes never settle.
 */
import { describe, expect, it } from "vitest";
import {
    clearAllStores,
    createStore,
    deleteStore,
    getStore,
    setStore,
    subscribeStore,
} from "../../src/store.js";
import { getRegistry } from "../../src/core/store-lifecycle/registry.js";
import { flushPendingNotificationsInline, waitForNotificationIdle } from "../../src/notification/index.js";

describe("stress notification reentrancy safety", () => {
    it("hard-stops unbounded inline reentrancy and recovers on the next store lifecycle", async () => {
        clearAllStores();
        createStore("stress.notify.loop", { value: 0 });

        let callbackCount = 0;
        const unsubscribe = subscribeStore("stress.notify.loop", (snapshot) => {
            if (!snapshot) return;
            callbackCount += 1;
            setStore("stress.notify.loop", "value", callbackCount + 1);
        });

        setStore("stress.notify.loop", "value", 1);

        const registry = getRegistry();
        expect(() => flushPendingNotificationsInline(registry)).toThrow(/safety pass limit/i);
        expect(callbackCount).toBeGreaterThan(1_000);

        unsubscribe();
        deleteStore("stress.notify.loop");
        expect(registry.notify.pendingNotifications.size).toBe(0);
        expect(registry.notify.pendingBuffer.length).toBe(0);
        expect(registry.notify.orderedNames.length).toBe(0);

        createStore("stress.notify.recover", { value: 0 });
        setStore("stress.notify.recover", "value", 7);
        await waitForNotificationIdle(getRegistry());

        expect(getStore("stress.notify.recover")).toEqual({ value: 7 });
        expect(registry.notify.isFlushing).toBe(false);
        expect(registry.notify.notifyScheduled).toBe(false);
        expect(registry.notify.pendingNotifications.size).toBe(0);
    }, 20000);

    it("settles bounded cyclic fanout under heavy reentrant churn without queue residue", async () => {
        clearAllStores();
        createStore("stress.notify.cycle.a", { value: 0 });
        createStore("stress.notify.cycle.b", { value: 0 });
        createStore("stress.notify.cycle.c", { value: 0 });

        const maxCascadeWrites = 3_000;
        let cascadeWrites = 0;
        const nextWrite = (): number => {
            cascadeWrites += 1;
            return cascadeWrites;
        };

        const offA = subscribeStore("stress.notify.cycle.a", (snapshot) => {
            if (!snapshot || cascadeWrites >= maxCascadeWrites) return;
            setStore("stress.notify.cycle.b", "value", nextWrite());
        });
        const offB = subscribeStore("stress.notify.cycle.b", (snapshot) => {
            if (!snapshot || cascadeWrites >= maxCascadeWrites) return;
            setStore("stress.notify.cycle.c", "value", nextWrite());
        });
        const offC = subscribeStore("stress.notify.cycle.c", (snapshot) => {
            if (!snapshot || cascadeWrites >= maxCascadeWrites) return;
            setStore("stress.notify.cycle.a", "value", nextWrite());
        });

        setStore("stress.notify.cycle.a", "value", 1);
        await waitForNotificationIdle(getRegistry());

        offA();
        offB();
        offC();

        const a = getStore("stress.notify.cycle.a") as { value: number } | null;
        const b = getStore("stress.notify.cycle.b") as { value: number } | null;
        const c = getStore("stress.notify.cycle.c") as { value: number } | null;
        const maxObserved = Math.max(a?.value ?? 0, b?.value ?? 0, c?.value ?? 0);

        expect(cascadeWrites).toBe(maxCascadeWrites);
        expect(maxObserved).toBe(maxCascadeWrites);

        const registry = getRegistry();
        expect(registry.notify.pendingNotifications.size).toBe(0);
        expect(registry.notify.pendingBuffer.length).toBe(0);
        expect(registry.notify.orderedNames.length).toBe(0);
        expect(registry.notify.isFlushing).toBe(false);
        expect(registry.notify.notifyScheduled).toBe(false);
    }, 20000);
});
