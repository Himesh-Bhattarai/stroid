/**
 * @module adapters/options/legacy
 *
 * LAYER: Module
 * OWNS:  Legacy option warning tracking and deprecation messaging.
 */
import { registerTestResetHook } from "../../internals/test-reset.js";
import { hasOwn, isObject } from "./helpers.js";
import type { StoreOptions } from "./types.js";

const warnedLegacyOptions = new Set<string>();

/**
 * Resets the internal set of legacy options that have been warned
 * about. Used for testing purposes to prevent warnings from leaking
 * between tests.
 */
export const resetLegacyOptionDeprecationWarningsForTests = (): void => {
    warnedLegacyOptions.clear();
};

registerTestResetHook("options.legacy-warnings", resetLegacyOptionDeprecationWarningsForTests, 30);

const legacyOptionReplacementMap: Record<string, string> = {
    allowSSRGlobalStore: `scope: "global"`,
    schema: "validate",
    validator: "validate",
    version: "persist.version",
    migrations: "persist.migrations",
    historyLimit: "devtools.historyLimit",
    redactor: "devtools.redactor",
    middleware: "lifecycle.middleware",
    onCreate: "lifecycle.onCreate",
    onSet: "lifecycle.onSet",
    onReset: "lifecycle.onReset",
    onDelete: "lifecycle.onDelete",
};

/**
 * Collect deprecation warnings for a store options object.
 *
 * This function walks through the store options object and checks whether
 * deprecated options are present. If a deprecated option is found, a
 * warning message is added to the warnings array.
 *
 * The function returns an array of warning messages. If no deprecated
 * options are found, an empty array is returned.
 *
 * @template State The type of the state stored in the store.
 * @param option The store options object to check for deprecated options.
 * @returns An array of warning messages for deprecated options. If no deprecated
 *          options are found, an empty array is returned.
 */
export const collectLegacyOptionDeprecationWarnings = <State>(option: StoreOptions<State>): string[] => {
    if (!isObject(option)) return [];

    const warnings: string[] = [];
    Object.entries(legacyOptionReplacementMap).forEach(([legacyKey, replacement]) => {
        if (!hasOwn(option, legacyKey)) return;
        if (warnedLegacyOptions.has(legacyKey)) return;
        warnedLegacyOptions.add(legacyKey);
        warnings.push(`createStore option "${legacyKey}" is deprecated. Use "${replacement}" instead.`);
    });
    return warnings;
};
