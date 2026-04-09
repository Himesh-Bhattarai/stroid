# 📈 Runtime Tools

> **Version:** 0.1.4 &nbsp;|&nbsp; **Last Updated:** 2026-04-01 &nbsp;|&nbsp; **Confidence:** ![HIGH](https://img.shields.io/badge/confidence-HIGH-brightgreen)
>
> *Derived from `src/runtime-tools/index.ts`*

---

## Overview

`stroid/runtime-tools` exposes runtime inspection helpers for stores, metrics, async activity, and computed graphs.

```ts
import {
  listStores,
  getStoreMeta,
  getInitialState,
  getMetrics,
  getSubscriberCount,
  getAsyncInflightCount,
  getPersistQueueDepth,
  findColdStores,
  getStoreHealth,
  getHydrationConsistency,
  getHydrationDriftEvents,
  getHydrationDriftMetrics,
  getComputedGraph,
  getRuntimeGraph,
  getComputedDeps,
  getComputedDescriptor,
  evaluateComputed,
} from "stroid/runtime-tools"
```

These helpers read from the active registry context. Outside request scope they fall back to the default registry.
Import only the helpers you use. Store inspection and computed graph helpers are grouped separately internally, but the published multi-entry build still shares runtime chunks, so the largest bundle wins are still elsewhere.

---

## Store Inspection

- `listStores(pattern?: string)` returns registered store names. A trailing `*` in `pattern` is treated as a prefix match.
- `getStoreMeta(name)` returns cloned store metadata or `null` when the store does not exist.
- `getInitialState()` returns a deep-cloned snapshot of registered initial states.

---

## Metrics

- `getMetrics(name)` returns per-store metrics or `null`.
- `getSubscriberCount(name)` returns the current subscriber count for that store.
- `getAsyncInflightCount(name)` returns the number of inflight async slots for that store.
- `getPersistQueueDepth(name)` returns the persist feature queue depth for that store, or `0` when persistence is not active.

```ts
import { getMetrics, getStoreHealth } from "stroid/runtime-tools"

const metrics = getMetrics("cart")
const health = getStoreHealth("cart")
```

---

## Health Reports

- `findColdStores({ unreadThresholdMs?, includeWriteOnly? })` returns stores classified as `cold`, `stale`, or optionally `write-only`.
- `getStoreHealth(name)` returns a single-store health report.
- `getStoreHealth()` returns an aggregate report for all stores plus async registry metrics.

---

## Hydration Drift

- `getHydrationConsistency(name?)` returns one store report, all reports, or `null` when a named store was not hydrated under a consistency contract.
- `getHydrationDriftEvents(limit?)` returns the most recent structured drift events.
- `getHydrationDriftMetrics()` returns counters plus boot-window state (`pendingWrites`, `bootWindowActive`, `bootWindowMode`, `bootWindowEndsAtMs`, `manualCloseAvailable`).
- Drift payload snapshots (`event.baseline`, `event.live`, `event.resolved`) are included in development, and omitted as `null` in production; hash fields remain available in both modes.

```ts
import {
  getHydrationConsistency,
  getHydrationDriftEvents,
  getHydrationDriftMetrics,
} from "stroid/runtime-tools"

const session = getHydrationConsistency("session")
const events = getHydrationDriftEvents(5)
const metrics = getHydrationDriftMetrics()
```

These helpers are intended for post-SSR debugging:

- which hydrated stores are `server_wins`, `client_wins`, `merge`, or `invalidate_and_refetch`
- when a store first diverged from the hydrated baseline
- whether writes were queued during the boot window
- whether the active gate is running in `timer` or `manual` mode
- which source triggered drift (`effect`, `storage`, `network`, `sync`)

---

## Computed Graph Helpers

- `getComputedGraph()` returns the full computed dependency graph.
- `getRuntimeGraph()` returns the runtime graph shape used by PSR tooling.
- `getComputedDeps(name)` returns dependency information for one computed store.
- `getComputedDescriptor(nodeId)` returns the computed descriptor for a runtime node ID.
- `evaluateComputed(nodeId, snapshot)` evaluates a computed node against a supplied snapshot.

```ts
import { getRuntimeGraph, getComputedDescriptor, evaluateComputed } from "stroid/runtime-tools"

const graph = getRuntimeGraph()
const node = graph.nodes[0]
const descriptor = getComputedDescriptor(node.id)
const value = evaluateComputed(node.id, { counter: 1 })
```
