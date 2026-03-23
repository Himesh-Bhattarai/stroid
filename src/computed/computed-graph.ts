/**
 * @module computed-graph
 *
 * LAYER: Module
 * OWNS:  Module-level behavior and exports for computed-graph.
 *
 * Consumers: Internal imports and public API.
 */
import {
    getStoreRegistry,
    getActiveStoreRegistry,
    defaultRegistryScope,
    type ComputedEntry,
} from "../core/store-registry.js";
import { error } from "../utils.js";
import { setComputedOrderResolver } from "../internals/computed-order.js";
import type {
    ComputedClassification,
    ComputedDescriptor,
    RuntimeEdgeType,
    RuntimeGraph,
    RuntimeGraphEdge,
    RuntimeGraphNode,
    RuntimeNodeId,
    RuntimeNodeType,
    RuntimePathSegment,
} from "./types.js";

const getRegistry = () => getActiveStoreRegistry(getStoreRegistry(defaultRegistryScope));
const DEFAULT_COMPUTED_CLASSIFICATION: ComputedClassification = "opaque";

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
        if (dfs(dep)) {
            return [name, ...path, name].join(" -> ");
        }
    }

    return null;
};

const removeComputedDependentLinks = (name: string, deps: string[]): void => {
    const dependents = getDependents();
    for (const dep of deps) {
        const links = dependents[dep];
        if (!links) continue;
        links.delete(name);
        if (links.size === 0) delete dependents[dep];
    }
};

export const registerComputed = (
    name: string,
    deps: string[],
    compute: (...args: unknown[]) => unknown,
    classification: ComputedClassification = DEFAULT_COMPUTED_CLASSIFICATION
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

    entries[name] = { deps, compute, stale: true, classification } as ComputedEntry;

    for (const dep of deps) {
        if (!dependents[dep]) dependents[dep] = new Set<string>();
        dependents[dep].add(name);
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

const getComputedNodeType = (
    classification: ComputedClassification
): Extract<RuntimeNodeType, "computed" | "async-boundary"> =>
    classification === "asyncBoundary" ? "async-boundary" : "computed";

const createRuntimeNodeId = (
    type: RuntimeNodeType,
    storeId: string,
    path: readonly RuntimePathSegment[] = []
): RuntimeNodeId => JSON.stringify([type, storeId, [...path]]);

const isRuntimeNodeType = (value: unknown): value is RuntimeNodeType =>
    value === "leaf"
    || value === "computed"
    || value === "async-boundary";

const parseRuntimeNodeId = (
    nodeId: RuntimeNodeId
): { type: RuntimeNodeType; storeId: string; path: RuntimePathSegment[] } | null => {
    try {
        const parsed = JSON.parse(nodeId) as unknown;
        if (!Array.isArray(parsed) || parsed.length !== 3) return null;
        const [type, storeId, path] = parsed;
        if (!isRuntimeNodeType(type) || typeof storeId !== "string" || !Array.isArray(path)) return null;
        if (path.some((segment) => typeof segment !== "string" && typeof segment !== "number")) return null;
        return {
            type,
            storeId,
            path: [...path],
        };
    } catch (_) {
        return null;
    }
};

const buildRuntimeNode = (
    type: RuntimeNodeType,
    storeId: string
): RuntimeGraphNode => ({
    id: createRuntimeNodeId(type, storeId),
    storeId,
    path: [],
    type,
});

const getDependencyNode = (name: string): RuntimeGraphNode => {
    const entry = getEntries()[name];
    if (!entry) return buildRuntimeNode("leaf", name);
    return buildRuntimeNode(getComputedNodeType(entry.classification), name);
};

const resolveComputedEntryName = (nodeId: RuntimeNodeId): string | null => {
    const entries = getEntries();
    if (entries[nodeId]) return nodeId;

    const parsed = parseRuntimeNodeId(nodeId);
    if (!parsed || parsed.path.length !== 0) return null;
    if (parsed.type !== "computed" && parsed.type !== "async-boundary") return null;

    const entry = entries[parsed.storeId];
    if (!entry) return null;
    return getComputedNodeType(entry.classification) === parsed.type
        ? parsed.storeId
        : null;
};

const buildComputedDescriptor = (name: string, entry: ComputedEntry): ComputedDescriptor => {
    const nodeType = getComputedNodeType(entry.classification);
    return {
        id: createRuntimeNodeId(nodeType, name),
        storeId: name,
        path: [],
        dependencies: entry.deps.map((dep) => getDependencyNode(dep).id),
        nodeType,
        classification: entry.classification,
        ...(entry.classification === "asyncBoundary" ? { asyncBoundary: true } : {}),
    };
};

export const getComputedDescriptor = (nodeId: RuntimeNodeId): ComputedDescriptor | null => {
    const name = resolveComputedEntryName(nodeId);
    if (!name) return null;
    const entry = getEntries()[name];
    if (!entry) return null;
    return buildComputedDescriptor(name, entry);
};

export const getTopoOrderedComputeds = (changedSources: string[]): string[] => {
    const entries = getEntries();
    const dependents = getDependents();

    const affected = new Set<string>();
    const queue = [...changedSources];

    while (queue.length > 0) {
        const current = queue.shift()!;
        const deps = dependents[current];
        if (!deps) continue;
        for (const dep of deps) {
            if (!affected.has(dep)) {
                affected.add(dep);
                queue.push(dep);
            }
        }
    }

    if (affected.size === 0) return [];

    const expandComputedDeps = (name: string): void => {
        const entry = entries[name];
        if (!entry) return;
        for (const dep of entry.deps) {
            if (!entries[dep]) continue;
            if (!affected.has(dep)) {
                affected.add(dep);
                expandComputedDeps(dep);
            }
        }
    };

    Array.from(affected).forEach((name) => expandComputedDeps(name));

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

setComputedOrderResolver(getTopoOrderedComputeds);

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
    const dependents = getDependents()[name];
    return {
        deps: [...entry.deps],
        dependents: dependents ? [...dependents] : [],
    };
};

export const getRuntimeComputedGraph = (): RuntimeGraph => {
    const entries = getEntries();
    const nodeMap = new Map<RuntimeNodeId, RuntimeGraphNode>();
    const edgeMap = new Map<string, RuntimeGraphEdge>();

    for (const [name, entry] of Object.entries(entries)) {
        const descriptor = buildComputedDescriptor(name, entry);
        nodeMap.set(descriptor.id, {
            id: descriptor.id,
            storeId: descriptor.storeId,
            path: descriptor.path,
            type: descriptor.nodeType,
        });

        entry.deps.forEach((dep, index) => {
            const depNode = getDependencyNode(dep);
            const edgeType: RuntimeEdgeType = getEntries()[dep]
                ? "computed-input"
                : "leaf-input";
            nodeMap.set(depNode.id, depNode);
            edgeMap.set(`${depNode.id}|${descriptor.id}|${index}`, {
                from: depNode.id,
                to: descriptor.id,
                type: edgeType,
            });
        });
    }

    const nodes = Array.from(nodeMap.values()).sort((left, right) =>
        left.id.localeCompare(right.id)
    );
    const edges = Array.from(edgeMap.values()).sort((left, right) => {
        const fromCompare = left.from.localeCompare(right.from);
        if (fromCompare !== 0) return fromCompare;
        const toCompare = left.to.localeCompare(right.to);
        if (toCompare !== 0) return toCompare;
        return left.type.localeCompare(right.type);
    });

    return {
        granularity: "store",
        nodes,
        edges,
    };
};

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
    Object.prototype.hasOwnProperty.call(value, key);

const readSnapshotValue = (snapshot: Record<string, unknown>, name: string): unknown =>
    hasOwn(snapshot, name) ? snapshot[name] : null;

type EvaluationState = {
    memo: Map<string, unknown>;
    stack: Set<string>;
};

const evaluateDeterministicComputed = (
    name: string,
    snapshot: Record<string, unknown>,
    state: EvaluationState
): unknown => {
    if (state.memo.has(name)) return state.memo.get(name);
    if (state.stack.has(name)) {
        throw new Error(`evaluateComputed("${name}") detected a computed cycle`);
    }

    const entry = getEntries()[name];
    if (!entry) {
        throw new Error(`evaluateComputed("${name}") could not find a computed descriptor`);
    }
    if (entry.classification !== "deterministic") {
        throw new Error(
            `evaluateComputed("${name}") only supports deterministic computed nodes`
        );
    }

    state.stack.add(name);
    try {
        const args = entry.deps.map((dep) => {
            const depEntry = getEntries()[dep];
            if (!depEntry) return readSnapshotValue(snapshot, dep);
            if (depEntry.classification !== "deterministic") {
                throw new Error(
                    `evaluateComputed("${name}") cannot cross non-deterministic dependency "${dep}"`
                );
            }
            return evaluateDeterministicComputed(dep, snapshot, state);
        });

        let next: unknown;
        try {
            next = entry.compute(...args);
        } catch (_) {
            next = readSnapshotValue(snapshot, name);
        }

        state.memo.set(name, next);
        return next;
    } finally {
        state.stack.delete(name);
    }
};

export const evaluateComputedFromSnapshot = (
    nodeId: RuntimeNodeId,
    snapshot: Record<string, unknown>
): unknown => {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        throw new Error(`evaluateComputed("${nodeId}") requires a snapshot record`);
    }
    const name = resolveComputedEntryName(nodeId);
    if (!name) {
        throw new Error(`evaluateComputed("${nodeId}") could not find a computed descriptor`);
    }
    return evaluateDeterministicComputed(name, snapshot, {
        memo: new Map<string, unknown>(),
        stack: new Set<string>(),
    });
};


