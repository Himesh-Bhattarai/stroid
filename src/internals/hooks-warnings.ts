import { registerTestResetHook } from "./test-reset.js";

const _broadUseStoreWarnings = new Set<string>();
const _missingUseStoreWarnings = new Set<string>();

export const hasBroadUseStoreWarning = (name: string): boolean =>
    _broadUseStoreWarnings.has(name);

export const markBroadUseStoreWarning = (name: string): void => {
    if (name) _broadUseStoreWarnings.add(name);
};

export const hasMissingUseStoreWarning = (name: string): boolean =>
    _missingUseStoreWarnings.has(name);

export const markMissingUseStoreWarning = (name: string): void => {
    if (name) _missingUseStoreWarnings.add(name);
};

export const resetBroadUseStoreWarnings = (): void => {
    _broadUseStoreWarnings.clear();
};

export const resetMissingUseStoreWarnings = (): void => {
    _missingUseStoreWarnings.clear();
};

registerTestResetHook("hooks.broad-warning", resetBroadUseStoreWarnings, 70);
registerTestResetHook("hooks.missing-warning", resetMissingUseStoreWarnings, 80);
