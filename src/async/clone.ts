/**
 * @fileoverview src\async\clone.ts
 */
import type { FetchOptions } from "../async-cache.js";
import { deepClone, shallowClone } from "../utils.js";

export const cloneAsyncResult = (value: unknown, mode: FetchOptions["cloneResult"]): unknown => {
    if (!mode || mode === "none") return value;
    if (value === null || typeof value !== "object") return value;
    if (mode === "shallow") return shallowClone(value);
    return deepClone(value);
};

