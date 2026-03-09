import type { StoreValue } from "../adapters/options.js";
import { deepClone } from "../utils.js";

export const MIDDLEWARE_ABORT = Symbol("stroid.middleware.abort");

export const runMiddleware = ({
    name,
    payload,
    middlewares,
    onError,
    warn,
}: {
    name: string;
    payload: { action: string; prev: StoreValue; next: StoreValue; path: unknown };
    middlewares: Array<(ctx: {
        action: string;
        name: string;
        prev: StoreValue;
        next: StoreValue;
        path: unknown;
    }) => StoreValue | void>;
    onError?: (message: string) => void;
    warn: (message: string) => void;
}): StoreValue | typeof MIDDLEWARE_ABORT => {
    if (!Array.isArray(middlewares)) return payload.next;
    let nextState = payload.next;
    for (const mw of middlewares) {
        if (typeof mw !== "function") continue;
        let result: StoreValue | void;
        const middlewareNext = deepClone(nextState);
        try {
            result = mw({
                action: payload.action,
                name,
                prev: payload.prev,
                next: middlewareNext,
                path: payload.path,
            });
        } catch (err) {
            const message = `Middleware for "${name}" failed: ${(err as { message?: string })?.message ?? err}`;
            onError?.(message);
            warn(message);
            return MIDDLEWARE_ABORT;
        }
        if (result && typeof (result as Promise<unknown>).then === "function") {
            const message = `Middleware for "${name}" must be synchronous. Promise-returning middleware is not supported.`;
            onError?.(message);
            warn(message);
            return MIDDLEWARE_ABORT;
        }
        nextState = result !== undefined ? result : middlewareNext;
    }
    return nextState;
};

export const runStoreHook = ({
    name,
    label,
    fn,
    args,
    onError,
    warn,
}: {
    name: string;
    label: "onCreate" | "onSet" | "onReset" | "onDelete";
    fn: ((...args: any[]) => void) | undefined;
    args: any[];
    onError?: (message: string) => void;
    warn: (message: string) => void;
}): void => {
    if (typeof fn !== "function") return;
    try {
        fn(...args);
    } catch (err) {
        const message = `${label} for "${name}" failed: ${(err as { message?: string })?.message ?? err}`;
        onError?.(message);
        warn(message);
    }
};
