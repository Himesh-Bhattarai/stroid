import { warn, warnAlways, critical, isDev, suggestStoreName } from "../utils.js";
import { getConfig, getNamespace } from "../internals/config.js";
import { hasStoreEntryInternal, stores, isDeleting, meta, featureRuntimes } from "./registry.js";
import type { FeatureName } from "../feature-registry.js";
import type { StoreDefinition } from "./types.js";

const _ssrWarningsIssued = new Set<string>();
export const getSsrWarningIssued = (name?: string): boolean =>
    name ? _ssrWarningsIssued.has(name) : _ssrWarningsIssued.size > 0;
export const markSsrWarningIssued = (name: string): void => {
    if (!name) return;
    _ssrWarningsIssued.add(name);
};
export const resetSsrWarningFlag = (): void => {
    _ssrWarningsIssued.clear();
};

const _namespaceWarnings = new Set<string>();
export const qualifyName = (raw: string): string => {
    const ns = getNamespace();
    if (!ns) return raw;
    if (raw.includes("::")) return raw;
    if (isDev() && !_namespaceWarnings.has(raw)) {
        _namespaceWarnings.add(raw);
        warn(
            `Namespace "${ns}" is active; treating store "${raw}" as "${ns}::${raw}". ` +
            `Consider using namespace("${ns}").create("...") to be explicit.`
        );
    }
    return `${ns}::${raw}`;
};

export const nameOf = (name: string | StoreDefinition<string, unknown>): string =>
    qualifyName(typeof name === "string" ? name : name.name);

export const exists = (name: string): boolean => {
    if (hasStoreEntryInternal(name) && !isDeleting(name)) return true;
    suggestStoreName(name, Object.keys(stores));
    return false;
};

export const reportStoreError = (name: string, message: string): void => {
    meta[name]?.options?.onError?.(message);
    critical(message);
};

export const reportStoreCreationError = (message: string, onError?: (message: string) => void): void => {
    onError?.(message);
    critical(message);
};

export const warnMissingFeature = (storeName: string, featureName: FeatureName, onError?: (message: string) => void): void => {
    const message =
        `Store "${storeName}" requested ${featureName} support, but "${featureName}" is not registered.\n` +
        `Import "stroid/${featureName}" before calling createStore("${storeName}", ...).`;
    onError?.(message);
    warnAlways(message);
    if (getConfig().strictMissingFeatures) {
        throw new Error(message);
    }
};

export const getFeatureApi = (name: FeatureName) => featureRuntimes.get(name)?.api;
