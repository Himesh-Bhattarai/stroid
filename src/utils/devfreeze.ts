/**
 * @module devfreeze
 *
 * LAYER: Module
 * OWNS:  Module-level behavior and exports for devfreeze.
 *
 * Consumers: Internal imports and public API.
 */
const isFreezableObject = (value: unknown): value is object => {
    if (typeof value !== "object" || value === null) return false;
    const anyValue = value as any;
    // Skip React elements, DOM nodes, and complex instances (Maps, Sets, third-party classes, etc.)
    if (anyValue.$$typeof) return false;
    if (typeof window !== "undefined" && value instanceof Element) return false;
    const ctorName = anyValue.constructor?.name;
    if (ctorName && ctorName !== "Object" && ctorName !== "Array") return false;
    return true;
};

export const devShallowFreeze = <T>(value: T): T => {
    if (!isFreezableObject(value)) return value;
    if (!Object.isFrozen(value)) {
        Object.freeze(value);
    }
    return value;
};

export const devDeepFreeze = <T>(value: T): T => {
    if (!isFreezableObject(value)) return value;
    const stack: object[] = [value as object];
    const seen = new WeakSet<object>();

    while (stack.length > 0) {
        const current = stack.pop()!;
        if (seen.has(current)) continue;
        seen.add(current);

        if (!Object.isFrozen(current)) {
            Object.freeze(current);
        }

        for (const key of Object.keys(current as Record<string, unknown>)) {
            const next = (current as Record<string, unknown>)[key];
            if (typeof next === "object" && next !== null && !seen.has(next)) {
                stack.push(next);
            }
        }
    }
    return value;
};


