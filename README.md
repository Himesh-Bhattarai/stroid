<div align="center">

<img src="https://img.shields.io/npm/v/stroid?color=7F77DD&label=stroid&style=flat-square" alt="npm version" />
<img src="https://img.shields.io/bundlephobia/minzip/stroid?color=1D9E75&label=minzipped&style=flat-square" alt="bundle size" />
<img src="https://img.shields.io/badge/tree--shakeable-subpaths-0F766E?style=flat-square" alt="tree-shakeable via subpaths" />
<img src="https://img.shields.io/npm/types/stroid?color=4A90E2&style=flat-square" alt="types" />
<img src="https://img.shields.io/npm/l/stroid?color=3B8BD4&style=flat-square" alt="license" />
<img src="https://img.shields.io/github/actions/workflow/status/Himesh-Bhattarai/stroid/ci.yml?color=639922&label=tests&style=flat-square" alt="tests" />
<img src="https://img.shields.io/npm/dm/stroid?color=2E7D32&label=downloads&style=flat-square" alt="npm downloads" />
<img src="https://img.shields.io/node/v/stroid?color=455A64&style=flat-square" alt="node version" />
<img src="https://img.shields.io/codecov/c/github/Himesh-Bhattarai/stroid?style=flat-square&label=coverage" alt="coverage" />
<img src="https://img.shields.io/github/last-commit/Himesh-Bhattarai/stroid?style=flat-square&label=last%20commit" alt="last commit" />
<img src="https://img.shields.io/github/stars/Himesh-Bhattarai/stroid?style=flat-square&label=stars" alt="stars" />
<img src="https://img.shields.io/github/contributors/Himesh-Bhattarai/stroid?style=flat-square" alt="contributors" />
<img src="https://img.shields.io/github/issues/Himesh-Bhattarai/stroid?style=flat-square" alt="issues" />
<img src="https://img.shields.io/snyk/vulnerabilities/github/Himesh-Bhattarai/stroid?style=flat-square" alt="vulnerabilities" />
<!-- <a href="https://your-demo-link.com">
  <img src="https://img.shields.io/badge/demo-live-ff69b4?style=flat-square" alt="live demo" />
</a> -->
<br /><br />

# 🟣 Stroid - State Engine for TypeScript and React
**Named-store state engine for TypeScript and React.**

Every store has a name. Write to it from anywhere: hooks, utilities, server, tests. Optional layers add persistence, sync, async fetch, SSR isolation, and devtools without coupling to core logic.
<br />
[**Get Started**](#30-second-quickstart) | [**Why Stroid**](#why-stroid) | [**API Reference**](#full-api-reference) | [**PSR**](#psr---write-governance) | [**DevTools**](#devtools) | [**Examples**](#real-world-examples)

</div>

---
> [!IMPORTANT]
> ## 🧠 What Is Stroid?
>
> A structured state management system focused on predictability, SSR safety, and debugging clarity.
>
> - Core store runtime (`createStore`, `setStore`, `getStore`)
> - React hooks (`useStore`, `useSelector`)
> - Async fetch/cache/revalidate
> - Optional features
> - SSR request isolation
> - Native PSR contract
---

<a id="30-second-quickstart"></a>
## ⚡ 30-Second Quickstart

---

>[!NOTE]
>```bash
>npm install stroid
>```
---

>[!NOTE]
>```ts
>import { createStore, setStore, getStore, configureStroid } from "stroid";
>import { installPersist } from "stroid/persist";
>import { installSync } from "stroid/sync";
>
>configureStroid({
>  asyncAutoCreate: false,
>  defaultSnapshotMode: "deep",
>});
>
>installPersist();
>installSync();
>//create store
>createStore("auth", { user: null, token: null });
>//create store with persist
>createStore("settings", { theme: "dark" }, { persist: true });
>//create store with sync and persist.
>createStore("session", { active: true }, { persist: true, sync: true });
>
>setStore("auth", "user", { id: "u1", name: "Asha" });
>const auth = getStore("auth");
>
>```
---

## Operational Notes

- Store names are runtime-validated. Avoid spaces and reserved keys like `__proto__`, `constructor`, and `prototype`.
- `useStore("name")` without a path or selector subscribes to the full store. Prefer `useSelector(...)` or path reads in hot React components.
- Hook string names are only strongly typed after `StoreStateMap` augmentation. Without it, `useStore("name")` reads are intentionally loose and typically resolve to `unknown`.
- Selector-heavy dev flows that read frozen state deep-clone by default for safe dependency tracking. If that overhead matters more than the extra safety, tune `selectorCloneFrozen`.
- `fetchStore(name, promise, ...)` accepts a direct Promise, but direct Promise inputs cannot use retries or replayable `refetchStore()` semantics. Use a URL string or factory when you need retry/backoff behavior.
- `asyncAutoCreate` is a development convenience, not a production safety feature. Leave it off in production to avoid typo-created phantom stores.
- `stroid/sync` uses same-origin `BroadcastChannel` transport. Stroid requests a fresh snapshot on startup, focus, and reconnect, but listener registration can still race under load, `policy: "insecure"` is an explicit opt-out, and open channels may reduce BFCache restores.
- `stroid/persist` relies on browser storage. `checksum: "hash"` is non-cryptographic, and Safari/WebKit can evict script-writable storage after roughly 7 days of inactivity, so persisted auth, carts, and drafts should have a server-backed recovery path.
- If bundle size matters, prefer targeted subpaths such as `stroid/core`, `stroid/query`, `stroid/persist`, `stroid/sync`, `stroid/devtools`, and `stroid/runtime-tools` instead of reaching through the root namespace for everything.

---

### Stroid PSR

Stroid ships a native PSR contract in `stroid/psr`.
It exposes committed snapshots, patch application APIs, and runtime graph/timing data used for governance flows.

---

## 🗺️ Ecosystem Map

Stroid is organized into focused sub-packages. Import only what you need.

```
stroid                    <- core public runtime
|- stroid/react           <- React hooks
|- stroid/core            <- minimal core surface
|- stroid/psr             <- native PSR contract
|- stroid/async           <- fetch/cache/revalidate
|- stroid/query           <- reactQueryKey(), swrKey()
|- stroid/selectors       <- selector helpers
|- stroid/computed        <- computed stores
|- stroid/persist         <- installPersist()
|- stroid/sync            <- installSync()
|- stroid/devtools        <- installDevtools(), history API
|- stroid/server          <- SSR request-scoped registry
|- stroid/helpers         <- entity/list/counter helpers
|- stroid/testing         <- test helpers
|- stroid/runtime-tools   <- observability APIs
|- stroid/runtime-admin   <- clear helpers
|- stroid/feature         <- feature plugin API
|- stroid/install         <- installAllFeatures()
```

Bundle-sensitive note:
- `stroid/query` is the lean path for `reactQueryKey()` and `swrKey()`.
- `stroid/install` is a convenience aggregator; import `stroid/persist`, `stroid/sync`, and `stroid/devtools` directly when you only need one feature.
- In a local esbuild bundle-closure probe on `2026-03-31`, `installPersist` dropped from about `42.5 KB` to `21.6 KB`, and `stroid/query` key helpers bundle to about `0.1 KB`; root `stroid` `createStore` still retains about `69.9 KB`, and `stroid/runtime-tools` `listStores` stayed roughly flat at about `27.9 KB`, so the harder wins are still in the root/shared-runtime path.

---

<a id="why-stroid"></a>
## 🤔 Why Stroid?

### Honest comparison

| Feature | **Stroid** | Redux Toolkit | Zustand | Jotai | Valtio |
|---|:---:|:---:|:---:|:---:|:---:|
| Write without reducers | ✅ | ❌ | ✅ | ✅ | ✅ |
| Named global stores | ✅ | ✅ | ⚠️ manual | ❌ | ❌ |
| Write governance (PSR) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Built-in DevTools extension | ✅ | ✅ | ⚠️ limited | ❌ | ❌ |
| Computed / derived state | ✅ | ✅ | ⚠️ manual | ✅ | ✅ |
| Async data built-in | ✅ | ✅ RTK Query | ❌ | ⚠️ | ❌ |
| SSR / request isolation | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ |
| Atomic rollback guarantee | ✅ | ❌ | ❌ | ❌ | ❌ |
| Race resistance proof | ✅ | ❌ | ❌ | ❌ | ❌ |
| Determinism replay | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ring-buffer event timeline | ✅ | ❌ | ❌ | ❌ | ❌ |
| Bundle size (lean import closure) | ~41.9kb raw via `stroid/core`* | ~11kb | ~1kb | ~3kb | ~3kb |
| TypeScript-first | ✅ | ✅ | ✅ | ✅ | ✅ |

NOTE: `*` measured from a local `2026-03-31` esbuild bundle-closure probe against built `dist/`. The root `stroid` `createStore` closure is still about `69.9 KB`, so import choice matters.

Bundle note:
- Prefer `stroid/core` for minimal CRUD imports, `stroid/query` for query keys, and direct feature subpaths for installers.
- The root `stroid` namespace remains compatibility-first and currently retains materially more code than the narrower subpaths.

> ⚠️ = possible with extra setup · ❌ = not supported natively

Stroid exposes governance-oriented write flows through `stroid/psr`, including committed snapshot reads, patch application APIs, runtime graph inspection, and timing contracts.
Benchmark report: [docs/STROID/BENCHMARK.md](./docs/STROID/BENCHMARK.md).

Stroid is a fit when you need these together:
- Named global stores with direct writes
- Optional feature installs instead of mandatory side effects
- Strict hydration trust gate (`hydrateStores(..., ..., { allowTrusted: true })`)
- Request-scoped SSR runtime (`createStoreForRequest`) with server guards
- PSR-style patch application and runtime graph inspection (`stroid/psr`)

If you only need ultra-minimal local state, `stroid/core` exists for a smaller surface.

---

<a id="full-api-reference"></a>
## 📚 Full API Reference

All examples use real APIs from this repository's current source.

## ⚙️ Core - `stroid`

### `createStore`

```ts
import { createStore } from "stroid";

createStore("cart", {
  items: [],
  total: 0,
});
```

Creates a named store and registers its initial state.

---

### `setStore`

```ts
import { setStore } from "stroid";

setStore("cart", "total", 499);
setStore("cart", { currency: "NPR" });
setStore("cart", (draft: any) => {
  draft.items.push({ id: "pizza", qty: 1 });
});
```
Updates existing store state by path, partial object merge, or mutator function.
The public root API intentionally does not export `replaceStore`; explicit full-store replacement is kept on the internal runtime/PSR side to reduce accidental overwrite mistakes.

---

### `getStore`

```ts
import { getStore } from "stroid";

const cart = getStore("cart");
const total = getStore("cart", "total");
```
Reads current store state, optionally at a nested path.

---

### `hasStore`

```ts
import { hasStore, createStore } from "stroid";

if (!hasStore("cart")) {
  createStore("cart", { items: [], total: 0 });
}
```
Checks whether a store is already registered.

---

### `resetStore`

```ts
import { resetStore } from "stroid";

resetStore("cart");
```
Resets a store back to its original initial state.

---

### `deleteStore`

```ts
import { deleteStore } from "stroid";

deleteStore("cart");
```
Removes a store and its runtime metadata/subscriptions.

---

### `setStoreBatch`

```ts
import { setStoreBatch, setStore } from "stroid";

setStoreBatch(() => {
  setStore("checkout", "coupon", "SAVE20");
  setStore("checkout", "deliveryType", "priority");
  setStore("checkout", "tip", 50);
});
```
`setStoreBatch` accepts only synchronous callbacks.
Runs multiple synchronous writes in one transaction-style batch.

---

### `hydrateStores`

```ts
import { hydrateStores } from "stroid";

hydrateStores(
  {
    cart: { items: [{ id: "pizza", qty: 1 }], total: 499 },
    profile: { name: "Asha" },
  },
  {},
  { allowTrusted: true }
);
```
Hydrates many stores from a trusted snapshot payload.

---

### `configureStroid`

```ts
import { configureStroid } from "stroid";

configureStroid({
  asyncAutoCreate: false,
  strictMutatorReturns: true,
  defaultSnapshotMode: "deep",
});
```
Sets global runtime behavior such as async and snapshot defaults.

---
>[!TIP]
>
>Stroid is NOT for:
>- small apps
>- simple UI state
>- beginners learning React
>
>Stroid is for:
>- complex apps
>- SSR-heavy systems
>- multi-source async data
>- teams that need debugging + guarantees
> *If Still want to learn, then:
> - **Beginners:** If you are building a personal portfolio or a small app, you likely only need `createStore`, `getStore`, and the basic React hooks like `useStore`. I don't want you to read whole README.
> - **Intermediate:** We recommend reading the full README to understand features like batching, persistence,SSR Isolation,Sync,and async fetching. Don't take overhead about PSR FOR NOW, THINK THAT NOT EXIST AT ALL. UNTIL, I MAKE PROPER EXPLANATION VIDEO.
> - **Advanced:** Explore the `/docs` directory for deep dives into architecture, SSR isolation, and the PSR contract, DevTools.
---
## ⚛️ React Hooks - `stroid/react`

### `useStore`

```tsx
import { useStore } from "stroid/react";

function CartPanel() {
  const cart = useStore("cart");
  return <div>{cart ? `${cart.items.length} items` : "Cart empty"}</div>;
}
```
Subscribes React components to a store value (full store, path, or selector form).

---

### `useSelector`

```tsx
import { useSelector } from "stroid/react";

function CartTotal() {
  const total = useSelector("cart", (s: any) => s?.total ?? 0);
  return <strong>Rs. {total}</strong>;
}
```
Subscribes to a derived slice and re-renders only when selected output changes.

---

### `useStoreField`

```tsx
import { useStoreField } from "stroid/react";

function DeliveryTypeChip() {
  const deliveryType = useStoreField("checkout", "deliveryType");
  return <span>{deliveryType ?? "standard"}</span>;
}
```
Subscribes directly to one field/path inside a store.

---

### `useStoreStatic`

```tsx
import { useStoreStatic } from "stroid/react";

function DebugPanel() {
  const snapshot = useStoreStatic("cart");
  return <pre>{JSON.stringify(snapshot, null, 2)}</pre>;
}
```
Reads a snapshot once without live subscription updates.

---

### `useAsyncStore`

```tsx
import { useEffect } from "react";
import { useAsyncStore } from "stroid/react";
import { fetchStore } from "stroid/async";

function Menu() {
  useEffect(() => {
    void fetchStore("menu", "https://api.example.com/menu");
  }, []);

  const { loading, error, data } = useAsyncStore("menu");

  if (loading) return <p>Loading menu...</p>;
  if (error) return <p>Failed to load menu</p>;
  return <MenuList items={data ?? []} />;
}
```
Reads async store shape (`data/loading/error/status`) from an existing store.

---

### `useAsyncStoreSuspense`

```tsx
import { useAsyncStoreSuspense } from "stroid/react";

function MenuSuspense() {
  const menu = useAsyncStoreSuspense<Array<{ id: string; name: string }>>(
    "menu",
    "https://api.example.com/menu"
  );

  return <MenuList items={menu} />;
}
```
Integrates async store reads with React Suspense by throwing pending work.

---

### `useFormStore`

```tsx
import { createStore } from "stroid";
import { useFormStore } from "stroid/react";

createStore("loginForm", { email: "", password: "" });

function LoginForm() {
  const email = useFormStore("loginForm", "email");
  const password = useFormStore("loginForm", "password");

  return (
    <form>
      <input value={email.value ?? ""} onChange={email.onChange} />
      <input value={password.value ?? ""} onChange={password.onChange} type="password" />
      <button disabled={!email.value || !password.value}>Sign in</button>
    </form>
  );
}
```
Binds a store field to form-style `value` and `onChange` helpers.

---

### `RegistryScope`

```tsx
import { RegistryScope } from "stroid/react";

function App({ registry }: { registry: any }) {
  return (
    <RegistryScope value={registry}>
      <CartPanel />
      <ProfilePanel />
    </RegistryScope>
  );
}
```
Scopes a React subtree to a specific store registry context.

---

## 𛲝Se Selectors & Computed

### `createSelector` - `stroid/selectors`

```ts
import { createSelector } from "stroid/selectors";

const selectItemCount = createSelector("cart", (s: any) => s?.items?.length ?? 0);
const count = selectItemCount();
```
Builds a memoized selector function for derived store reads.

---

### `subscribeWithSelector` - `stroid/selectors`

```ts
import { subscribeWithSelector } from "stroid/selectors";

const stop = subscribeWithSelector(
  "cart",
  (s: any) => s?.total,
  Object.is,
  (next, prev) => {
    if (typeof prev === "number" && next > prev) {
      // run side effect
    }
  }
);

stop();
```
Runs a listener only when the selected value changes by equality check.

---

### `createComputed` - `stroid/computed`

```ts
import { createComputed } from "stroid/computed";
import { getStore } from "stroid";

createComputed("deliveryFee", ["cart"], (cart: any) => (cart?.total ?? 0) > 1000 ? 0 : 60);

const fee = getStore("deliveryFee");
```
Creates a computed store derived from one or more dependency stores.

---

### `invalidateComputed` / `deleteComputed` / `isComputedStore`

```ts
import { invalidateComputed, deleteComputed, isComputedStore } from "stroid/computed";

invalidateComputed("deliveryFee");
deleteComputed("deliveryFee");
isComputedStore("deliveryFee");
```
Invalidates, removes, or checks computed-store registrations.

---

## ⏱️ Async - `stroid/async`

```ts
import { fetchStore, refetchStore, enableRevalidateOnFocus } from "stroid/async";

await fetchStore("menu", "https://api.example.com/menu");
await refetchStore("menu");
const stopFocusRevalidate = enableRevalidateOnFocus("menu");

stopFocusRevalidate();
```
Fetches/refetches remote data into stores with cache, dedupe, retries, and focus revalidation.

---

##  PSR - Write Governance

```ts
import { applyStorePatch, applyStorePatchesAtomic } from "stroid/psr";

applyStorePatch({
  id: "cart-total-set",
  store: "cart",
  path: ["total"],
  op: "set",
  value: 549,
  meta: { timestamp: Date.now(), source: "setStore" },
});

applyStorePatchesAtomic([
  {
    id: "wallet-set",
    store: "wallet",
    path: ["balance"],
    op: "set",
    value: 900,
    meta: { timestamp: Date.now(), source: "setStore" },
  },
  {
    id: "order-set",
    store: "order",
    path: ["status"],
    op: "set",
    value: "paid",
    meta: { timestamp: Date.now(), source: "setStore" },
  },
]);
```
Applies patch-based governed writes with atomic multi-patch support.

---

## 🛡️ Features - `stroid/feature`

### Install - Opt-In Capabilities

```ts
import { installPersist } from "stroid/persist";
import { installSync } from "stroid/sync";
import { installDevtools } from "stroid/devtools";

installPersist();
installSync();
installDevtools();
```
Installs optional persist/sync/devtools features explicitly at app entry.

---

## 🌐 SSR - `stroid/server`

```ts
import { createStoreForRequest } from "stroid/server";

const requestScope = createStoreForRequest((api) => {
  api.create("session", { userId: "u-1" });
  api.create("cart", { items: [], total: 0 });
});

const html = requestScope.hydrate(() => renderToString(<App />));
const snapshot = requestScope.snapshot();
```
Creates per-request store scopes for SSR-safe hydrate/snapshot flows.

---

## 🔢 Helpers - `stroid/helpers`

```ts
import { createEntityStore, createListStore, createCounterStore } from "stroid/helpers";

const users = createEntityStore<{ id?: string; name: string }>("users");
users.upsert({ id: "u1", name: "Asha" });
users.remove("u1");

const tasks = createListStore("tasks", [] as string[]);
tasks.push("pick up order");
tasks.removeAt(0);
tasks.clear();

const retries = createCounterStore("retries", 0);
retries.inc();
retries.dec();
retries.set(5);
const retryValue = retries.get();
```
Provides ready-made entity, list, and counter store helpers.

---

## 🧪 Testing - `stroid/testing`

```ts
import {
  createMockStore,
  resetAllStoresForTest,
  withMockedTime,
  benchmarkStoreSet,
} from "stroid/testing";

const mockOrder = createMockStore("order", { status: "draft" });
mockOrder.set({ status: "confirmed" });

withMockedTime(1700000000000, () => {
  // Date.now() is fixed in this callback
});

const result = benchmarkStoreSet({ name: "cart" } as any, 300);
const avgMs = result.avgMs;

resetAllStoresForTest();
```
Provides test helpers for mock stores, time control, reset, and micro-benchmarks.

---

## 📈 Runtime Observability - `stroid/runtime-tools`

```ts
import {
  listStores,
  getStoreMeta,
  getMetrics,
  getSubscriberCount,
  getStoreHealth,
  findColdStores,
  getComputedGraph,
  getComputedDeps,
  getPersistQueueDepth,
} from "stroid/runtime-tools";

const stores = listStores();
const meta = getStoreMeta("cart");
const metrics = getMetrics("cart");
const subscribers = getSubscriberCount("cart");
const health = getStoreHealth();
const cold = findColdStores();
const graph = getComputedGraph();
const deps = getComputedDeps("deliveryFee");
const persistDepth = getPersistQueueDepth("cart");
```
Exposes runtime diagnostics for stores, metrics, health, and computed graph state.
Import only the functions you need. The internal helpers are grouped more narrowly now, but the published multi-entry build still shares runtime chunks, so the biggest remaining wins are still deeper than this surface split.

---

## 🗝️ Query Keys - `stroid/query`

```ts
import { reactQueryKey, swrKey } from "stroid/query";

const tanstackKey = reactQueryKey("cart");
const swrCacheKey = swrKey("cart", "summary");
```
Use `stroid/query` when you only need stable cache keys for TanStack Query or SWR.
The root `queryIntegrations` namespace still exists for compatibility, but `stroid/query` is the leaner path.

---

## 🔧 Runtime Admin - `stroid/runtime-admin`

```ts
import { clearAllStores, clearStores } from "stroid/runtime-admin";

clearStores("cart*");
clearAllStores();
```
Clears stores in bulk by pattern or globally.

---

## 🌉 DevTools Bridge - `stroid/devtools`

```ts
import { installDevtools, getHistory, clearHistory } from "stroid/devtools";

installDevtools();

const cartHistory = getHistory("cart");
// Array<HistoryEntry> where entry has: ts, action, prev, next, diff

clearHistory("cart");
```
Connects to devtools runtime and exposes local history read/clear APIs.

---

## 🔌 Feature Plugin API - `stroid/feature`

```ts
import {
  registerStoreFeature,
  hasRegisteredStoreFeature,
  getRegisteredFeatureNames,
} from "stroid/feature";

registerStoreFeature("auditFeature", () => ({
  onStoreCreate(ctx) {
    // fires when a store is created
  },
  onStoreWrite(ctx) {
    // fires on store write
  },
}));

const hasAudit = hasRegisteredStoreFeature("auditFeature");
const featureNames = getRegisteredFeatureNames();
```
Registers custom feature runtimes with lifecycle hooks.

---

<a id="psr---write-governance"></a>
## 🛡️ PSR - Write Governance - `stroid/psr`

PSR (`stroid/psr`) is the public contract for:
- Committed snapshots
- Post-commit subscriptions
- Serializable patch application
- Runtime graph and timing contract inspection

### PSR API

```ts
import {
  getStoreSnapshot,
  getStoreSnapshotNoTrack,
  subscribeStore,
  applyStorePatch,
  applyStorePatchesAtomic,
  getRuntimeGraph,
  getComputedDescriptor,
  evaluateComputed,
  getTimingContract,
} from "stroid/psr";

const committed = getStoreSnapshot("cart");
const committedNoTrack = getStoreSnapshotNoTrack("cart");

const unsubscribe = subscribeStore("cart", (next) => {
  // handle committed updates
});

const graph = getRuntimeGraph();
const checkoutNode = graph.nodes.find(
  (n) => n.storeId === "checkoutTotal" && (n.type === "computed" || n.type === "async-boundary")
);

if (checkoutNode) {
  const descriptor = getComputedDescriptor(checkoutNode.id);
  const preview = evaluateComputed(checkoutNode.id, {
    cart: { items: [{ id: "pizza", qty: 2 }], total: 998 },
  });
}

const timing = getTimingContract("cart");
```
Exposes committed snapshots, subscriptions, patch APIs, runtime graph, and timing contract.
---

<a id="devtools"></a>
## 🔬 DevTools - `stroid/devtools`

`stroid/devtools` integrates with the Redux DevTools browser extension and also keeps in-memory history per store.

What you get from code:
- `installDevtools()` to enable the devtools feature runtime
- `getHistory(name, limit?)` to read recorded store history
- `clearHistory(name?)` to clear one store or all stores

Setup:
1. Install Redux DevTools extension in your browser.
2. Call `installDevtools()` once in app entry.
3. Open browser DevTools and inspect the connected `stroid` session.

---

<a id="real-world-examples"></a>
## 🍕 Real-World Examples

### Food delivery cart (full flow)

```tsx
// app/entry.ts
import { configureStroid } from "stroid";
import { installPersist } from "stroid/persist";
import { installDevtools } from "stroid/devtools";

configureStroid({ asyncAutoCreate: false });
installPersist();
installDevtools();

// stores/cart.ts
import { createStore, setStoreBatch, setStore } from "stroid";

createStore("cart", { items: [], total: 0 });
createStore("checkout", { coupon: null, deliveryType: "standard", tip: 0 });

// components/CartPanel.tsx
import { useSelector, useStoreField } from "stroid/react";

function CartPanel() {
  const total = useSelector("cart", (s: any) => s?.total ?? 0);
  const deliveryType = useStoreField("checkout", "deliveryType");

  function applyPromo() {
    setStoreBatch(() => {
      setStore("checkout", "coupon", "SAVE20");
      setStore("checkout", "deliveryType", "priority");
      setStore("checkout", "tip", 50);
    });
  }

  return (
    <div>
      <p>Total: Rs. {total}</p>
      <p>Delivery: {deliveryType}</p>
      <button onClick={applyPromo}>Apply promo</button>
    </div>
  );
}
```

### Atomic payment (wallet + order status)

```ts
import { getStore } from "stroid";
import { applyStorePatchesAtomic } from "stroid/psr";

function confirmPayment(amount: number) {
  const wallet = getStore("wallet") as { balance: number } | null;
  const nextBalance = (wallet?.balance ?? 0) - amount;

  applyStorePatchesAtomic([
    {
      id: "pay-wallet",
      store: "wallet",
      path: ["balance"],
      op: "set",
      value: nextBalance,
      meta: { timestamp: Date.now(), source: "setStore" },
    },
    {
      id: "pay-order",
      store: "order",
      path: ["status"],
      op: "set",
      value: "paid",
      meta: { timestamp: Date.now(), source: "setStore" },
    },
  ]);
}
```
Applies related wallet/order updates atomically so both succeed or fail together.

---
### Menu with Suspense

```tsx
import { Suspense } from "react";
import { useAsyncStoreSuspense } from "stroid/react";

function MenuList() {
  const menu = useAsyncStoreSuspense<Array<{ id: string; name: string }>>(
    "menu",
    "https://api.example.com/menu"
  );

  return <ul>{menu.map((item) => <li key={item.id}>{item.name}</li>)}</ul>;
}

export function MenuPage() {
  return (
    <Suspense fallback={<p>Loading menu...</p>}>
      <MenuList />
    </Suspense>
  );
}
```
Loads menu data through Suspense-friendly async store access.

---

## 🧱 Layer Map

```
+---------------------------------------------------------+
|                        your app                         |
+---------------------------------------------------------+
|  useStore  useSelector  useAsyncStore  useFormStore     |  stroid/react
+---------------------------------------------------------+
|  createStore  setStore  getStore  setStoreBatch         |  stroid
|  createComputed  createSelector  createEntityStore      |
+--------------+--------------+---------------------------+
| stroid/persist | stroid/sync | stroid/async             |
| installPersist | installSync | fetch + cache + retry    |
+--------------+--------------+---------------------------+
|  stroid/server   createStoreForRequest                  |  SSR
+---------------------------------------------------------+
|  stroid/devtools  stroid/testing  stroid/runtime-tools  |
+---------------------------------------------------------+
```

Each row is independent. Use only what you need.

`stroid/core` exports only `createStore`, `setStore`, `getStore`, `hasStore`, `resetStore`, and `deleteStore`.
Import from `stroid` for batching/hydration/computed plus runtime metrics and config.

## 📦 What Each Import Contains

- `stroid`: Core public runtime (`createStore`, `createStoreStrict`, `setStore`, `setStoreBatch`, `getStore`, `deleteStore`, `resetStore`, `hasStore`, `hydrateStores`), plus `configureStroid`, computed helpers, and health/metric helpers.
- `stroid/psr`: PSR contract (`getStoreSnapshot`, `getStoreSnapshotNoTrack`, `subscribeStore`, `applyStorePatch`, `applyStorePatchesAtomic`, runtime graph/timing helpers).
- `stroid/core`: Minimal CRUD runtime (`createStore`, `setStore`, `getStore`, `hasStore`, `resetStore`, `deleteStore`).
- `stroid/react`: React hooks (`useStore`, `useSelector`, `useStoreField`, `useStoreStatic`, `useAsyncStore`, `useFormStore`, `useAsyncStoreSuspense`) and `RegistryScope`.
- `stroid/async`: Async APIs (`fetchStore`, `refetchStore`, `enableRevalidateOnFocus`, `getAsyncMetrics`).
- `stroid/query`: cache-key helpers (`reactQueryKey`, `swrKey`) without the fetcher helpers.
- `stroid/selectors`: `createSelector`, `subscribeWithSelector`.
- `stroid/computed`: `createComputed`, `invalidateComputed`, `deleteComputed`, `isComputedStore`.
- `stroid/persist`: `installPersist`.
- `stroid/sync`: `installSync`.
- `stroid/devtools`: `installDevtools`, `getHistory`, `clearHistory`.
- `stroid/server`: `createStoreForRequest`.
- `stroid/helpers`: `createEntityStore`, `createListStore`, `createCounterStore`.
- `stroid/testing`: `createMockStore`, `resetAllStoresForTest`, `withMockedTime`, `benchmarkStoreSet`.
- `stroid/runtime-tools`: Store/runtime observability APIs.
- `stroid/runtime-admin`: `clearAllStores`, `clearStores`.
- `stroid/feature`: Feature registration APIs.
- `stroid/install`: `installPersist`, `installSync`, `installDevtools`, `installAllFeatures`.

---

## 🧾 Quick API Reference

| API | Purpose |
|-----|---------|
| `createStore(name, state, options?)` | Define a store. Returns `StoreDefinition` or `undefined`. |
| `createStoreStrict(name, state, options?)` | Define a store; throws if creation fails. |
| `setStore(name, update)` | Merge object update into object store state. |
| `setStore(name, path, value)` | Write by path. |
| `setStore(name, draft => { ... })` | Mutator-style update. |
| `getStore(name, path?)` | Read current state (or nested path). |
| `deleteStore(name)` | Remove a store from registry. |
| `resetStore(name)` | Restore initial state. |
| `hasStore(name)` | Check if store exists. |
| `setStoreBatch(fn)` | Group synchronous writes into one transaction. |
| `hydrateStores(snapshot, options?, trust)` | Hydrate trusted snapshot into runtime. |
| `configureStroid(config)` | Configure global/runtime behavior. |
| `useStore(name, selectorOrPath?)` | React subscription hook. |
| `useSelector(name, fn, equality?)` | Fine-grained React selector hook. |
| `fetchStore(name, input, options?)` | Fetch remote data into store. |
| `createComputed(name, deps, fn)` | Define computed store. |
| `createStoreForRequest(fn)` | Build SSR request-scoped store runtime. |

---

## 🧭 Module Import Map

```ts
// Core
import {
  createStore,
  createStoreStrict,
  setStore,
  getStore,
  hasStore,
  deleteStore,
  resetStore,
  setStoreBatch,
  hydrateStores,
  configureStroid,
} from "stroid";

// Native PSR contract
import {
  getStoreSnapshot,
  getStoreSnapshotNoTrack,
  subscribeStore,
  applyStorePatch,
  applyStorePatchesAtomic,
  getRuntimeGraph,
  getComputedDescriptor,
  evaluateComputed,
  getTimingContract,
} from "stroid/psr";

// Minimal core (bundle-size-sensitive)
import { createStore, setStore, getStore, hasStore, resetStore, deleteStore } from "stroid/core";

// React
import {
  useStore,
  useSelector,
  useStoreField,
  useStoreStatic,
  useAsyncStore,
  useFormStore,
  useAsyncStoreSuspense,
  RegistryScope,
} from "stroid/react";

// Async
import { fetchStore, refetchStore, enableRevalidateOnFocus } from "stroid/async";

// Query keys only
import { reactQueryKey, swrKey } from "stroid/query";

// Selectors & Computed
import { createSelector, subscribeWithSelector } from "stroid/selectors";
import { createComputed, invalidateComputed, deleteComputed, isComputedStore } from "stroid/computed";

// Features (explicit install - call once at app entry)
import { installPersist } from "stroid/persist";
import { installSync } from "stroid/sync";
import { installDevtools, getHistory, clearHistory } from "stroid/devtools";

installPersist();
installSync();
installDevtools();

// Server / SSR
import { createStoreForRequest } from "stroid/server";

// Helpers & Testing
import { createEntityStore, createListStore, createCounterStore } from "stroid/helpers";
import { createMockStore, resetAllStoresForTest, withMockedTime, benchmarkStoreSet } from "stroid/testing";

// Runtime Observability + Admin
import {
  listStores,
  getStoreMeta,
  getMetrics,
  getSubscriberCount,
  getStoreHealth,
  findColdStores,
  getComputedGraph,
  getComputedDeps,
  getPersistQueueDepth,
} from "stroid/runtime-tools";
import { clearAllStores, clearStores } from "stroid/runtime-admin";

// Feature plugin API
import { registerStoreFeature, hasRegisteredStoreFeature, getRegisteredFeatureNames } from "stroid/feature";

// Optional all-in-one installer
import { installAllFeatures } from "stroid/install";
```

---

## 🧷 Native PSR Contract

`stroid/psr` is the supported public surface for native PSR-style integration.

- Committed reads: `getStoreSnapshot()` and `getStoreSnapshotNoTrack()`
- Committed-final observation: `subscribeStore()`
- Serializable writes: `applyStorePatch()` and `applyStorePatchesAtomic()` with `set`, `merge`, `delete`, and `insert`
- Runtime inspection: `getRuntimeGraph()`, `getComputedDescriptor()`, `evaluateComputed()`, and `getTimingContract()`

See [Native PSR Contract](./docs/STROID_PSR/INDEX.md) for full details.

---

## 📘 Docs

Full documentation in [`/docs`](./docs/):

- [Architecture](./docs/STROID_ARCHITECTURE/AECHITECTURE.md) - layers, data flow, registry model
- [Core Concepts](./docs/STROID_CORE/INDEX.md) - store lifecycle, options, write modes
- [React Layer](./docs/STROID_REACT/INDEX.md) - hooks, selectors, SSR
- [Async Layer](./docs/STROID_ASYNC/INDEX.md) - `fetchStore`, caching, revalidation
- [Persistence](./docs/STROID_PERSIST/INDEX.md) - persist options, encryption, migrations
- [Cross-tab Sync](./docs/STROID_SYNC/INDEX.md) - BroadcastChannel sync behavior
- [Computed Stores](./docs/STROID_COMPUTED/INDEX.md) - reactive derived values
- [Native PSR Contract](./docs/STROID_PSR/INDEX.md) - patch coverage, timing/governance, graph identity
- [Server & SSR](./docs/STROID_SERVER/INDEX.md) - request-scoped stores, hydration
- [Testing](./docs/STROID_TESTING/INDEX.md) - mock stores, resets, benchmarks
- [Runtime Tools](./docs/STROID_RUNTIME_TOOLS/INDEX.md) - observability, health checks
- [TypeScript Guide](./docs/STROID_TYPESCRIPT/INDEX.md)
- [Full API Reference](./docs/api/stroid.api.md)
- [Project Status](./STATUS.MD)
- [Contributing](./CONTRIBUTING.md)

---

## 📝 Changelog & License

- [CHANGELOG](./CHANGELOG.md)
- [MIT License](./LICENSE)
- [Issues](https://github.com/Himesh-Bhattarai/stroid/issues)


<div align="center">

**Made with care for developers who think about state seriously.**

[⭐ Star on GitHub](https://github.com/Himesh-Bhattarai/stroid) · [🐛 Report a bug](https://github.com/Himesh-Bhattarai/stroid/issues) · [💬 Discussions](https://github.com/Himesh-Bhattarai/stroid/discussions)

</div>
