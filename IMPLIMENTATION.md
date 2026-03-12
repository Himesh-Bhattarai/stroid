I have now read every relevant file. Here is the complete implementation guide.

createComputed — Complete Implementation Guide

Overview Of What Gets Built
src/
  computed-graph.ts      ← NEW — graph registry, cycle detection, topo sort
  computed.ts            ← NEW — createComputed, invalidateComputed public API
  computed-entry.ts      ← NEW — subpath export barrel

tsup.config.ts           ← ADD computed entry point
src/index.ts             ← ADD computed exports
src/store-registry.ts    ← ADD computedEntries to StoreRegistry shape
src/store-notify.ts      ← MODIFY buildPendingOrder to inject topo-sorted computed
src/internals/store-admin.ts  ← MODIFY deleteExistingStore to clean computed
src/runtime-tools.ts     ← ADD getComputedGraph, getComputedDeps
tests/computed.test.ts   ← NEW — full test suite

Step 1 — Extend StoreRegistry in store-registry.ts
The registry is the single source of truth for all store data. Computed metadata belongs here so it survives scope switches correctly.
Find the StoreRegistry type and add two fields:
typescriptexport type ComputedEntry = {
    deps: string[]           // source store names this computed depends on
    compute: (...args: unknown[]) => unknown  // the user's function
    stale: boolean           // true = needs recomputation on next read
}

export type StoreRegistry = {
    stores: Record<string, RegistryStoreValue>
    subscribers: Record<string, Set<RegistrySubscriber>>
    initialStates: Record<string, RegistryStoreValue>
    initialFactories: Record<string, (() => RegistryStoreValue) | undefined>
    metaEntries: Record<string, StoreFeatureMeta>
    snapshotCache: Record<string, RegistrySnapshotEntry>
    featureRuntimes: Map<FeatureName, StoreFeatureRuntime>
    deletingStores: Set<string>
    // ADD THESE TWO
    computedEntries: Record<string, ComputedEntry>
    computedDependents: Record<string, string[]>  // sourceName → [computedNames...]
}
In getStoreRegistry initialise them:
typescriptconst created: StoreRegistry = {
    // ...existing fields...
    computedEntries: Object.create(null),
    computedDependents: Object.create(null),
}
In clearStoreRegistries clear them:
typescriptObject.keys(registry.computedEntries).forEach(k => delete registry.computedEntries[k])
Object.keys(registry.computedDependents).forEach(k => delete registry.computedDependents[k])

Step 2 — Create src/computed-graph.ts
This file owns the graph logic. It has no React, no async, no features. Pure graph operations only.
typescript/**
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
    defaultRegistryScope,
    type ComputedEntry,
} from "./store-registry.js"
import { warn, error } from "./utils.js"

// ─── Registry access ────────────────────────────────────────────────────────

const getEntries = () =>
    getStoreRegistry(defaultRegistryScope).computedEntries

const getDependents = () =>
    getStoreRegistry(defaultRegistryScope).computedDependents

// ─── Cycle detection ────────────────────────────────────────────────────────

/**
 * Detects whether adding `name` with `deps` would create a cycle.
 * Returns the cycle path as a string if found, null if clean.
 *
 * Uses DFS from each dep, walking existing computedEntries.
 * If we can reach `name` from any dep, a cycle exists.
 */
export const detectCycle = (
    name: string,
    deps: string[]
): string | null => {
    const entries = getEntries()

    const visited = new Set<string>()
    const path: string[] = []

    const dfs = (current: string): boolean => {
        if (current === name) return true   // reached origin — cycle
        if (visited.has(current)) return false
        visited.add(current)
        path.push(current)

        const currentDeps = entries[current]?.deps ?? []
        for (const dep of currentDeps) {
            if (dfs(dep)) return true
        }

        path.pop()
        return false
    }

    for (const dep of deps) {
        path.length = 0
        visited.clear()
        if (dfs(dep)) {
            return [name, ...path, name].join(" → ")
        }
    }

    return null
}

// ─── Graph mutations ────────────────────────────────────────────────────────

export const registerComputed = (
    name: string,
    deps: string[],
    compute: (...args: unknown[]) => unknown
): boolean => {
    const cycleTrace = detectCycle(name, deps)
    if (cycleTrace) {
        error(
            `[stroid] createComputed("${name}") rejected: ` +
            `circular dependency detected → ${cycleTrace}\n` +
            `Define relationships without cycles.`
        )
        return false
    }

    const entries = getEntries()
    const dependents = getDependents()

    // Remove old dependent links if reregistering
    if (entries[name]) {
        removeComputedDependentLinks(name, entries[name].deps)
    }

    entries[name] = { deps, compute, stale: true }

    // Register forward links: dep → [computed, ...]
    for (const dep of deps) {
        if (!dependents[dep]) dependents[dep] = []
        if (!dependents[dep].includes(name)) {
            dependents[dep].push(name)
        }
    }

    return true
}

export const unregisterComputed = (name: string): void => {
    const entries = getEntries()
    const entry = entries[name]
    if (!entry) return

    removeComputedDependentLinks(name, entry.deps)
    delete entries[name]
}

const removeComputedDependentLinks = (name: string, deps: string[]): void => {
    const dependents = getDependents()
    for (const dep of deps) {
        if (!dependents[dep]) continue
        dependents[dep] = dependents[dep].filter(d => d !== name)
        if (dependents[dep].length === 0) delete dependents[dep]
    }
}

export const markStale = (name: string): void => {
    const entries = getEntries()
    if (entries[name]) entries[name].stale = true
}

export const isComputed = (name: string): boolean =>
    Object.prototype.hasOwnProperty.call(getEntries(), name)

export const getComputedEntry = (name: string): ComputedEntry | undefined =>
    getEntries()[name]

// ─── Topological ordering ────────────────────────────────────────────────────

/**
 * Given a set of source store names that just changed,
 * returns all affected computed store names in topological order.
 *
 * "Topological order" here means: if computedA depends on computedB,
 * computedB appears before computedA in the result.
 *
 * Algorithm: BFS from changed sources through dependents graph,
 * then Kahn's algorithm on the collected subgraph.
 */
export const getTopoOrderedComputeds = (changedSources: string[]): string[] => {
    const entries = getEntries()
    const dependents = getDependents()

    // Phase 1 — collect all affected computed names (BFS)
    const affected = new Set<string>()
    const queue = [...changedSources]

    while (queue.length > 0) {
        const current = queue.shift()!
        const deps = dependents[current] ?? []
        for (const dep of deps) {
            if (!affected.has(dep)) {
                affected.add(dep)
                queue.push(dep)   // walk further — dep may have its own dependents
            }
        }
    }

    if (affected.size === 0) return []

    // Phase 2 — Kahn's topo sort on affected subgraph only
    // in-degree = number of deps that are ALSO in affected set
    const inDegree = new Map<string, number>()
    const adjList = new Map<string, string[]>()  // dep → [computeds that depend on dep]

    for (const name of affected) {
        const entry = entries[name]
        if (!entry) continue

        let degree = 0
        for (const dep of entry.deps) {
            if (affected.has(dep)) {
                degree++
                if (!adjList.has(dep)) adjList.set(dep, [])
                adjList.get(dep)!.push(name)
            }
        }
        inDegree.set(name, degree)
    }

    // Start with nodes that have no in-affected-set dependencies
    const ready: string[] = []
    for (const [name, degree] of inDegree) {
        if (degree === 0) ready.push(name)
    }
    // Sort ready queue deterministically by name for stable ordering
    ready.sort()

    const sorted: string[] = []
    while (ready.length > 0) {
        const name = ready.shift()!
        sorted.push(name)

        const children = adjList.get(name) ?? []
        for (const child of children) {
            const newDegree = (inDegree.get(child) ?? 1) - 1
            inDegree.set(child, newDegree)
            if (newDegree === 0) {
                // Insert in sorted position for determinism
                const insertAt = ready.findIndex(n => n > child)
                if (insertAt === -1) ready.push(child)
                else ready.splice(insertAt, 0, child)
            }
        }
    }

    return sorted
}

// ─── Diagnostics ────────────────────────────────────────────────────────────

export const getFullComputedGraph = (): {
    nodes: string[]
    edges: Array<{ from: string; to: string }>
    dependencies: Record<string, string[]>
    dependents: Record<string, string[]>
} => {
    const entries = getEntries()
    const dependents = getDependents()

    const nodes = Object.keys(entries)
    const edges: Array<{ from: string; to: string }> = []

    for (const [name, entry] of Object.entries(entries)) {
        for (const dep of entry.deps) {
            edges.push({ from: dep, to: name })
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
    }
}

export const getComputedDepsFor = (name: string): {
    deps: string[]
    dependents: string[]
} | null => {
    const entry = getEntries()[name]
    if (!entry) return null
    return {
        deps: [...entry.deps],
        dependents: [...(getDependents()[name] ?? [])],
    }
}

Step 3 — Create src/computed.ts
This is the public API file. It wires the graph engine to the store system.
typescript/**
 * @module computed
 *
 * LAYER: Public Computed API
 * OWNS:  createComputed, invalidateComputed
 *
 * DOES NOT KNOW about: React, async, persist, sync, devtools.
 *
 * Consumers: index.ts, computed-entry.ts
 */

import { createStore, setStore, getStore, hasStore } from "./store.js"
import { subscribeStore } from "./store-notify.js"
import {
    registerComputed,
    unregisterComputed,
    markStale,
    getComputedEntry,
    isComputed,
} from "./computed-graph.js"
import { warn, isDev } from "./utils.js"
import type { StoreDefinition } from "./store-lifecycle.js"

export type ComputedOptions = {
    /**
     * If true, the computed store is deleted when all source stores are deleted.
     * Default: false
     */
    autoDispose?: boolean
    /**
     * Called when the compute function throws.
     */
    onError?: (err: unknown) => void
}

/**
 * Creates a derived store whose value is automatically computed
 * from one or more source stores.
 *
 * The compute function runs synchronously. It must be pure —
 * no side effects, no async, no store writes.
 *
 * Cycle detection runs at creation time. If a cycle is detected
 * the store is NOT created and undefined is returned.
 *
 * @example
 * createStore("firstName", "John")
 * createStore("lastName", "Doe")
 *
 * createComputed(
 *   "fullName",
 *   ["firstName", "lastName"],
 *   (first, last) => `${first} ${last}`
 * )
 *
 * getStore("fullName")  // "John Doe"
 * setStore("firstName", "Jane")
 * getStore("fullName")  // "Jane Doe"
 */
export const createComputed = <TResult = unknown>(
    name: string,
    deps: string[],
    compute: (...args: unknown[]) => TResult,
    options: ComputedOptions = {}
): StoreDefinition<string, TResult> | undefined => {

    if (!name || typeof name !== "string") {
        warn(`createComputed requires a store name as first argument`)
        return undefined
    }

    if (!Array.isArray(deps) || deps.length === 0) {
        warn(`createComputed("${name}") requires at least one dependency`)
        return undefined
    }

    if (typeof compute !== "function") {
        warn(`createComputed("${name}") requires a compute function as third argument`)
        return undefined
    }

    // Register in graph — this runs cycle detection
    const registered = registerComputed(name, deps, compute as (...args: unknown[]) => unknown)
    if (!registered) return undefined  // cycle detected, error already shown

    // Compute initial value
    const initial = _runCompute(name, deps, compute as (...args: unknown[]) => unknown, options.onError)

    // Create the backing store with initial computed value
    // Mark it read-only in dev mode via naming convention
    if (!hasStore(name)) {
        createStore(name, initial as TResult)
    } else {
        // Store already exists (e.g. hot reload) — just update it
        setStore(name, initial as any)
    }

    // Subscribe to each dependency
    const unsubscribers: Array<() => void> = []

    for (const dep of deps) {
        const unsub = subscribeStore(dep, () => {
            _recomputeAndFlush(name, deps, compute as (...args: unknown[]) => unknown, options.onError)
        })
        unsubscribers.push(unsub)
    }

    // Store cleanup function so deleteComputed can tear it down
    _computedCleanups.set(name, () => {
        unsubscribers.forEach(fn => fn())
        unregisterComputed(name)
    })

    if (isDev()) {
        console.log(`[stroid] computed store "${name}" created, deps: [${deps.join(", ")}]`)
    }

    return { name } as StoreDefinition<string, TResult>
}

// ─── Internal recompute ──────────────────────────────────────────────────────

const _computedCleanups = new Map<string, () => void>()

const _runCompute = (
    name: string,
    deps: string[],
    compute: (...args: unknown[]) => unknown,
    onError?: (err: unknown) => void
): unknown => {
    const args = deps.map(dep => getStore(dep))

    try {
        return compute(...args)
    } catch (err) {
        warn(`createComputed("${name}") compute function threw: ${(err as any)?.message ?? err}`)
        onError?.(err)
        // Return current value if available, null otherwise
        return hasStore(name) ? getStore(name) : null
    }
}

const _recomputeAndFlush = (
    name: string,
    deps: string[],
    compute: (...args: unknown[]) => unknown,
    onError?: (err: unknown) => void
): void => {
    const entry = getComputedEntry(name)
    if (!entry) return

    const next = _runCompute(name, deps, compute, onError)

    // Only write if value actually changed — prevents unnecessary notifications
    const current = getStore(name)
    if (Object.is(next, current)) return

    setStore(name, next as any)
    markStale(name)
}

// ─── Public utilities ────────────────────────────────────────────────────────

/**
 * Forces a computed store to recompute immediately.
 * Use when the compute function depends on something outside Stroid
 * (e.g. Date.now(), Math.random(), an external service).
 */
export const invalidateComputed = (name: string): void => {
    const entry = getComputedEntry(name)
    if (!entry) {
        warn(`invalidateComputed("${name}") — "${name}" is not a computed store`)
        return
    }
    markStale(name)
    _recomputeAndFlush(name, entry.deps, entry.compute)
}

/**
 * Removes a computed store and its subscriptions.
 * The backing store remains — only the reactive relationship is removed.
 * To also remove the backing store, call deleteStore(name) after.
 */
export const deleteComputed = (name: string): void => {
    const cleanup = _computedCleanups.get(name)
    if (!cleanup) {
        if (isDev()) warn(`deleteComputed("${name}") — not found`)
        return
    }
    cleanup()
    _computedCleanups.delete(name)
}

export const isComputedStore = (name: string): boolean => isComputed(name)

export const _resetComputedForTests = (): void => {
    _computedCleanups.forEach(fn => fn())
    _computedCleanups.clear()
}

Step 4 — Modify store-notify.ts — Topo Ordering In The Flush
Find buildPendingOrder and modify it to inject computed stores in topo order after their sources. Add this import at the top:
typescriptimport { getTopoOrderedComputeds } from "./computed-graph.js"
Then in buildPendingOrder, after the orderedNames is populated, add computed propagation before returning:
typescriptconst buildPendingOrder = (): { names: string[]; sliceSize: number; chunkDelayMs: number; runInline: boolean } => {
    pendingBuffer.length = 0
    for (const name of pendingNotifications) pendingBuffer.push(name)
    pendingNotifications.clear()

    // ... existing priority sort logic unchanged ...

    // ADD THIS BLOCK — inject topo-sorted computed stores
    // after their sources in the flush order
    const computedOrder = getTopoOrderedComputeds(orderedNames)
    for (const computedName of computedOrder) {
        if (!orderedNames.includes(computedName)) {
            orderedNames.push(computedName)
        }
    }
    // END ADD

    const sliceSize = ...  // rest unchanged
This is the only change to store-notify.ts. The computed stores are already updated by their subscription callbacks before the flush runs — the topo ordering just ensures subscribers receive notifications in correct dependency order.

Step 5 — Modify store-admin.ts — Cleanup On Delete
In deleteExistingStore, after the delete snapshotCache[name] line, add:
typescript// Clean up computed relationships if this store was a computed store
import { unregisterComputed, isComputed } from "../computed-graph.js"

// inside deleteExistingStore, after snapshotCache deletion:
if (isComputed(name)) {
    unregisterComputed(name)
}

// Remove this store as a dependency source from computed dependents
// (computed stores that depended on this source become stale)
const dependents = registry.computedDependents
const affected = dependents[name] ?? []
for (const computedName of affected) {
    warn(
        `[stroid] source store "${name}" was deleted. ` +
        `Computed store "${computedName}" depends on it and will return stale data. ` +
        `Call deleteComputed("${computedName}") to clean up.`
    )
}

Step 6 — Add To runtime-tools.ts
typescriptimport {
    getFullComputedGraph,
    getComputedDepsFor,
} from "./computed-graph.js"

export const getComputedGraph = () => getFullComputedGraph()

export const getComputedDeps = (name: string) => getComputedDepsFor(name)

Step 7 — Create src/computed-entry.ts
typescriptexport {
    createComputed,
    invalidateComputed,
    deleteComputed,
    isComputedStore,
    _resetComputedForTests,
} from "./computed.js"

export {
    getFullComputedGraph,
    getComputedDepsFor,
} from "./computed-graph.js"

Step 8 — Wire Into Build
In tsup.config.ts add:
typescriptentry: {
    // ...existing entries...
    computed: "src/computed-entry.ts",
}
In src/index.ts add:
typescriptexport {
    createComputed,
    invalidateComputed,
    deleteComputed,
    isComputedStore,
} from "./computed.js"

Step 9 — Test File tests/computed.test.ts
typescriptimport test from "node:test"
import assert from "node:assert"
import { createStore, setStore, getStore, clearAllStores } from "../src/store.js"
import {
    createComputed,
    invalidateComputed,
    deleteComputed,
    _resetComputedForTests,
} from "../src/computed.js"
import { detectCycle, getTopoOrderedComputeds } from "../src/computed-graph.js"

const wait = (ms = 0) => new Promise(r => setTimeout(r, ms))

test.beforeEach(() => {
    clearAllStores()
    _resetComputedForTests()
})

// ─── Basic derivation ─────────────────────────────────────────────────────

test("derives value from single source", async () => {
    createStore("count", 0)
    createComputed("doubled", ["count"], (n) => (n as number) * 2)

    assert.strictEqual(getStore("doubled"), 0)

    setStore("count", 5)
    await wait()

    assert.strictEqual(getStore("doubled"), 10)
})

test("derives from multiple sources", async () => {
    createStore("firstName", "John")
    createStore("lastName", "Doe")
    createComputed("fullName", ["firstName", "lastName"],
        (f, l) => `${f} ${l}`)

    assert.strictEqual(getStore("fullName"), "John Doe")

    setStore("firstName", "Jane")
    await wait()

    assert.strictEqual(getStore("fullName"), "Jane Doe")
})

test("does not notify if computed value unchanged", async () => {
    createStore("x", 1)
    createComputed("sign", ["x"], (n) => (n as number) > 0 ? "positive" : "non-positive")

    let notifyCount = 0
    const { subscribeStore } = await import("../src/store-notify.js")
    subscribeStore("sign", () => notifyCount++)

    setStore("x", 2)   // still positive
    await wait()
    assert.strictEqual(notifyCount, 0)

    setStore("x", -1)  // changes to non-positive
    await wait()
    assert.strictEqual(notifyCount, 1)
})

// ─── Cycle detection ──────────────────────────────────────────────────────

test("rejects direct cycle", () => {
    createStore("a", 1)
    createComputed("b", ["a"], (x) => x)
    const result = createComputed("a", ["b"], (x) => x)  // a → b → a
    assert.strictEqual(result, undefined)
    // original "a" store still intact
    assert.strictEqual(getStore("a"), 1)
})

test("rejects indirect cycle", () => {
    createStore("x", 0)
    createComputed("y", ["x"], (v) => v)
    createComputed("z", ["y"], (v) => v)
    const result = createComputed("x", ["z"], (v) => v)  // x → y → z → x
    assert.strictEqual(result, undefined)
})

test("detectCycle returns path string on cycle", () => {
    // manually build scenario
    const { registerComputed } = await import("../src/computed-graph.js")
    registerComputed("m", ["n"], (v) => v)
    const trace = detectCycle("n", ["m"])
    assert.ok(typeof trace === "string")
    assert.ok(trace.includes("→"))
})

// ─── Topo ordering ────────────────────────────────────────────────────────

test("topo order: shallow dependency resolved first", () => {
    createStore("src", 0)
    createComputed("level1", ["src"], (v) => v)
    createComputed("level2", ["level1"], (v) => v)

    const order = getTopoOrderedComputeds(["src"])
    assert.deepStrictEqual(order, ["level1", "level2"])
})

test("topo order: diamond dependency resolved correctly", () => {
    // src → left, src → right, both → combined
    createStore("src", 0)
    createComputed("left", ["src"], (v) => v)
    createComputed("right", ["src"], (v) => v)
    createComputed("combined", ["left", "right"], (l, r) => [l, r])

    const order = getTopoOrderedComputeds(["src"])
    const combinedIdx = order.indexOf("combined")
    const leftIdx = order.indexOf("left")
    const rightIdx = order.indexOf("right")

    assert.ok(leftIdx < combinedIdx)
    assert.ok(rightIdx < combinedIdx)
})

// ─── invalidateComputed ───────────────────────────────────────────────────

test("invalidateComputed forces recomputation", async () => {
    createStore("base", 1)
    let externalValue = 10
    createComputed("withExternal", ["base"],
        (b) => (b as number) + externalValue)

    assert.strictEqual(getStore("withExternal"), 11)

    externalValue = 20
    invalidateComputed("withExternal")
    await wait()

    assert.strictEqual(getStore("withExternal"), 21)
})

// ─── deleteComputed ───────────────────────────────────────────────────────

test("deleteComputed stops reactivity", async () => {
    createStore("src", 0)
    createComputed("derived", ["src"], (v) => (v as number) * 2)

    setStore("src", 5)
    await wait()
    assert.strictEqual(getStore("derived"), 10)

    deleteComputed("derived")

    setStore("src", 99)
    await wait()
    // derived store still exists but no longer updates
    assert.strictEqual(getStore("derived"), 10)
})

// ─── Error handling ───────────────────────────────────────────────────────

test("compute function throwing does not crash — returns previous value", async () => {
    createStore("n", 2)
    createComputed("safe", ["n"], (v) => {
        if ((v as number) > 5) throw new Error("too big")
        return (v as number) * 2
    })

    assert.strictEqual(getStore("safe"), 4)

    setStore("n", 10)   // will throw
    await wait()

    // falls back to previous value
    assert.strictEqual(getStore("safe"), 4)
})

What Each File Owns — Summary
FileOwnsDoes Not Know Aboutcomputed-graph.tscycle detection, topo sort, graph CRUDReact, store writes, asynccomputed.tspublic API, subscriptions, recomputegraph internals, notify internalsstore-notify.tsflush ordering with topo injectionwhat computed stores dostore-admin.tscleanup on deletecomputed logicruntime-tools.tsdiagnostic read accesscomputed write logic
The layer discipline matches every other module in Stroid. Each file knows exactly one thing. Nothing in core changes shape. The computed system plugs in through the existing subscription mechanism and the existing flush ordering mechanism — it does not need a new notification path.