/**
 * Seeded fuzz utilities.
 *
 * WHAT: Reproducible pseudo-random generators for API abuse tests.
 * WHY: Fuzz failures must be replayable from CI with an exact seed.
 */
export type SeededRng = {
    seed: number;
    next: () => number;
    int: (min: number, max: number) => number;
    bool: () => boolean;
    pick: <T>(arr: T[]) => T;
};

const normalizeSeed = (seed: number): number => (seed >>> 0) || 0x6d2b79f5;

export const createSeededRng = (seed: number): SeededRng => {
    let state = normalizeSeed(seed);
    const next = (): number => {
        state += 0x6d2b79f5;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    return {
        seed: normalizeSeed(seed),
        next,
        int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
        bool: () => next() > 0.5,
        pick: <T,>(arr: T[]): T => arr[Math.floor(next() * arr.length)],
    };
};

const randomAscii = (rng: SeededRng, min = 0, max = 16): string => {
    const len = rng.int(min, max);
    let out = "";
    for (let i = 0; i < len; i += 1) {
        const ch = rng.int(32, 126);
        out += String.fromCharCode(ch);
    }
    return out;
};

const randomPrimitive = (rng: SeededRng): unknown => {
    const kind = rng.int(0, 8);
    switch (kind) {
    case 0: return null;
    case 1: return undefined;
    case 2: return rng.bool();
    case 3: return rng.int(-100_000, 100_000);
    case 4: return rng.next() * 1_000;
    case 5: return randomAscii(rng);
    case 6: return Number.NaN;
    case 7: return Number.POSITIVE_INFINITY;
    default: return -Number.POSITIVE_INFINITY;
    }
};

export const randomJsonLike = (rng: SeededRng, depth = 0): unknown => {
    if (depth > 3) return randomPrimitive(rng);
    const kind = rng.int(0, 4);
    if (kind <= 2) return randomPrimitive(rng);
    if (kind === 3) {
        const arr = Array.from({ length: rng.int(0, 6) }, () => randomJsonLike(rng, depth + 1));
        return arr;
    }
    const obj: Record<string, unknown> = {};
    const count = rng.int(0, 6);
    for (let i = 0; i < count; i += 1) {
        obj[randomAscii(rng, 1, 12)] = randomJsonLike(rng, depth + 1);
    }
    return obj;
};

export const randomStoreKey = (rng: SeededRng): unknown => {
    const kind = rng.int(0, 7);
    switch (kind) {
    case 0: return "";
    case 1: return randomAscii(rng, 1, 24).replace(/\s/g, "_");
    case 2: return randomAscii(rng, 1, 24);
    case 3: return "__proto__";
    case 4: return "constructor";
    case 5: return "prototype";
    case 6: return undefined;
    default: return null;
    }
};

export const randomCreateStoreOptions = (rng: SeededRng): Record<string, unknown> => ({
    devtools: rng.bool(),
    persist: rng.bool() ? false : rng.pick([true, "localStorage", "sessionStorage"]),
    sync: rng.bool(),
    schema: rng.bool() ? { validate: (value: unknown) => value != null } : undefined,
    middleware: rng.bool()
        ? [({ next }: { next: unknown }) => next]
        : undefined,
});

