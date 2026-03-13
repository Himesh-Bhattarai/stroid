import type { StoreValue } from "../adapters/options.js";

export type FeatureValidation = (next: StoreValue) => { ok: boolean; value?: StoreValue };

export type NormalizedFeatureState =
    | { ok: true; value: StoreValue }
    | { ok: false };

export const normalizeFeatureState = ({
    value,
    sanitize,
    validate,
    onSanitizeError,
}: {
    value: unknown;
    sanitize?: (value: unknown) => unknown;
    validate: FeatureValidation;
    onSanitizeError?: (error: unknown) => void;
}): NormalizedFeatureState => {
    let candidate: StoreValue;
    if (sanitize) {
        try {
            candidate = sanitize(value) as StoreValue;
        } catch (err) {
            onSanitizeError?.(err);
            return { ok: false };
        }
    } else {
        candidate = value as StoreValue;
    }

    const validation = validate(candidate);
    if (!validation.ok) return { ok: false };
    return { ok: true, value: validation.value ?? candidate };
};

export const resolveUpdatedAtMs = ({
    value,
    fallbackMs = Date.now(),
    onInvalid,
}: {
    value: unknown;
    fallbackMs?: number;
    onInvalid?: () => void;
}): number => {
    const parsed =
        typeof value === "string" || typeof value === "number"
            ? Date.parse(String(value))
            : Number.NaN;
    if (!Number.isFinite(parsed)) {
        onInvalid?.();
        return fallbackMs;
    }
    return parsed;
};
