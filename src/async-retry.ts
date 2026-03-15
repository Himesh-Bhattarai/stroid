/**
 * @module async-retry
 *
 * LAYER: Module
 * OWNS:  Module-level behavior and exports for async-retry.
 *
 * Consumers: Internal imports and public API.
 */
import { warn } from "./utils.js";

export const MAX_RETRY_ATTEMPTS = 10;
export const MIN_RETRY_DELAY_MS = 10;
export const MAX_RETRY_DELAY_MS = 30_000;
export const MAX_RETRY_BACKOFF = 8;

export const delay = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve) => {
    if (signal?.aborted) {
        resolve();
        return;
    }

    const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
    }, ms);

    const onAbort = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve();
    };

    signal?.addEventListener("abort", onAbort, { once: true });
});

const normalizeRetryNumber = (name: string, label: "retry" | "retryDelay" | "retryBackoff", value: number, fallback: number): number => {
    if (!Number.isFinite(value)) {
        warn(`fetchStore("${name}") received non-finite ${label}; using ${fallback}.`);
        return fallback;
    }
    return value;
};

export const normalizeRetryOptions = (
    name: string,
    retry: number,
    retryDelay: number,
    retryBackoff: number
): { retry: number; retryDelay: number; retryBackoff: number } => {
    const rawRetry = Number.isFinite(retry)
        ? retry
        : (retry > 0 ? MAX_RETRY_ATTEMPTS : 0);
    const safeRetry = Math.min(
        MAX_RETRY_ATTEMPTS,
        Math.max(0, Math.trunc(rawRetry))
    );
    if (!Number.isFinite(retry)) {
        warn(`fetchStore("${name}") received non-finite retry; using ${safeRetry}.`);
    }
    const safeRetryDelay = Math.min(
        MAX_RETRY_DELAY_MS,
        Math.max(MIN_RETRY_DELAY_MS, normalizeRetryNumber(name, "retryDelay", retryDelay, 400))
    );
    const safeRetryBackoff = Math.min(
        MAX_RETRY_BACKOFF,
        Math.max(1, normalizeRetryNumber(name, "retryBackoff", retryBackoff, 1.7))
    );

    if (safeRetry !== retry) {
        warn(`fetchStore("${name}") clamped retry attempts to ${safeRetry}.`);
    }
    if (safeRetryDelay !== retryDelay) {
        warn(`fetchStore("${name}") clamped retryDelay to ${safeRetryDelay}ms.`);
    }
    if (safeRetryBackoff !== retryBackoff) {
        warn(`fetchStore("${name}") clamped retryBackoff to ${safeRetryBackoff}.`);
    }

    return {
        retry: safeRetry,
        retryDelay: safeRetryDelay,
        retryBackoff: safeRetryBackoff,
    };
};


