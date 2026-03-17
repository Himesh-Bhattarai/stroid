/**
 * @module store-create
 *
 * LAYER: Store runtime
 * OWNS:  Store creation and initialization.
 *
 * Consumers: Internal imports and public API.
 */
import { warn, warnAlways, error, log, isDev, isValidData, isValidStoreName, deepClone } from "./utils.js";
import {
    collectLegacyOptionDeprecationWarnings,
    normalizeStoreOptions,
    type StoreOptions,
} from "./adapters/options.js";
import type { NonFunction } from "./types/utility.js";
import {
    setStoreValueInternal,
    hasStoreEntryInternal,
    getRegistry,
} from "./store-lifecycle/registry.js";
import {
    sanitizeValue,
    normalizeCommittedState,
    invalidatePathCache,
} from "./store-lifecycle/validation.js";
import {
    runFeatureCreateHooks,
    runStoreHookSafe,
    resolveFeatureAvailability,
} from "./store-lifecycle/hooks.js";
import {
    reportStoreCreationError,
    reportStoreWarning,
    getSsrWarningIssued,
    markSsrWarningIssued,
} from "./store-lifecycle/identity.js";
import type { StoreDefinition, StoreValue } from "./store-lifecycle/types.js";
import { getConfig } from "./internals/config.js";
import { notify } from "./store-notify.js";
import { isTransactionActive, markTransactionFailed } from "./store-transaction.js";
import { registerTestResetHook } from "./internals/test-reset.js";

type LazyDisallow<T> = T extends { lazy: true } ? never : T;

const ssrGlobalAllowWarned = new Set<string>();
export const clearSsrGlobalAllowWarned = (name?: string): void => {
    if (name) {
        ssrGlobalAllowWarned.delete(name);
        return;
    }
    ssrGlobalAllowWarned.clear();
};
registerTestResetHook("store-create.ssr-global-warned", () => clearSsrGlobalAllowWarned(), 65);

export function createStore<Name extends string, State>(
    name: Name,
    initialData: () => State,
    option: StoreOptions<State> & { lazy: true }
): StoreDefinition<Name, State> | undefined;
export function createStore<Name extends string, State, Opt extends StoreOptions<State>>(
    name: Name,
    initialData: NonFunction<State>,
    option?: LazyDisallow<Opt>
): StoreDefinition<Name, State> | undefined;
export function createStore<Name extends string, State>(
    name: Name,
    initialData: State,
    option: StoreOptions<State> = {}
): StoreDefinition<Name, State> | undefined {
    if (isTransactionActive()) {
        const message =
            `createStore("${String(name)}") cannot be called inside setStoreBatch. ` +
            `Move createStore outside the batch to preserve transaction semantics.`;
        reportStoreCreationError(message, option.onError as ((message: string) => void) | undefined);
        markTransactionFailed(message);
        return;
    }
    if (!isValidStoreName(name)) {
        reportStoreCreationError(
            `createStore("${String(name)}") is not a valid store name.`,
            option.onError as ((message: string) => void) | undefined
        );
        return;
    }
    const lazyRequested = option.lazy === true && typeof initialData === "function";
    if (!lazyRequested && !isValidData(initialData)) {
        reportStoreCreationError(
            `createStore("${name}") received invalid initial data.`,
            option.onError as ((message: string) => void) | undefined
        );
        return;
    }
    if (initialData === undefined && isDev()) {
        warn(
            `createStore("${name}") received an undefined initial value. ` +
            `This can be indistinguishable from a missing store in some consumers; consider null or an explicit shape if that is intentional.`
        );
    }

    collectLegacyOptionDeprecationWarnings(option).forEach((message) => {
        warn(message);
    });

    const normalizedOptions = resolveFeatureAvailability(
        name,
        normalizeStoreOptions(option, name, getConfig().defaultSnapshotMode)
    );

    if (normalizedOptions.scope === "temp" && option.persist) {
        const message =
            `Store "${name}" has scope: "temp" but persist is enabled. ` +
            `Temp stores are intended to be ephemeral.`;
        normalizedOptions.onError?.(message);
        if (!isDev()) warnAlways(message);
        error(message);
    }

    const isServer = typeof window === "undefined";
    const nodeEnv = typeof process !== "undefined" ? process.env?.NODE_ENV : undefined;
    const isProdServer = isServer && nodeEnv === "production";
    const allowGlobalSSR = normalizedOptions.allowSSRGlobalStore ?? false;
    const registry = getRegistry();
    const registryStores = registry.stores;
    const registrySubscribers = registry.subscribers;
    const registryInitialStates = registry.initialStates;
    const registryInitialFactories = registry.initialFactories;
    const registryMeta = registry.metaEntries;
    const isRequestRegistry = registry.scope === "request";

    if (isProdServer && !allowGlobalSSR && !isRequestRegistry) {
        const msg =
            `createStore("${name}") is blocked on the server in production to prevent cross-request memory leaks.\n` +
            `Call createStoreForRequest(...) inside each request scope or pass { scope: "global" } to opt in.`;
        reportStoreCreationError(msg, option.onError as ((message: string) => void) | undefined);
        return;
    }
    if (isProdServer && allowGlobalSSR && !isRequestRegistry && !ssrGlobalAllowWarned.has(name)) {
        ssrGlobalAllowWarned.add(name);
        warnAlways(
            `createStore("${name}") is allowed on the server in production because allowSSRGlobalStore is true.\n` +
            `This can leak data across concurrent requests. Prefer createStoreForRequest(...) or scope: "request" unless you truly need a global SSR store.`
        );
    }

    if (hasStoreEntryInternal(name, registry)) {
        const msg = `Store "${name}" already exists. Call setStore("${name}", data) to update instead.`;
        reportStoreWarning(name, msg);
        return { name } as StoreDefinition<Name, State>;
    }

    if (isServer && !allowGlobalSSR && !isRequestRegistry && !getSsrWarningIssued(name) && isDev()) {
        markSsrWarningIssued(name);
        warn(
            `createStore("${name}") called in a server environment. ` +
            `Use createStoreForRequest(...) per request to avoid cross-request leaks ` +
            `or pass { allowSSRGlobalStore: true } if you really want a global store on the server.`
        );
    }

    const cleanResult = sanitizeValue(name, initialData, normalizedOptions.onError);
    if (!cleanResult.ok) return;
    const clean = cleanResult.value;
    const isLazy = normalizedOptions.lazy === true && typeof initialData === "function";

    const hadPreexistingSubscribers = (registrySubscribers[name]?.size ?? 0) > 0;
    if (isLazy) {
        registryStores[name] = undefined;
        registryInitialFactories[name] = initialData as () => unknown;
    } else {
        const validated = normalizeCommittedState(name, clean, normalizedOptions.validate, normalizedOptions.onError);
        if (!validated.ok) return;
        setStoreValueInternal(name, validated.value, registry);
        registryInitialStates[name] = deepClone(validated.value);
    }
    const createdAtMs = Date.now();
    const createdAtIso = new Date(createdAtMs).toISOString();
    registryMeta[name] = {
        createdAt: createdAtIso,
        updatedAt: createdAtIso,
        updatedAtMs: createdAtMs,
        updateCount: 0,
        version: normalizedOptions.version,
        metrics: { notifyCount: 0, totalNotifyMs: 0, lastNotifyMs: 0 },
        options: normalizedOptions,
        readCount: 0,
        lastReadAt: null,
        lastReadAtMs: null,
        lastCorrelationId: null,
        lastCorrelationAt: null,
        lastCorrelationAtMs: null,
        lastTraceContext: null,
    };

    invalidatePathCache(name);
    runFeatureCreateHooks(name, notify);
    runStoreHookSafe(name, "onCreate", registryMeta[name].options.onCreate, [clean]);
    if (hadPreexistingSubscribers) notify(name);

    log(`Store "${name}" created -> ${JSON.stringify(clean)}`);
    return { name } as StoreDefinition<Name, State>;
}

export function createStoreStrict<Name extends string, State>(
    name: Name,
    initialData: () => State,
    option: StoreOptions<State> & { lazy: true }
): StoreDefinition<Name, State>;
export function createStoreStrict<Name extends string, State, Opt extends StoreOptions<State>>(
    name: Name,
    initialData: NonFunction<State>,
    option?: LazyDisallow<Opt>
): StoreDefinition<Name, State>;
export function createStoreStrict<Name extends string, State>(
    name: Name,
    initialData: State,
    option: StoreOptions<State> = {}
): StoreDefinition<Name, State> {
    const created = option.lazy === true
        ? createStore(name, initialData as () => State, option as StoreOptions<State> & { lazy: true })
        : createStore(name, initialData as NonFunction<State>, option);
    if (created) return created;
    throw new Error(
        `createStoreStrict("${String(name)}") failed. ` +
        `See earlier warnings/errors or onError callbacks for the cause.`
    );
}
