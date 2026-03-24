# Native PSR Contract

> **Confidence: HIGH** - derived from `src/psr/index.ts`, `src/runtime-tools/index.ts`, the notification pipeline, and the built-package PSR contract tests.

---

## What `stroid/psr` Is For

`stroid/psr` is the public native contract for PSR-style preview, commit, batch, graph, and governance work.

Import from `stroid/psr` when you need:

- committed-only store snapshots
- committed-final per-store subscriptions
- serializable runtime patch execution
- runtime graph and computed descriptors
- deterministic computed evaluation from a snapshot
- timing/governance visibility
- store metadata that affects write visibility or downgrade decisions

```ts
import {
  getStoreSnapshot,
  subscribeStore,
  applyStorePatch,
  applyStorePatchesAtomic,
  getRuntimeGraph,
  getComputedDescriptor,
  evaluateComputed,
  getTimingContract,
  getStoreMeta,
} from "stroid/psr"
```

---

## Support Matrix

| PSR concern | Public Stroid contract |
| --- | --- |
| preview | `getStoreSnapshot()`, `getRuntimeGraph()`, `getComputedDescriptor()`, `evaluateComputed()` |
| commit | `applyStorePatch()` with serializable runtime patches |
| batch | `applyStorePatchesAtomic()` with rollback and `failedPatchId` reporting |
| onCommit | `subscribeStore()` committed-final notifications |
| propagation | `getRuntimeGraph()` plus `getComputedDescriptor()` |
| governance | `getTimingContract()` plus `getStoreMeta()` |
| mutation metadata | `getStoreMeta()` for store options/metrics, `getComputedDescriptor()` for computed classification |

If a runtime behavior is not exposed through these public PSR APIs, treat it as outside the full faithfulness contract and downgrade accordingly.

---

## Snapshot And Subscription Semantics

### `getStoreSnapshot(target)`

- Returns the committed store snapshot for a store name, `StoreDefinition`, or `StoreKey`.
- Does not expose in-progress transactional state.
- Does not increment read tracking counts.

### `getStoreSnapshotNoTrack(target)`

- Alias of the same committed-only read path.
- Kept for callers that want the no-track behavior to be explicit in code.

### `subscribeStore(target, listener)`

- Subscribes per store.
- Listener receives only committed snapshots.
- Notifications are queued after commit, not delivered synchronously inside the write.
- Flushes are scheduled on a microtask when available, so delivery is same-turn post-commit rather than inline mutation-time.
- `setStoreBatch(...)` and `applyStorePatchesAtomic(...)` only publish the final settled state.
- Computed stores notify after dependency writes settle in flush order.
- The returned unsubscribe function is idempotent.

---

## Patch Contract

All public PSR patches must stay serializable.

```ts
type RuntimePatch = {
  id: string
  store: string
  path: Array<string | number>
  op: "set" | "merge" | "delete" | "insert"
  value?: unknown
  meta: {
    timestamp: number
    source: "setStore" | "replaceStore" | "resetStore" | "hydrateStores"
    causedBy?: string[]
    isUnsafe?: boolean
    asyncBoundary?: boolean
  }
}
```

### Canonical Path Shape

- Path arrays are the canonical public shape.
- Object keys use string segments.
- Array positions should use non-negative integer segments.
- Numeric strings are accepted for array positions, but number segments are the canonical form.
- `[]` means the store root.
- Root `set` and root `merge` are supported.
- Root `delete` and root `insert` are rejected as `unsupported-path-shape`.

### Supported Ops

| Op | Supported | Notes |
| --- | --- | --- |
| `set` | yes | `[]` replaces the whole store; non-root writes use path semantics |
| `merge` | yes | root merge uses object merge; nested merge requires an object target |
| `delete` | yes | deletes object keys or removes an array element |
| `insert` | yes | inserts into arrays only |

### Stable Failure Reasons

Public PSR patch failures use stable reason strings:

- `invalid-args`: patch shape was invalid
- `unsupported-op`: operation is not part of the public native patch surface
- `unsupported-path-shape`: path shape is structurally unsupported for that operation
- `not-found`: target store does not exist
- `path`: path points at missing state
- `validate`: a commit-phase validation or feature hook failure rejected the batch

### `failedPatchId`

- `applyStorePatch()` includes `failedPatchId` when the failing patch has an ID.
- `applyStorePatchesAtomic()` reports the first failing patch ID.
- Atomic failures roll back all staged writes and do not leak partial notifications.

---

## Graph Identity And Node IDs

`getRuntimeGraph()` returns store-granularity graph data:

- stable `id`
- explicit `storeId`
- explicit `path`
- explicit `type`
- explicit edges

Runtime node IDs are currently JSON-encoded tuples:

```ts
JSON.stringify([nodeType, storeId, path])
```

Where:

- `nodeType` is `"leaf"`, `"computed"`, or `"async-boundary"`
- `storeId` is the store name
- `path` is the structured path array for that node

Consumers should treat `id` as an opaque stable identifier for caching and lookups. Use the explicit `storeId`, `path`, and `type` fields from graph nodes and computed descriptors instead of relying on string parsing in normal application logic.

`getComputedDescriptor(nodeIdOrStoreName)` and `getRuntimeGraph()` are expected to agree on node identity.

---

## Deterministic Computed Evaluation

`evaluateComputed(nodeId, snapshot)` is the public preview hook for deterministic computed nodes.

Contract:

- snapshot input must be a plain record
- evaluation is for deterministic computed nodes only
- opaque or `asyncBoundary` computed nodes throw instead of pretending to be preview-safe
- the same node ID and the same snapshot must produce the same result
- descriptor lookup and evaluation use the same runtime node identity

Recommended flow:

1. Read the runtime graph.
2. Resolve a computed descriptor.
3. Only evaluate when `classification === "deterministic"`.

---

## Timing, Governance, And Downgrade Rules

`getTimingContract(target?)` summarizes whether a store or graph slice can be governed natively without overstating certainty.

Fields:

| Field | Meaning |
| --- | --- |
| `simulationWindow` | when a faithful preview can be formed relative to visibility |
| `executionModel` | whether the target behaves as pure sync or crosses an async boundary |
| `effectScope` | whether runtime effects stay outside the write pipeline or participate in it |
| `governanceMode` | `"full-governor"`, `"bounded-governor"`, or `"observer"` |
| `mutationAuthority` | `"exclusive"` or `"shared"` |
| `causalityBoundary` | `"none"` or `"async-boundary"` |
| `reasons` | concrete downgrade explanations |

Today:

- `pre-commit + sync + full-governor + exclusive` means native governance is available.
- `async-boundary` downgrades to bounded governance.
- sync-enabled shared authority downgrades to observer mode.
- async persistence and async-boundary computed paths are surfaced in `reasons`.

---

## Mutation-Affecting Metadata

Use these public APIs to inspect runtime behavior that can affect whether a preview or commit claim remains faithful:

- `getStoreMeta(name)`:
  - normalized store options
  - validation configuration
  - lifecycle middleware hooks
  - persist/sync/devtools options
  - read/update/notify metrics
- `getComputedDescriptor(nodeIdOrStoreName)`:
  - computed classification
  - async-boundary classification
  - dependency identity
- `getTimingContract(target?)`:
  - governance mode
  - mutation authority
  - causality boundaries
  - downgrade reasons

If a store depends on behavior that is not visible through these public surfaces, treat that store as outside the strongest PSR faithfulness claim.

---

## Example

```ts
import {
  applyStorePatchesAtomic,
  evaluateComputed,
  getComputedDescriptor,
  getStoreSnapshot,
  getTimingContract,
} from "stroid/psr"

const result = applyStorePatchesAtomic([
  {
    id: "cart-insert",
    store: "cart",
    path: ["items", 1],
    op: "insert",
    value: { sku: "b", qty: 1 },
    meta: { timestamp: Date.now(), source: "setStore" },
  },
])

if (!result.ok) {
  console.error(result.reason, result.failedPatchId)
}

const contract = getTimingContract("cartTotal")
const descriptor = getComputedDescriptor("cartTotal")

if (descriptor?.classification === "deterministic" && contract.governanceMode !== "observer") {
  const preview = evaluateComputed(descriptor.id, {
    cart: getStoreSnapshot("cart"),
    cartTotal: 0,
  })
  console.log(preview)
}
```
