/**
 * @module runtime-patch
 *
 * LAYER: Store runtime
 * OWNS:  Canonical serializable patch model and write-lowering helpers.
 *
 * Consumers: store-set-impl, store-replace-impl, store-admin-impl, store-hydrate-impl.
 */
import { parsePath, type PathInput } from "../utils.js";
import { registerTestResetHook } from "../internals/test-reset.js";
import type { WriteContext } from "../internals/write-context.js";
import type { StoreRegistry } from "./store-registry.js";
import { getRegistry } from "./store-lifecycle/registry.js";

export type RuntimePatchOp = "set" | "merge" | "delete" | "insert";
export type RuntimePatchSource = "setStore" | "replaceStore" | "resetStore" | "hydrateStores";
export type RuntimePatchPath = readonly (string | number)[];
export type RuntimePatchPathInput =
    | PathInput
    | RuntimePatchPath
    | Array<string | number>;

export interface RuntimePatchMeta {
    timestamp: number;
    source: RuntimePatchSource;
    causedBy?: readonly string[];
    isUnsafe?: boolean;
    asyncBoundary?: boolean;
}

export interface RuntimePatch {
    id: string;
    store: string;
    path: RuntimePatchPath;
    op: RuntimePatchOp;
    value?: unknown;
    meta: RuntimePatchMeta;
}

export type SetStorePatchIntent =
    | { kind: "root" }
    | { kind: "merge"; value: unknown }
    | { kind: "path"; path: RuntimePatchPathInput; value: unknown };

let runtimePatchSequence = 0;

const nextRuntimePatchId = (source: RuntimePatchSource, timestamp: number): string => {
    if (runtimePatchSequence >= Number.MAX_SAFE_INTEGER) {
        runtimePatchSequence = 0;
    }
    runtimePatchSequence += 1;
    return `${source}:${timestamp}:${runtimePatchSequence}`;
};

const resolveCausedBy = (context?: WriteContext | null): readonly string[] | undefined => {
    const causedBy = [
        context?.correlationId,
        context?.traceContext?.traceId,
        context?.traceContext?.spanId,
    ].filter((value): value is string => typeof value === "string" && value.length > 0);
    return causedBy.length > 0 ? causedBy : undefined;
};

const clonePatch = (patch: RuntimePatch): RuntimePatch => ({
    ...patch,
    path: [...patch.path],
    meta: {
        ...patch.meta,
        causedBy: patch.meta.causedBy ? [...patch.meta.causedBy] : undefined,
    },
});

export const normalizeRuntimePatchPath = (
    path?: RuntimePatchPathInput | null
): RuntimePatchPath => {
    if (!path) return [];
    if (Array.isArray(path)) {
        return path.map((segment) =>
            typeof segment === "number" ? segment : String(segment)
        );
    }
    return parsePath(path as PathInput);
};

export const createRuntimePatch = (options: {
    store: string;
    op: RuntimePatchOp;
    path?: RuntimePatchPathInput | null;
    value?: unknown;
    source: RuntimePatchSource;
    timestamp?: number;
    context?: WriteContext | null;
    isUnsafe?: boolean;
    asyncBoundary?: boolean;
}): RuntimePatch => {
    const timestamp = options.timestamp ?? Date.now();
    return {
        id: nextRuntimePatchId(options.source, timestamp),
        store: options.store,
        path: normalizeRuntimePatchPath(options.path),
        op: options.op,
        ...(options.value !== undefined ? { value: options.value } : {}),
        meta: {
            timestamp,
            source: options.source,
            causedBy: resolveCausedBy(options.context),
            ...(options.isUnsafe === true ? { isUnsafe: true } : {}),
            ...(options.asyncBoundary === true ? { asyncBoundary: true } : {}),
        },
    };
};

export const createRootSetRuntimePatch = (options: {
    store: string;
    value: unknown;
    source: RuntimePatchSource;
    context?: WriteContext | null;
}): RuntimePatch =>
    createRuntimePatch({
        store: options.store,
        op: "set",
        path: [],
        value: options.value,
        source: options.source,
        context: options.context,
    });

export const createCanonicalSetStorePatches = (options: {
    store: string;
    intent: SetStorePatchIntent;
    committedValue: unknown;
    preserveIntent: boolean;
    context?: WriteContext | null;
}): RuntimePatch[] => {
    if (options.intent.kind === "root" || !options.preserveIntent) {
        return [
            createRootSetRuntimePatch({
                store: options.store,
                value: options.committedValue,
                source: "setStore",
                context: options.context,
            }),
        ];
    }
    if (options.intent.kind === "merge") {
        return [
            createRuntimePatch({
                store: options.store,
                op: "merge",
                path: [],
                value: options.intent.value,
                source: "setStore",
                context: options.context,
            }),
        ];
    }
    return [
        createRuntimePatch({
            store: options.store,
            op: "set",
            path: options.intent.path,
            value: options.intent.value,
            source: "setStore",
            context: options.context,
        }),
    ];
};

export const setLastRuntimePatches = (
    patches: readonly RuntimePatch[],
    registry: StoreRegistry = getRegistry()
): void => {
    registry.lastRuntimePatches = patches.map(clonePatch);
};

export const getLastRuntimePatches = (
    registry: StoreRegistry = getRegistry()
): readonly RuntimePatch[] => registry.lastRuntimePatches.map(clonePatch);

registerTestResetHook("runtime-patch.sequence", () => {
    runtimePatchSequence = 0;
}, 126);
