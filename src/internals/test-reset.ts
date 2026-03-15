/**
 * @module internals/test-reset
 *
 * LAYER: Internal subsystem
 * OWNS:  Module-level behavior and exports for internals/test-reset.
 *
 * Consumers: Internal imports and public API.
 */
type TestResetHook = {
    name: string;
    order: number;
    fn: () => void;
};

const _resetHooks = new Map<string, TestResetHook>();

export const registerTestResetHook = (name: string, fn: () => void, order = 0): void => {
    if (!name || typeof fn !== "function") return;
    _resetHooks.set(name, { name, order, fn });
};

export const runTestResets = (): void => {
    const ordered = Array.from(_resetHooks.values()).sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.name.localeCompare(b.name, "en");
    });
    ordered.forEach((hook) => hook.fn());
};


