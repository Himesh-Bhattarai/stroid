/**
 * @module types/utility
 *
 * LAYER: Types
 * OWNS:  Shared utility types for cross-module reuse.
 *
 * Consumers: store-create.ts, store-name.ts, computed.ts, testing.ts.
 */

export type NonFunction<T> = T extends Function ? never : T;
export type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };
export type StoreId = string | symbol;
export type TraceContext = { traceId: string; spanId: string } & Record<string, unknown>;
