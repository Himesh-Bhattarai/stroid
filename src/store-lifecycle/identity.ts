import { warn, isDev, suggestStoreName } from "../utils.js";
import { getConfig, getNamespace } from "../internals/config.js";
import { reportIssue, type IssueSeverity, type IssueVisibility } from "../internals/reporting.js";
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

export const reportStoreIssue = (
    name: string,
    message: string,
    options: { severity?: IssueSeverity; visibility?: IssueVisibility } = {}
): void => {
    reportIssue(message, {
        ...options,
        onError: meta[name]?.options?.onError,
    });
};

export const reportStoreCreationIssue = (
    message: string,
    onError?: (message: string) => void,
    options: { severity?: IssueSeverity; visibility?: IssueVisibility } = {}
): void => {
    reportIssue(message, {
        ...options,
        onError,
    });
};

export const reportStoreWarning = (
    name: string,
    message: string,
    visibility: IssueVisibility = "dev"
): void => {
    reportStoreIssue(name, message, { severity: "warn", visibility });
};

export const reportStoreCreationWarning = (
    message: string,
    onError?: (message: string) => void,
    visibility: IssueVisibility = "dev"
): void => {
    reportStoreCreationIssue(message, onError, { severity: "warn", visibility });
};

export const reportStoreError = (name: string, message: string): void =>
    reportStoreIssue(name, message, { severity: "critical", visibility: "always" });

export const reportStoreCreationError = (message: string, onError?: (message: string) => void): void =>
    reportStoreCreationIssue(message, onError, { severity: "critical", visibility: "always" });

export const warnMissingFeature = (storeName: string, featureName: FeatureName, onError?: (message: string) => void): void => {
    const message =
        `Store "${storeName}" requested ${featureName} support, but "${featureName}" is not registered.\n` +
        `Import "stroid/${featureName}" before calling createStore("${storeName}", ...).`;
    reportStoreCreationWarning(message, onError, "always");
    if (getConfig().strictMissingFeatures) {
        throw new Error(message);
    }
};

export const getFeatureApi = (name: FeatureName) => featureRuntimes.get(name)?.api;
