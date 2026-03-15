/**
 * @fileoverview src\devfreeze.ts
 */
export const devDeepFreeze = <T>(value: T): T => {
    if (typeof value !== "object" || value === null) return value;
    // Skip React elements, DOM nodes, and complex instances (Maps, Sets, third-party classes, etc.)
    if (
        (value as any).$$typeof || 
        (typeof window !== "undefined" && value instanceof Element) ||
        (value.constructor && value.constructor.name !== "Object" && value.constructor.name !== "Array")
    ) {
        return value;
    }
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

