export const devDeepFreeze = <T>(value: T): T => {
    if (typeof value !== "object" || value === null) return value;
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
        const v = (value as Record<string, unknown>)[key];
        if (typeof v === "object" && v !== null && !Object.isFrozen(v)) {
            devDeepFreeze(v);
        }
    }
    return value;
};
