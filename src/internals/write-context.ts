/**
 * @module internals/write-context
 *
 * LAYER: Internal subsystem
 * OWNS:  Correlation/trace context for write chains.
 *
 * Consumers: store-write.ts, notification/delivery.ts, async-fetch.ts.
 */
import type { TraceContext } from "../types/utility.js";
import { warnAlways } from "../utils.js";
import { registerTestResetHook } from "./test-reset.js";

export type WriteContext = {
    correlationId?: string;
    traceContext?: TraceContext;
};

export type WriteContextRunner = {
    run: <T>(context: WriteContext, fn: () => T) => T;
    get: () => WriteContext | null;
};

let currentContext: WriteContext | null = null;
let currentWriteContextRunner: WriteContextRunner | null = null;

export const injectWriteContextRunner = (runner: WriteContextRunner | null): void => {
    if (!runner) {
        currentWriteContextRunner = null;
        return;
    }
    if (currentWriteContextRunner && currentWriteContextRunner !== runner) {
        warnAlways(
            `injectWriteContextRunner(...) was called more than once. ` +
            `The existing runner will be kept to avoid cross-request write-context leaks. ` +
            `If you need to replace it in tests, call injectWriteContextRunner(null) first.`
        );
        return;
    }
    currentWriteContextRunner = runner;
};

const clearWriteContextRunner = (): void => {
    currentContext = null;
    currentWriteContextRunner = null;
};

registerTestResetHook("write-context.runner", clearWriteContextRunner, 121);

export const getWriteContext = (): WriteContext | null =>
    currentWriteContextRunner?.get() ?? currentContext;

export const runWithWriteContext = <T>(context: WriteContext | null | undefined, fn: () => T): T => {
    if (!context || (!context.correlationId && !context.traceContext)) {
        return fn();
    }
    if (currentWriteContextRunner) {
        return currentWriteContextRunner.run(context, fn);
    }
    const prev = currentContext;
    currentContext = context;
    try {
        return fn();
    } finally {
        currentContext = prev;
    }
};
