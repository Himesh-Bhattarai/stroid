/**
 * @fileoverview src\async\errors.ts
 */
import { critical, error, isDev, warn } from "../utils.js";
import { getConfig } from "../internals/config.js";

export const runAsyncHook = (
    name: string,
    label: "onSuccess" | "onError",
    fn: ((value: any) => void) | undefined,
    value: unknown
): void => {
    if (typeof fn !== "function") return;
    try {
        fn(value);
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

