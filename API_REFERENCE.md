# API Reference

> **Confidence: HIGH** — all signatures, types, and behaviors are derived directly from source code.  
> Where docs and code conflict, this document follows the code.

---

## Table of Contents

1. [Core — `stroid`](#core--stroid)
2. [Minimal Core — `stroid/core`](#minimal-core--stroidcore)
3. [React — `stroid/react`](#react--stroidreact)
4. [Async — `stroid/async`](#async--stroidasync)
5. [Computed — `stroid/computed`](#computed--stroidcomputed)
6. [Selectors — `stroid/selectors`](#selectors--stroidselectors)
7. [Server — `stroid/server`](#server--stroidserver)
8. [Helpers — `stroid/helpers`](#helpers--stroidhelpers)
9. [Testing — `stroid/testing`](#testing--stroidtesting)
10. [Runtime Tools — `stroid/runtime-tools`](#runtime-tools--stroidruntime-tools)
11. [Runtime Admin — `stroid/runtime-admin`](#runtime-admin--stroidruntime-admin)
12. [Devtools — `stroid/devtools`](#devtools--stroiddevtools)
13. [Config — `stroid` / `stroid/config`](#config)
14. [Feature Plugin API — `stroid/feature`](#feature-plugin-api--stroidfeature)
15. [Types](#types)

---

## Core — `stroid`

### `createStore(name, initialState, options?)`

Creates a named store.

**Confidence: HIGH**

```ts
function createStore<Name extends string, State>(
  name: Name,
  initialState: State | (() => State),  // factory only when lazy: true
  options?: StoreOptions<State>
): StoreDefinition<Name, State> | undefined
```

- Returns `undefined` (not throws) on failure: duplicate name, invalid data, or server-blocked creation.
- Use `createStoreStrict` to get an error thrown instead.
- Calling `createStore` for an already-existing name is a no-op that returns `{ name }`. The existing state is preserved.
- Cannot be called inside `setStoreBatch`.

**Server behavior:** In production server environments, `createStore` is blocked by default to prevent cross-request memory leaks. Use `createStoreForRequest(...)` from `stroid/server` instead, or pass `scope: "global"` to opt in.

---

### `createStoreStrict(name, initialState, options?)`

Same as `createStore` but throws synchronously on failure.

```ts
function createStoreStrict<Name extends string, State>(
  name: Name,
  initialState: State,
  options?: StoreOptions<State>
): StoreDefinition<Name, State>  // never undefined
```

---

### `setStore(name, update)`

Shallow-merges a partial object into an object store.

```ts
setStore("user", { name: "Kai" })
// equivalent: { ...prev, name: "Kai" }
```

> Only works when the store holds an object. Errors if the store is non-object.

### `setStore(name, path, value)`

Writes a value at a dot-path or array path.

```ts
setStore("user", "profile.name", "Kai")
setStore("user", ["profile", "name"], "Kai")
```

### `setStore(name, draft => { })`

Mutates a clone of the store via a function. If `configureStroid({ mutatorProduce })` is set (e.g., Immer's `produce`), the mutator receives a draft proxy with structural sharing. Otherwise, a deep clone is passed.

```ts
setStore("cart", draft => { draft.items.push(item) })
```

> Returning a value from the mutator replaces the entire store. In strict mode (`strictMutatorReturns: true`, the default), returning a value is an error.

**Returns:** `WriteResult = { ok: true } | { ok: false, reason: string }`

---

### `replaceStore(name, value)`

Replaces the entire store value. Does not merge — overwrites.

```ts
replaceStore("user", { name: "Ava", role: "admin" })
```

**Returns:** `WriteResult`

> **Note:** This is a top-level function, not a method on `setStore`. The README's reference to `setStore.replace` is incorrect — `replaceStore` is a separate export.

---

### `getStore(name, path?)`

Reads a store value or a nested path.

```ts
const user = getStore("user")           // entire store
const name = getStore("user", "profile.name")
```

Returns `null` if the store does not exist or the path is missing.

---

### `deleteStore(name)`

Removes a store from the registry. Triggers `beforeStoreDelete` feature hooks (persist cleanup, sync unsub, async cancel). Cannot be called inside `setStoreBatch`.

```ts
deleteStore("user")
deleteStore(userStoreDefinition)
```

---

### `resetStore(name)`

Restores a store to the initial value it had when `createStore` was called.

```ts
resetStore("user")        // → { ok: true } or { ok: false, reason: ... }
```

Cannot reset a lazy store before it has been materialized (`getStore` triggers materialization). Returns `{ ok: false, reason: "lazy-uninitialized" }` if attempted.

---

### `hasStore(name)`

Returns `true` if the store exists in the active registry.

---

### `setStoreBatch(fn)`

Executes `fn` with all writes staged. All writes commit atomically when `fn` returns. If `fn` throws or any write fails, all staged writes are discarded.

```ts
setStoreBatch(() => {
  setStore("cart",  { items: [] })
  setStore("ui",    "loading", false)
  setStore("order", { id: "x", status: "placed" })
  // if any write above fails → all three roll back
})
```

> `createStore`, `deleteStore`, and `hydrateStores` are forbidden inside a batch.

---

### `hydrateStores(snapshot, options?, trust)`

Rehydrates stores from a plain-object snapshot. The `trust` argument is **required**.

```ts
hydrateStores(
  window.__STROID_STATE__,
  {},
  { allowTrusted: true }
)
```

**Trust options:**
- `allowTrusted: true` — accept the snapshot unconditionally.
- `allowHydration: true` — alias for `allowTrusted`.
- `validate: (snapshot) => boolean` — custom validator; if it throws, the error routes via `onValidationError` in production and re-throws in dev.
- `onValidationError: (err, snapshot) => boolean` — return `true` to continue hydration despite a validation error.

**Returns:** `HydrationResult` — `{ hydrated: string[], created: string[], failed: FailEntry[], blocked?: { reason } }`

---

### `store(name)` / `namespace(prefix)`

Typed store handle factory. Returns a `StoreDefinition` that carries compile-time type information.

```ts
import { store } from "stroid"

const userStore = store<"user", { name: string; role: string }>("user")
setStore(userStore, draft => { draft.name = "Kai" })
getStore(userStore, "name")  // typed as string
```

`namespace(prefix)` returns a handle factory that prepends the prefix to all store names.

---

## Minimal Core — `stroid/core`

**Confidence: HIGH** — verified from `src/core/index.ts`.

Exports only the six primitive operations:

```ts
import {
  createStore,
  setStore,
  resetStore,
  deleteStore,
  getStore,
  hasStore
} from "stroid/core"
```

> `setStoreBatch`, `hydrateStores`, `replaceStore`, and computed APIs are **not** exported from `stroid/core`. Import those from `stroid`.

---

## React — `stroid/react`

All hooks use `useSyncExternalStore` for concurrent-safe subscriptions.

### `useStore(name, selectorOrPath?, equalityFn?)`

```ts
// Full store
const user = useStore("user")

// Path
const name = useStore("user", "profile.name")

// Selector (re-renders only when return value changes)
const role = useStore("user", s => s.role)

// Custom equality
const ids = useStore("cart", s => s.items.map(i => i.id), shallowEqual)
```

Returns `null` if the store does not exist. Warns once in dev when called without a selector on stores that update frequently.

---

### `useSelector(name, selectorFn, equalityFn?)`

Like `useStore` with a selector, but uses `shallowEqual` as the default equality function (vs `Object.is` in `useStore`).

```ts
const total = useSelector("cart", s => s.items.reduce((a, i) => a + i.price, 0))
```

---

### `useStoreField(name, field)`

Convenience alias for `useStore(name, field)`.

```ts
const name = useStoreField("user", "profile.name")
```

---

### `useStoreStatic(name, path?)`

Reads a store value **without** subscribing. The component does not re-render when the store changes.

```ts
const config = useStoreStatic("appConfig")
```

---

### `useAsyncStore(name)`

Reads an async store and returns a typed snapshot with `isEmpty`.

```ts
const { data, loading, error, status, isEmpty, revalidating } = useAsyncStore("user")
```

**Return type:**
```ts
type AsyncStoreSnapshot<T> = {
  data: T | null
  loading: boolean
  revalidating: boolean
  error: string | null
  status: "idle" | "loading" | "success" | "error" | "aborted"
  isEmpty: boolean  // data == null && !loading && !error
}
```

---

### `useFormStore(name, field)`

Returns `{ value, onChange }` for binding to form inputs.

```ts
const { value, onChange } = useFormStore("profile", "name")
return <input value={value ?? ""} onChange={onChange} />
```

`onChange` handles both React synthetic events and raw values.

---

### `useAsyncStoreSuspense(name, input?, options?)`

Suspense-compatible async hook. Throws a promise while loading; resolves to the `data` field on success.

```ts
// In a React.Suspense boundary:
const userData = useAsyncStoreSuspense("user", "/api/user")
```

---

### `RegistryScope`

Context provider for injecting a request-scoped registry into a React tree (SSR use case).

```tsx
<RegistryScope value={requestRegistry}>
  <App />
</RegistryScope>
```

---

## Async — `stroid/async`

### `fetchStore(name, urlOrRequest, options?)`

Fetches data and writes async state into a named store.

```ts
fetchStore("user", "/api/user", {
  ttl:                  30_000,
  staleWhileRevalidate: true,
  dedupe:               true,
  retry:                3,
  retryDelay:           400,
  signal:               controller.signal,
  transform:            res => res.data,
  onSuccess:            data => console.log(data),
  onError:              err  => Sentry.captureException(err),
})
```

The store must exist before `fetchStore` is called (unless `configureStroid({ asyncAutoCreate: true })` is enabled).

`urlOrRequest` may be a URL string, a Promise, or a `() => string | Promise`.

The store value is updated to the `AsyncStateSnapshot` shape: `{ data, loading, error, status, revalidating }`.

---

### `refetchStore(name, options?)`

Triggers a re-fetch, bypassing TTL cache.

---

### `enableRevalidateOnFocus(name, input, options?)`

Registers a window `focus` / `online` listener that calls `refetchStore` when the page regains visibility. Automatically cleaned up when the store is deleted.

---

### `getAsyncMetrics()`

Returns aggregate async metrics (total requests, inflight counts, etc.) for the active registry.

---

## Computed — `stroid/computed`

### `createComputed(name, deps, compute, options?)`

Creates a store whose value is derived from one or more dependency stores.

```ts
createComputed(
  "cartTotal",
  ["cart", "discount"],
  (cart, discount) => cart.items.reduce((s, i) => s + i.price, 0) * (1 - discount.pct / 100)
)
```

- Dependencies may be store names (strings) or `StoreDefinition` / `StoreKey` handles.
- Missing deps receive `null` until the dependency store is created.
- Circular dependencies are detected at registration time.
- Re-runs when any dependency changes; skips notification if the result is `Object.is` equal to the previous value.

**Options:**
- `autoDispose?: boolean` — remove computed store when all deps are deleted.
- `onError?: (err) => void` — called when the compute function throws.

---

### `invalidateComputed(name)`

Forces an immediate recomputation.

---

### `deleteComputed(name)`

Unsubscribes from all dependency stores and removes the computed store.

---

### `isComputedStore(name)`

Returns `true` if the name belongs to a computed store.

---

## Selectors — `stroid/selectors`

### `createSelector(storeName, selectorFn)`

Returns a memoized selector function. Uses Proxy-based dependency tracking — only re-runs when the accessed fields change.

```ts
const selectTotal = createSelector("cart", cart =>
  cart.items.reduce((s, i) => s + i.price, 0)
)

const total = selectTotal()  // memoized
```

---

### `subscribeWithSelector(name, selector, equality, listener)`

Subscribes to a store and calls `listener` only when the selected value changes.

```ts
const unsub = subscribeWithSelector(
  "cart",
  cart => cart.items.length,
  Object.is,
  (next, prev) => console.log("item count changed", prev, "→", next)
)
// call unsub() to unsubscribe
```

Respects the store's `snapshot` mode for cloning.

---

## Server — `stroid/server`

### `createStoreForRequest(fn)`

Creates an isolated `StoreRegistry` for a single request. Uses `AsyncLocalStorage` to scope all store operations inside `fn`.

```ts
const stores = createStoreForRequest((api) => {
  api.create("user", { name: "Ava", role: "admin" })
  api.create("cart", { items: [] })
})

// Render inside the request scope:
const html = stores.hydrate(() => renderToString(<App />))

// Serialize for the client:
const state = stores.snapshot()  // plain JSON object
```

**`api` methods inside the callback:**
- `api.create(name, data, options?)` — create a store
- `api.set(name, updater)` — write to a store
- `api.get(name)` — read a store
- `api.snapshot()` — get the current registry snapshot

**`stores` return value:**
- `stores.hydrate(fn)` — run `fn` inside the request scope (for React SSR rendering)
- `stores.snapshot()` — serialize all stores to a plain object

---

## Helpers — `stroid/helpers`

### `createEntityStore(name, options?)`

Manages a keyed collection of entities. Store shape: `{ entities: Record<string, T>, ids: string[] }`.

```ts
const users = createEntityStore("users")

users.upsert({ id: "1", name: "Ava" })
users.upsert({ id: "2", name: "Kai" })

users.all()         // → [{ id: "1", ... }, { id: "2", ... }]
users.get("1")      // → { id: "1", name: "Ava" }
users.remove("2")
users.clear()
```

> **Note:** The method is `.all()`, not `.getAll()`. The README contains an incorrect example using `.getAll()`.

---

### `createListStore(name, initial?, options?)`

Manages a `{ items: T[] }` store.

```ts
const todos = createListStore("todos", [])

todos.push({ text: "Write docs" })
todos.removeAt(0)
todos.replace([...])
todos.clear()
todos.all()          // → copy of items array
```

---

### `createCounterStore(name, initial?, options?)`

Manages a `{ value: number }` store.

```ts
const counter = createCounterStore("count", 0)

counter.inc()        // +1
counter.inc(5)       // +5
counter.dec()        // -1
counter.set(10)
counter.reset()
counter.get()        // → number | null
```

---

## Testing — `stroid/testing`

### `createMockStore(name, initial?)`

Creates a store and returns a convenience handle.

```ts
const cart = createMockStore("cart", { items: [] })

cart.set({ items: [{ id: 1, price: 50 }] })  // partial merge
cart.set(draft => { draft.items = [] })         // mutator
cart.reset()
cart.use()   // → StoreDefinition for use with useStore, getStore, etc.
```

---

### `resetAllStoresForTest()`

Hard-resets all stores and async state. Call in `beforeEach` to ensure isolation between tests.

```ts
beforeEach(() => resetAllStoresForTest())
```

---

### `withMockedTime(nowMs, fn)`

Overrides `Date.now` for the duration of `fn`.

```ts
withMockedTime(1_700_000_000_000, () => {
  createStore("session", { startedAt: Date.now() })
  // ...assertions
})
```

---

### `benchmarkStoreSet(name, iterations?, makeUpdate?)`

Measures `setStore` throughput for a store.

```ts
const result = benchmarkStoreSet(cartStore, 5000)
// result.opsPerSec, result.totalMs
```

---

## Runtime Tools — `stroid/runtime-tools`

### `listStores(pattern?)`

Returns store names in the active registry. Supports a `"prefix*"` wildcard.

```ts
listStores()          // ["user", "cart", "settings"]
listStores("cart*")   // ["cart", "cartTotal"]
```

---

### `getStoreMeta(name)`

Returns shallow-cloned metadata for a store (metrics, options, timestamps, update count).

---

### `getMetrics(name)`

Returns notification timing metrics for a store:

```ts
{ notifyCount: number, totalNotifyMs: number, lastNotifyMs: number }
```

---

### `getSubscriberCount(name)`

Number of active subscriber callbacks.

---

### `getAsyncInflightCount(name)`

Number of in-flight async fetch slots for a store.

---

### `getStoreHealth(name?)`

Single-store health entry or a full registry health report.

```ts
getStoreHealth("cart")
// { name, meta, metrics, async: { inflight, lastCorrelationId, traceContext }, persist: { queueDepth } }

getStoreHealth()
// { stores: StoreHealthEntry[], async: AsyncMetrics, registry: { totalStores, coldStores } }
```

---

### `findColdStores(options?)`

Returns stores that appear unused (no reads, or last read older than threshold).

```ts
findColdStores({ unreadThresholdMs: 60_000, includeWriteOnly: true })
// → ColdStoreReport[] with verdict: "cold" | "write-only" | "stale"
```

---

### `getPersistQueueDepth(name)`

Returns the number of pending persist writes for a store.

---

### `getComputedGraph()`

Returns the full computed dependency graph as `{ nodes, edges }`.

---

### `getComputedDeps(name)`

Returns the dependency names for a specific computed store.

---

## Runtime Admin — `stroid/runtime-admin`

### `clearAllStores()`

Removes all stores, resets async state, and clears the path validation cache. Useful for test environments or full resets.

### `clearStores(pattern?)`

Removes stores matching a `"prefix*"` pattern. Clears the path validation cache.

---

## Devtools — `stroid/devtools`

> Import `"stroid/devtools"` once at app entry (side-effect import). This registers the devtools feature globally.

### `getHistory(name, options?)`

Returns the write history for a store (respects `historyLimit`).

```ts
const history = getHistory("cart")
// [{ prev, next, action, timestamp }, ...]
```

---

### `clearHistory(name)`

Clears the write history for a store.

---

## Config

> Available from `stroid` (root export) and `stroid/config`.

### `configureStroid(config)`

Applies global configuration. All options are optional and may be set incrementally.

```ts
configureStroid({
  logSink: {
    log:      (msg, meta) => myLogger.info(msg, meta),
    warn:     (msg, meta) => myLogger.warn(msg, meta),
    critical: (msg, meta) => myLogger.error(msg, meta),
  },
  flush: {
    chunkSize:     Number.POSITIVE_INFINITY,  // default: unlimited
    chunkDelayMs:  0,
    priorityStores: ["auth", "user"],
  },
  revalidateOnFocus: {
    debounceMs:    500,
    maxConcurrent: 3,
    staggerMs:     100,
  },
  defaultSnapshotMode:     "deep",         // "deep" | "shallow" | "ref"
  strictMutatorReturns:    true,           // disallow return values in mutators
  asyncAutoCreate:         false,          // auto-create missing async stores
  autoCorrelationIds:      false,
  acknowledgeLooseTypes:   false,          // suppress untyped store name warnings
  pathCacheSize:           500,
  strictMissingFeatures:   true,           // throw when feature not registered
  assertRuntime:           false,          // throw on warnings (for tests)
  allowTrustedHydration:   false,          // allow hydrateStores without trust arg
  middleware:              [],             // global middleware (runs before store middleware)
  mutatorProduce:          undefined,      // immer produce or custom engine
})
```

---

### `registerMutatorProduce(produce, options?)`

Registers Immer (or any compatible) `produce` function as the global mutator engine.

```ts
import { produce } from "immer"
import { registerMutatorProduce } from "stroid"

registerMutatorProduce(produce)
```

Once registered, `setStore(name, draft => { ... })` uses structural sharing instead of deep cloning.

---

### `resetConfig()`

Resets all configuration to defaults. Intended for test teardown.

---

## Feature Plugin API — `stroid/feature`

### `registerStoreFeature(name, factory)`

Registers a custom feature plugin that participates in store lifecycle hooks.

```ts
import { registerStoreFeature } from "stroid/feature"
import type { FeatureHookContext, FeatureWriteContext, FeatureDeleteContext } from "stroid/feature"

registerStoreFeature("analytics", () => ({
  onStoreCreate(ctx: FeatureHookContext)  { /* store created */ },
  onStoreWrite(ctx: FeatureWriteContext)  { /* store written */ },
  beforeStoreDelete(ctx: FeatureDeleteContext) { /* before delete */ },
}))
```

---

## Types

Key exported types from `stroid`:

```ts
StoreDefinition<Name, State>   // typed store handle { name: Name }
StoreKey<Name, State>          // alias; functionally identical
StoreOptions<State>            // createStore options (see below)
PersistOptions<State>          // persist sub-options
SyncOptions                    // sync sub-options
WriteResult                    // { ok: true } | { ok: false, reason: string }
HydrationResult                // { hydrated, created, failed, blocked? }
HydrateSnapshotFor<Map>        // typed snapshot helper
StoreStateMap                  // augmentable interface for typed string names
StrictStoreMap                 // stricter augmentable interface
FeatureOptions                 // augmentable feature option bag
Path<T>                        // dot-path type for state T
PathValue<T, P>                // value type at path P in T
PartialDeep<T>                 // recursive partial
StateFor<Name>                 // state type for a registered store name
```

### `StoreOptions<State>`

```ts
interface StoreOptions<State> {
  scope?:             "request" | "global" | "temp"   // default: "request"
  lazy?:              boolean                          // lazy materialization
  pathCreate?:        boolean                          // allow creating missing keys
  validate?:          ValidateOption<State>            // validator or schema
  persist?:           boolean | string | PersistOptions<State>
  sync?:              boolean | SyncOptions
  devtools?:          boolean | DevtoolsOptions<State>
  lifecycle?:         LifecycleOptions<State>          // preferred grouping
  middleware?:        MiddlewareFn[]                   // deprecated; use lifecycle.middleware
  onSet?:             (prev: State, next: State) => void   // deprecated; use lifecycle.onSet
  onReset?:           (prev: State, next: State) => void
  onDelete?:          (prev: State) => void
  onCreate?:          (initial: State) => void
  onError?:           (err: string) => void
  snapshot?:          "deep" | "shallow" | "ref"       // default: "deep"
  snapshotSafety?:    "warn" | "throw" | "auto-clone"
  allowSSRGlobalStore?: boolean                        // deprecated; use scope: "global"
  features?:          FeatureOptions
}
```

> **Deprecation note:** Top-level `middleware`, `onSet`, `onReset`, `onDelete`, `onCreate`, `historyLimit`, `redactor`, `validator`, `schema`, `version`, `migrations`, `allowSSRGlobalStore` are deprecated. Use `lifecycle: { ... }`, `devtools: { historyLimit, redactor }`, `persist: { version, migrations }`, `validate`, and `scope: "global"` respectively.

### `PersistOptions<State>`

```ts
interface PersistOptions<State> {
  driver?:          PersistDriver            // default: localStorage
  storage?:         PersistDriver            // alias for driver
  key?:             string                   // default: "stroid_{name}"
  serialize?:       (v: unknown) => string   // default: JSON.stringify
  deserialize?:     (v: string) => unknown   // default: JSON.parse
  encrypt?:         (v: string) => string
  decrypt?:         (v: string) => string
  encryptAsync?:    (v: string) => Promise<string>
  decryptAsync?:    (v: string) => Promise<string>
  allowPlaintext?:  boolean
  sensitiveData?:   boolean     // throws if no encrypt hook provided
  maxSize?:         number      // max serialized bytes; hydration skipped if exceeded
  checksum?:        "hash" | "none" | "sha256"
  version?:         number
  migrations?:      Record<number, (state: State) => State>
  onMigrationFail?: "reset" | "keep" | ((state: unknown) => unknown)
  onStorageCleared?: (info: { name: string; key: string; reason: string }) => void
}
```

> **Important:** The persist migrations API is `migrations: Record<number, fn>`, **not** `migrate: (old, v) => ...`. The README example using `migrate` is incorrect.