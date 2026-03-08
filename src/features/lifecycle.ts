import type { StoreValue } from "../adapters/options.js";

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
        try {
            result = mw({
                action: payload.action,
                name,
                prev: payload.prev,
                next: nextState,
                path: payload.path,
            });
        } catch (err) {
            const message = `Middleware for "${name}" failed: ${(err as { message?: string })?.message ?? err}`;
            onError?.(message);
            warn(message);
            return MIDDLEWARE_ABORT;
        }
        if (result !== undefined) nextState = result;
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
