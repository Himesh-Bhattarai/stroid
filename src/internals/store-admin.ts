import { runStoreHook } from "../features/lifecycle.js";
import type { FeatureDeleteContext, FeatureName, StoreFeatureMeta } from "../feature-registry.js";
import {
    getStoreRegistry,
    hasStoreEntry,
    normalizeStoreRegistryScope,
} from "../store-registry.js";
import { deepClone, hashState, sanitize } from "../utils.js";
import { isDev, log, warn } from "./diagnostics.js";

type MetaEntry = StoreFeatureMeta;

const FEATURE_NAMES: FeatureName[] = ["persist", "devtools", "sync"];

export const createStoreAdmin = (scope: string) => {
    const registry = getStoreRegistry(normalizeStoreRegistryScope(scope));
    const stores = registry.stores as Record<string, unknown>;
    const subscribers = registry.subscribers as Record<string, Set<(value: unknown | null) => void>>;
    const initialStates = registry.initialStates as Record<string, unknown>;
    const initialFactories = registry.initialFactories as Record<string, (() => unknown) | undefined>;
    const metaEntries = registry.metaEntries as Record<string, MetaEntry>;
    const snapshotCache = registry.snapshotCache as Record<string, { version: number; snapshot: unknown | null }>;
    const featureRuntimes = registry.featureRuntimes;
    const deletingStores = registry.deletingStores;

    const reportStoreError = (name: string, message: string): void => {
        metaEntries[name]?.options?.onError?.(message);
        warn(message);
    };

    const createDeleteContext = ({
        name,
        prev,
        options,
        initialState,
        getMeta,
        getStoreValue,
        hasStore,
    }: {
        name: string;
        prev: unknown;
        options: MetaEntry["options"];
        initialState: unknown;
        getMeta: () => MetaEntry | undefined;
        getStoreValue: () => unknown;
        hasStore: () => boolean;
    }): FeatureDeleteContext => ({
        name,
        options,
        prev,
        getMeta,
        getStoreValue,
        getAllStores: () => stores,
        getInitialState: () => initialState,
        hasStore,
        setStoreValue: () => undefined,
        applyFeatureState: () => undefined,
        notify: () => undefined,
        reportStoreError: (message: string) => {
            options.onError?.(message);
            warn(message);
        },
        warn,
        log,
        hashState,
        deepClone,
        sanitize,
        validate: () => ({ ok: true, value: prev }),
        isDev,
    });

    const runFeatureDeleteHooks = ({
        name,
        prev,
        options,
        initialState,
        phase,
    }: {
        name: string;
        prev: unknown;
        options: MetaEntry["options"];
        initialState: unknown;
        phase: "before" | "after";
    }): void => {
        const beforeDeleteContext = createDeleteContext({
            name,
            prev,
            options,
            initialState,
            getMeta: () => metaEntries[name],
            getStoreValue: () => stores[name],
            hasStore: () => hasStoreEntry(registry, name),
        });

        const afterDeleteContext = createDeleteContext({
            name,
            prev,
            options,
            initialState,
            getMeta: () => undefined,
            getStoreValue: () => prev,
            hasStore: () => false,
        });

        FEATURE_NAMES.forEach((featureName) => {
            const runtime = featureRuntimes.get(featureName);
            if (phase === "before") runtime?.beforeStoreDelete?.(beforeDeleteContext);
            else runtime?.afterStoreDelete?.(afterDeleteContext);
        });
    };

    const deleteExistingStore = (name: string): void => {
        if (!hasStoreEntry(registry, name)) return;

        const prev = stores[name];
        const options = metaEntries[name].options;
        const initialState = initialStates[name];
        const subs = subscribers[name];
        deletingStores.add(name);

        try {
            subs?.forEach((fn) => {
                try {
                    fn(null);
                } catch (err) {
                    warn(`Subscriber for "${name}" threw during delete: ${(err as { message?: string })?.message ?? err}`);
                }
            });

            runStoreHook({
                name,
                label: "onDelete",
                fn: options.onDelete,
                args: [prev],
                onError: options.onError,
                warn,
            });

            runFeatureDeleteHooks({
                name,
                prev,
                options,
                initialState,
                phase: "before",
            });

            delete stores[name];
            delete subscribers[name];
            delete initialStates[name];
            delete initialFactories[name];
            delete metaEntries[name];
            delete snapshotCache[name];

            runFeatureDeleteHooks({
                name,
                prev,
                options,
                initialState,
                phase: "after",
            });
            log(`Store "${name}" deleted`);
        } finally {
            deletingStores.delete(name);
        }
    };

    const clearAllStores = (): string[] => {
        const removed: string[] = [];
        let pass = 0;
        while (true) {
            const names = Object.keys(stores);
            if (names.length === 0) break;
            names.forEach((name) => {
                if (hasStoreEntry(registry, name)) {
                    deleteExistingStore(name);
                    removed.push(name);
                }
            });
            pass += 1;
            if (pass > 10_000) break;
        }
        warn(`All stores cleared (${removed.length} stores removed)`);
        return removed;
    };

    const clearStores = (pattern?: string): string[] => {
        const names = Object.keys(stores).filter((n) => {
            if (!pattern) return true;
            if (pattern.endsWith("*")) return n.startsWith(pattern.slice(0, -1));
            return n === pattern;
        });
        names.forEach((name) => deleteExistingStore(name));
        return names;
    };

    return {
        deleteExistingStore,
        clearAllStores,
        clearStores,
        reportStoreError,
    };
};
