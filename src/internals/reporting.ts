/**
 * @module internals/reporting
 *
 * LAYER: Internal subsystem
 * OWNS:  Module-level behavior and exports for internals/reporting.
 *
 * Consumers: Internal imports and public API.
 */
import { critical, warn, warnAlways } from "./diagnostics.js";

export type IssueSeverity = "warn" | "critical";
export type IssueVisibility = "dev" | "always";

export type IssueOptions = {
    severity?: IssueSeverity;
    visibility?: IssueVisibility;
    onError?: (message: string) => void;
};

export const safeInvoke = <T extends unknown[]>(
    fn: ((...args: T) => void) | undefined,
    label: string,
    ...args: T
): void => {
    if (typeof fn !== "function") return;
    try {
        fn(...args);
    } catch (err) {
        const message = (err as { message?: string })?.message ?? err;
        warnAlways(`${label} callback threw: ${String(message)}`);
    }
};

export const reportIssue = (message: string, options: IssueOptions = {}): void => {
    const {
        severity = "warn",
        visibility = "dev",
        onError,
    } = options;

    safeInvoke(onError, "onError", message);

    if (severity === "critical") {
        if (visibility === "dev") warn(message);
        critical(message);
        return;
    }

    if (visibility === "always") {
        warnAlways(message);
        return;
    }

    warn(message);
};


