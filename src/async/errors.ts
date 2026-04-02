/**
 * @module async/errors
 *
 * LAYER: Async subsystem
 * OWNS:  Module-level behavior and exports for async/errors.
 *
 * Consumers: Internal imports and public API.
 */
import { critical, error, isDev, warn } from "../utils.js";
import { getConfig } from "../internals/config.js";

export function runAsyncHook(
    name: string,
    label: "onSuccess",
    fn: ((value: unknown) => void) | undefined,
    value: unknown
): void;
export function runAsyncHook(
    name: string,
    label: "onError",
    fn: ((message: string) => void) | undefined,
    value: string
): void;
export function runAsyncHook(
    name: string,
    label: "onSuccess" | "onError",
    fn: ((value: unknown) => void) | ((message: string) => void) | undefined,
    value: unknown
): void {
    if (typeof fn !== "function") return;
    try {
        (fn as (value: unknown) => void)(value);
    } catch (err) {
        warn(`fetchStore("${name}") ${label} callback failed: ${(err as { message?: string })?.message ?? err}`);
    }
};

export const reportAsyncUsageError = (
    name: string,
    message: string,
    onError?: (message: string) => void
): null => {
    if (getConfig().strictAsyncUsageErrors) {
        return throwAsyncUsageError(name, message, onError);
    }
    runAsyncHook(name, "onError", onError, message);
    if (isDev()) {
        error(message);
        return null;
    }
    critical(message);
    return null;
};

export const throwAsyncUsageError = (
    name: string,
    message: string,
    onError?: (message: string) => void
): never => {
    runAsyncHook(name, "onError", onError, message);
    if (isDev()) {
        error(message);
    } else {
        critical(message);
    }
    throw new Error(message);
};
