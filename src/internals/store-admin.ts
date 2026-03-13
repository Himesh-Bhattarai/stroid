import { runStoreHook } from "../features/lifecycle.js";
import { getRegisteredFeatureNames, type FeatureDeleteContext, type StoreFeatureMeta } from "../feature-registry.js";
import { hasStoreEntry, type StoreRegistry } from "../store-registry.js";
import { deepClone, hashState, sanitize } from "../utils.js";
import { isDev, log, warn } from "./diagnostics.js";
import { reportIssue } from "./reporting.js";
import { isComputed } from "../computed-graph.js";
import { deleteComputed } from "../computed.js";

type MetaEntry = StoreFeatureMeta;

export const createStoreAdmin = (registry: StoreRegistry) => {
    const stores = registry.stores as Record<string, unknown>;
    const subscribers = registry.subscribers as Record<string, Set<(value: unknown | null) => void>>;
    const initialStates = registry.initialStates as Record<string, unknown>;
    const initialFactories = registry.initialFactories as Record<string, (() => unknown) | undefined>;
    const metaEntries = registry.metaEntries as Record<string, MetaEntry>;
    const snapshotCache = registry.snapshotCache as Record<string, { version: number; snapshot: unknown | null }>;
    const featureRuntimes = registry.featureRuntimes;
    const deletingStores = registry.deletingStores;

    const reportStoreError = (name: string, message: string): void => {
        reportIssue(message, {
            onError: metaEntries[name]?.options?.onError,
            severity: "warn",
            visibility: "dev",
        });
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
            reportIssue(message, {
                onError: options.onError,
                severity: "warn",
                visibility: "dev",
            });
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

        getRegisteredFeatureNames().forEach((featureName) => {
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
                reportIssue: (message, visibility) => {
                    reportIssue(message, {
                        onError: options.onError,
                        severity: "warn",
                        visibility,
                    });
                },
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

            if (isComputed(name)) {
                deleteComputed(name);
            }

            const dependents = registry.computedDependents;
            const affected = dependents[name] ?? [];
            for (const computedName of affected) {
                warn(
                    `[stroid] source store "${name}" was deleted. ` +
                    `Computed store "${computedName}" depends on it and will return stale data. ` +
                    `Call deleteComputed("${computedName}") to clean up.`
                );
            }

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
