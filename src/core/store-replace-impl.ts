/**
 * @module store-replace-impl
 *
 * LAYER: Store runtime
 * OWNS:  replaceStore implementation.
 *
 * Consumers: store-replace, store-hydrate-impl.
 */
import { getRegistry, getStoreValueRef } from "./store-lifecycle/registry.js";
import {
    sanitizeValue,
    normalizeCommittedState,
} from "./store-lifecycle/validation.js";
import { runMiddlewareForStore } from "./store-lifecycle/hooks.js";
import { nameOf, exists, reportStoreWarning } from "./store-lifecycle/identity.js";
import type {
    StoreDefinition,
    StoreValue,
    StoreKey,
    StoreName,
    StateFor,
    WriteResult,
} from "./store-lifecycle/types.js";
import type { StoreRegistry } from "./store-registry.js";
import type { WriteContext } from "../internals/write-context.js";
import { MIDDLEWARE_ABORT } from "../features/lifecycle.js";
import { createRootSetRuntimePatch } from "./runtime-patch.js";
import {
    isTransactionActive,
    getStagedTransactionValue,
    markTransactionFailed,
} from "./store-transaction.js";
import { resolveWriteContext, stageOrCommitUpdate, type CommitAction } from "./store-write-shared.js";

export function replaceStore<Name extends string, State>(name: StoreDefinition<Name, State>, value: State): WriteResult;
export function replaceStore<Name extends string, State>(name: StoreKey<Name, State>, value: State): WriteResult;
export function replaceStore<Name extends StoreName>(name: Name, value: StateFor<Name>): WriteResult;
export function replaceStore(nameInput: string | StoreDefinition<string, StoreValue>, value: unknown): WriteResult {
    const storeName = nameOf(nameInput);
    if (!storeName) return { ok: false, reason: "invalid-args" };

    const registry = getRegistry();
    const result = replaceStoreState(registry, storeName, value, "replace");
    if (!result.ok) {
        if (result.reason === "not-found") return { ok: false, reason: "not-found" };
        if (result.reason === "middleware") return { ok: false, reason: "middleware" };
        return { ok: false, reason: "validate" };
    }
    return { ok: true };
}

export const replaceStoreState = (
    registry: StoreRegistry,
    name: string,
    data: unknown,
    action: CommitAction = "hydrate",
    context?: WriteContext | null
): { ok: boolean; reason?: string } => {
    const fail = (reason: string, message?: string): { ok: false; reason: string } => {
        if (isTransactionActive()) {
            markTransactionFailed(message ?? reason);
        }
        return { ok: false, reason };
    };
    if (!exists(name)) {
        return fail("not-found", `replaceStore("${name}") called before createStore().`);
    }
    const stagedPrev = isTransactionActive() ? getStagedTransactionValue(name) : { has: false, value: undefined };
    const prev = stagedPrev.has ? stagedPrev.value : getStoreValueRef(name, registry);
    const nextResult = sanitizeValue(name, data);
    if (!nextResult.ok) return fail("sanitize", `replaceStore("${name}") failed sanitize`);
    const nextValue = nextResult.value;
    if (nextValue === undefined) {
        const message = `Whole-store undefined replacement is blocked for "${name}". Use null for intentional empty state.`;
        reportStoreWarning(name, message);
        return fail("undefined", message);
    }

    const validateRule = registry.metaEntries[name]?.options?.validate;

    const writeContext = resolveWriteContext(context);
    const final = runMiddlewareForStore(name, {
        action,
        prev,
        next: nextValue,
        path: null,
        correlationId: writeContext?.correlationId,
        traceContext: writeContext?.traceContext,
    });
    if (final === MIDDLEWARE_ABORT) return fail("middleware", `replaceStore("${name}") aborted by middleware`);
    const committed = normalizeCommittedState(name, final, validateRule);
    if (!committed.ok) return fail("validate", `replaceStore("${name}") failed validation`);
    stageOrCommitUpdate(registry, {
        name,
        prev,
        next: committed.value,
        action,
        hookLabel: "onSet",
        logMessage: `Store "${name}" ${action === "hydrate" ? "hydrated" : "replaced"}`,
        context: writeContext,
        runtimePatches: [
            createRootSetRuntimePatch({
                store: name,
                value: committed.value,
                source: action === "hydrate" ? "hydrateStores" : "replaceStore",
                context: writeContext,
            }),
        ],
    });
    return { ok: true };
};
