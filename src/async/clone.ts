/**
 * @module async/clone
 *
 * LAYER: Async subsystem
 * OWNS:  Module-level behavior and exports for async/clone.
 *
 * Consumers: Internal imports and public API.
 */
import type { FetchOptions } from "./cache.js";
import { deepClone, shallowClone } from "../utils.js";

export const cloneAsyncResult = (value: unknown, mode: FetchOptions["cloneResult"]): unknown => {
    if (!mode || mode === "none") return value;
    if (value === null || typeof value !== "object") return value;
    if (mode === "shallow") return shallowClone(value);
    return deepClone(value);
};


