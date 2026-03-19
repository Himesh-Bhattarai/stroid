/**
 * @module core/lifecycle-hooks
 *
 * LAYER: Core utilities
 * OWNS:  Cross-cutting lifecycle hooks without dependencies on other modules.
 *
 * Consumers: notification/*, async-cache.ts, internals/store-admin.ts
 */

export type LifecycleHookEvent = {
    type: string;
    [key: string]: unknown;
};

export type LifecycleHook = (storeId: string, event: LifecycleHookEvent) => void;

const hooks = new Map<string, Set<LifecycleHook>>();

export const registerHook = (name: string, fn: LifecycleHook): (() => void) => {
    let set = hooks.get(name);
    if (!set) {
        set = new Set();
        hooks.set(name, set);
    }
    set.add(fn);
    return () => {
        const current = hooks.get(name);
        if (!current) return;
        current.delete(fn);
        if (current.size === 0) hooks.delete(name);
    };
};

export const hasHook = (name: string): boolean => {
    const set = hooks.get(name);
    return !!set && set.size > 0;
};

export const fireHook = (name: string, storeId: string, event: LifecycleHookEvent): void => {
    const set = hooks.get(name);
    if (!set || set.size === 0) return;
    set.forEach((fn) => {
        try {
            fn(storeId, event);
        } catch (err) {
            if (typeof console !== "undefined" && console.warn) {
                console.warn(`[stroid] lifecycle hook "${name}" failed:`, err);
            }
        }
    });
};
