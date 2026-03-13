/**
 * @module computed-graph
 *
 * LAYER: Internal graph engine
 * OWNS:  Dependency tracking, cycle detection, topological ordering,
 *        computed entry CRUD. Zero React. Zero async.
 *
 * Consumers: computed.ts (public API), store-notify.ts (flush ordering),
 *            store-admin.ts (cleanup on delete), runtime-tools.ts (diagnostics)
 */
import {
    getStoreRegistry,
    getActiveStoreRegistry,
    defaultRegistryScope,
    type ComputedEntry,
} from "./store-registry.js";
import { error } from "./utils.js";

const getRegistry = () => getActiveStoreRegistry(getStoreRegistry(defaultRegistryScope));

const getEntries = () => getRegistry().computedEntries;
const getDependents = () => getRegistry().computedDependents;

export const detectCycle = (name: string, deps: string[]): string | null => {
    const entries = getEntries();
    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (current: string): boolean => {
        if (current === name) return true;
        if (visited.has(current)) return false;
        visited.add(current);
        path.push(current);

        const currentDeps = entries[current]?.deps ?? [];
        for (const dep of currentDeps) {
            if (dfs(dep)) return true;
        }

        path.pop();
        return false;
    };

    for (const dep of deps) {
        path.length = 0;
        visited.clear();
        if (dfs(dep)) {
            return [name, ...path, name].join(" -> ");
        }
    }

    return null;
};

const removeComputedDependentLinks = (name: string, deps: string[]): void => {
    const dependents = getDependents();
    for (const dep of deps) {
        if (!dependents[dep]) continue;
        dependents[dep] = dependents[dep].filter((d) => d !== name);
        if (dependents[dep].length === 0) delete dependents[dep];
    }
};

export const registerComputed = (
    name: string,
    deps: string[],
    compute: (...args: unknown[]) => unknown
): boolean => {
    const cycleTrace = detectCycle(name, deps);
    if (cycleTrace) {
        error(
            `[stroid] createComputed("${name}") rejected: ` +
            `circular dependency detected -> ${cycleTrace}\n` +
            `Define relationships without cycles.`
        );
        return false;
    }

    const entries = getEntries();
    const dependents = getDependents();

    if (entries[name]) {
        removeComputedDependentLinks(name, entries[name].deps);
    }

    entries[name] = { deps, compute, stale: true } as ComputedEntry;

    for (const dep of deps) {
        if (!dependents[dep]) dependents[dep] = [];
        if (!dependents[dep].includes(name)) {
            dependents[dep].push(name);
        }
    }

    return true;
};

export const unregisterComputed = (name: string): void => {
    const entries = getEntries();
    const entry = entries[name];
    if (!entry) return;

    removeComputedDependentLinks(name, entry.deps);
    delete entries[name];
};

export const markStale = (name: string): void => {
    const entries = getEntries();
    if (entries[name]) entries[name].stale = true;
};

export const isComputed = (name: string): boolean =>
    Object.prototype.hasOwnProperty.call(getEntries(), name);

export const getComputedEntry = (name: string): ComputedEntry | undefined =>
    getEntries()[name];

export const getTopoOrderedComputeds = (changedSources: string[]): string[] => {
    const entries = getEntries();
    const dependents = getDependents();

    const affected = new Set<string>();
    const queue = [...changedSources];

    while (queue.length > 0) {
        const current = queue.shift()!;
        const deps = dependents[current] ?? [];
        for (const dep of deps) {
            if (!affected.has(dep)) {
                affected.add(dep);
                queue.push(dep);
            }
        }
    }

    if (affected.size === 0) return [];

    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const name of affected) {
        const entry = entries[name];
        if (!entry) continue;

        let degree = 0;
        for (const dep of entry.deps) {
            if (affected.has(dep)) {
                degree++;
                if (!adjList.has(dep)) adjList.set(dep, []);
                adjList.get(dep)!.push(name);
            }
        }
        inDegree.set(name, degree);
    }

    const ready: string[] = [];
    for (const [name, degree] of inDegree) {
        if (degree === 0) ready.push(name);
    }
    ready.sort();

    const sorted: string[] = [];
    while (ready.length > 0) {
        const name = ready.shift()!;
        sorted.push(name);

        const children = adjList.get(name) ?? [];
        for (const child of children) {
            const newDegree = (inDegree.get(child) ?? 1) - 1;
            inDegree.set(child, newDegree);
            if (newDegree === 0) {
                const insertAt = ready.findIndex((n) => n > child);
                if (insertAt === -1) ready.push(child);
                else ready.splice(insertAt, 0, child);
            }
        }
    }

    return sorted;
};

export const getFullComputedGraph = (): {
    nodes: string[];
    edges: Array<{ from: string; to: string }>;
    dependencies: Record<string, string[]>;
    dependents: Record<string, string[]>;
} => {
    const entries = getEntries();
    const dependents = getDependents();

    const nodes = Object.keys(entries);
    const edges: Array<{ from: string; to: string }> = [];

    for (const [name, entry] of Object.entries(entries)) {
        for (const dep of entry.deps) {
            edges.push({ from: dep, to: name });
        }
    }

    return {
        nodes,
        edges,
        dependencies: Object.fromEntries(
            Object.entries(entries).map(([k, v]) => [k, [...v.deps]])
        ),
        dependents: Object.fromEntries(
            Object.entries(dependents).map(([k, v]) => [k, [...v]])
        ),
    };
};

export const getComputedDepsFor = (name: string): { deps: string[]; dependents: string[] } | null => {
    const entry = getEntries()[name];
    if (!entry) return null;
    return {
        deps: [...entry.deps],
        dependents: [...(getDependents()[name] ?? [])],
    };
};
