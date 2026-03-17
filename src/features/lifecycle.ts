/**
 * @module features/lifecycle
 *
 * LAYER: Feature runtime
 * OWNS:  Module-level behavior and exports for features/lifecycle.
 *
 * Consumers: Internal imports and public API.
 */
import type { StoreValue } from "../adapters/options.js";
import { deepClone, isDev } from "../utils.js";

export const MIDDLEWARE_ABORT = Symbol("stroid.middleware.abort");

export type LifecycleIssueReporter = (message: string, visibility?: "dev" | "always") => void;

export const runMiddleware = ({
    name,
    payload,
    middlewares,
    reportIssue,
    warn,
}: {
    name: string;
    payload: {
        action: string;
        prev: StoreValue;
        next: StoreValue;
        path: unknown;
        correlationId?: string;
        traceContext?: import("../types/utility.js").TraceContext;
    };
    middlewares: Array<(ctx: {
        action: string;
        name: string;
        prev: StoreValue;
        next: StoreValue;
        path: unknown;
        correlationId?: string;
        traceContext?: import("../types/utility.js").TraceContext;
    }) => StoreValue | void>;
    reportIssue: LifecycleIssueReporter;
    warn: (message: string) => void;
}): StoreValue | typeof MIDDLEWARE_ABORT => {
    if (!Array.isArray(middlewares) || middlewares.length === 0) return payload.next;
    const warnedUndefined = new WeakSet<Function>();
    let nextState = deepClone(payload.next);
    for (const mw of middlewares) {
        if (typeof mw !== "function") continue;
        let result: StoreValue | void;
        const middlewareNext = nextState;
        try {
            result = mw({
                action: payload.action,
                name,
                prev: payload.prev,
                next: middlewareNext,
                path: payload.path,
                correlationId: payload.correlationId,
                traceContext: payload.traceContext,
            });
        } catch (err) {
            const message = `Middleware for "${name}" failed: ${(err as { message?: string })?.message ?? err}`;
            reportIssue(message, "dev");
            return MIDDLEWARE_ABORT;
        }
        if (result && typeof (result as Promise<unknown>).then === "function") {
            const message = `Middleware for "${name}" must be synchronous. Promise-returning middleware is not supported.`;
            reportIssue(message, "dev");
            return MIDDLEWARE_ABORT;
        }
        if (result === undefined) {
            if (isDev() && !warnedUndefined.has(mw)) {
                warnedUndefined.add(mw);
                warn(`Middleware for "${name}" returned undefined; treating as pass-through. Return the new state to override.`);
            }
            nextState = middlewareNext;
        } else {
            nextState = result;
        }
    }
    return nextState;
};

export const runStoreHook = ({
    name,
    label,
    fn,
    args,
    reportIssue,
}: {
    name: string;
    label: "onCreate" | "onSet" | "onReset" | "onDelete";
    fn: ((...args: any[]) => void) | undefined;
    args: any[];
    reportIssue: LifecycleIssueReporter;
}): void => {
    if (typeof fn !== "function") return;
    try {
        fn(...args);
    } catch (err) {
        const message = `${label} for "${name}" failed: ${(err as { message?: string })?.message ?? err}`;
        reportIssue(message, "always");
    }
};


