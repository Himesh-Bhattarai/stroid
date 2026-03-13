import { critical, warn, warnAlways } from "./diagnostics.js";

export type IssueSeverity = "warn" | "critical";
export type IssueVisibility = "dev" | "always";

export type IssueOptions = {
    severity?: IssueSeverity;
    visibility?: IssueVisibility;
    onError?: (message: string) => void;
};

export const reportIssue = (message: string, options: IssueOptions = {}): void => {
    const {
        severity = "warn",
        visibility = "dev",
        onError,
    } = options;

    onError?.(message);

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
