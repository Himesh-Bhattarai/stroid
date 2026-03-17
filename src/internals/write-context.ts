/**
 * @module internals/write-context
 *
 * LAYER: Internal subsystem
 * OWNS:  Correlation/trace context for write chains.
 *
 * Consumers: store-write.ts, notification/delivery.ts, async-fetch.ts.
 */
import type { TraceContext } from "../types/utility.js";

export type WriteContext = {
    correlationId?: string;
    traceContext?: TraceContext;
};

let currentContext: WriteContext | null = null;

export const getWriteContext = (): WriteContext | null => currentContext;

export const runWithWriteContext = <T>(context: WriteContext | null | undefined, fn: () => T): T => {
    if (!context || (!context.correlationId && !context.traceContext)) {
        return fn();
    }
    const prev = currentContext;
    currentContext = context;
    try {
        return fn();
    } finally {
        currentContext = prev;
    }
};
