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
import { getAsyncUsageErrorEmissions } from "./cache.js";

const MAX_ASYNC_USAGE_ERROR_EMISSIONS = 50;
const MAX_TRACKED_ASYNC_USAGE_ERROR_MESSAGES = 512;

const shouldEmitAsyncUsageError = (message: string): boolean => {
    const emissions = getAsyncUsageErrorEmissions();
    const seen = emissions.get(message) ?? 0;
    if (seen >= MAX_ASYNC_USAGE_ERROR_EMISSIONS) return false;

    if (seen === 0 && emissions.size >= MAX_TRACKED_ASYNC_USAGE_ERROR_MESSAGES) {
        const oldest = emissions.keys().next().value as string | undefined;
        if (oldest !== undefined) emissions.delete(oldest);
    }

    emissions.set(message, seen + 1);
    return true;
};

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
    if (!shouldEmitAsyncUsageError(message)) return null;
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
    if (shouldEmitAsyncUsageError(message)) {
        if (isDev()) {
            error(message);
        } else {
            critical(message);
        }
    }
    throw new Error(message);
};
