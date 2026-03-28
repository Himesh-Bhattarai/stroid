<div align="center">

<img src="https://img.shields.io/npm/v/stroid?color=7F77DD&label=stroid&style=flat-square" alt="npm version" />
<img src="https://img.shields.io/bundlephobia/minzip/stroid?color=1D9E75&label=minzipped&style=flat-square" alt="bundle size" />
<img src="https://img.shields.io/npm/l/stroid?color=3B8BD4&style=flat-square" alt="license" />
<img src="https://img.shields.io/github/actions/workflow/status/your-org/stroid/ci.yml?color=639922&label=tests&style=flat-square" alt="tests" />

<br /><br />

# 🟣 Stroid

### Proxy-based reactive state for React — with write governance, async, and a real devtools extension built in.

<br />

[**Get Started**](#-30-second-quickstart) · [**Why Stroid**](#-why-stroid) · [**API Reference**](#-full-api-reference) · [**PSR**](#-psr--write-governance) · [**DevTools**](#-devtools) · [**Examples**](#-real-world-examples)

</div>

---

## What is Stroid?

Stroid is a **JavaScript/TypeScript state management library** built around a proxy model.  
Instead of writing reducers or dispatching actions, you just read and write state — and everything reacts automatically.

It ships with:
- **Reactive stores** — fine-grained subscription, no boilerplate
- **PSR (Pre-commit State Resolution)** — intercept and govern every write before it reaches the store
- **DevTools extension** — ring-buffer event timeline, computed graph inspector, live store health
- **Async, computed, persist, sync** — all optional, all tree-shakeable
- **SSR-safe** — isolated request-scoped stores for Next.js / Remix

> **Think of Stroid as a smart state container that knows what you wrote, what changed, and what it means before it commits.**

---

## ⚡ 30-Second Quickstart

```bash
npm install stroid
```

```tsx
// 1. Create a store
import { createStore, setStore } from "stroid";

createStore("cart", { items: [], total: 0 });

// 2. Update it anywhere
setStore("cart", "total", 499);

// 3. React to it in components
import { useStore } from "stroid/react";

function CartPanel() {
  const cart = useStore("cart");
  return <div>Total: Rs. {cart?.total}</div>;
}
```

That's it. No providers. No reducers. No context setup.

---

## 🏗️ Ecosystem Map

Stroid is organized into focused sub-packages. Import only what you need.

```
stroid                    ← core store API (always needed)
├── stroid/react          ← React hooks
├── stroid/core           ← minimal core (smaller bundle)
├── stroid/psr            ← write governance & runtime graph
├── stroid/async          ← remote data fetching
├── stroid/selectors      ← derived reads with subscriptions
├── stroid/computed       ← reactive computed stores
├── stroid/persist        ← localStorage / sessionStorage sync
├── stroid/sync           ← cross-tab / cross-window sync
├── stroid/server         ← SSR request isolation
├── stroid/helpers        ← entity, list, counter stores
├── stroid/testing        ← mocks, reset, benchmark
├── stroid/devtools       ← devtools extension bridge
├── stroid/runtime-tools  ← observability & health
├── stroid/runtime-admin  ← bulk store operations
└── stroid/feature        ← custom plugin API
```

---

## 🤔 Why Stroid?

### Honest comparison

| Feature | Stroid | Redux Toolkit | Zustand | Jotai | Valtio |
|---|:---:|:---:|:---:|:---:|:---:|
| Write without reducers | ✅ | ❌ | ✅ | ✅ | ✅ |
| Named global stores | ✅ | ✅ | ⚠️ manual | ❌ | ❌ |
| Write governance (PSR) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Built-in DevTools extension | ✅ | ✅ | ⚠️ limited | ❌ | ❌ |
| Computed / derived state | ✅ | ✅ | ⚠️ manual | ✅ | ✅ |
| Async data built-in | ✅ | ✅ RTK Query | ❌ | ⚠️ | ❌ |
| SSR / request isolation | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ |
| Ring-buffer event timeline | ✅ | ❌ | ❌ | ❌ | ❌ |
| Bundle size (core) | ~6kb | ~11kb | ~1kb | ~3kb | ~3kb |
| TypeScript-first | ✅ | ✅ | ✅ | ✅ | ✅ |

> ⚠️ = possible with extra setup · ❌ = not supported natively

**Stroid's unique position:** It is the only state library that lets you *govern* writes — validate, transform, or reject a state change before it commits — via PSR. This makes it uniquely suited for collaborative editing, optimistic UI, payment flows, and any domain where invalid state is expensive.

---

## 📚 Full API Reference

> 💡 **All examples use a food delivery app** — cart, profile, checkout, orders. Real code, no console.log.

---

### 1. Core — `stroid`

The foundation. Install and forget the rest until you need them.

#### `createStore`

Creates a named state container. Call once, usually at app start.

```ts
import { createStore } from "stroid";

createStore("cart", {
  items: [],
  total: 0,
});
// ✅ A "cart box" now exists — readable from anywhere.
```

---

#### `setStore`

Updates state at a path.

```ts
import { setStore } from "stroid";

setStore("cart", "total", 499);
// ✅ User added food — total is now 499.
```

---

#### `getStore`

Reads current state. Useful outside React components.

```ts
import { getStore } from "stroid";

const cartNow = getStore("cart");
// ✅ Checkout screen reads latest cart state.
```

---

#### `hasStore`

Checks whether a store has been created yet.

```ts
import { hasStore } from "stroid";

if (!hasStore("cart")) {
  createStore("cart", { items: [], total: 0 });
}
// ✅ Safe initialization guard.
```

---

#### `resetStore`

Returns a store to its original initial state.

```ts
import { resetStore } from "stroid";

resetStore("cart");
// ✅ Order placed — cart is clean again.
```

---

#### `deleteStore`

Fully removes a store and frees its memory.

```ts
import { deleteStore } from "stroid";

deleteStore("cart");
// ✅ User logged out — sensitive state removed.
```

---

#### `setStoreBatch`

Groups multiple writes into a single atomic update — subscribers fire once.

```ts
import { setStoreBatch, setStore } from "stroid";

setStoreBatch(() => {
  setStore("checkout", "coupon", "SAVE20");
  setStore("checkout", "deliveryType", "priority");
  setStore("checkout", "tip", 50);
});
// ✅ Three changes, one notification. No intermediate renders.
```

> **Why this matters:** Without batching, each `setStore` notifies subscribers separately — causing multiple re-renders. Batch for any multi-field update.

---

#### `hydrateStores`

Seeds multiple stores with server-provided data. Use during SSR handoff.

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
// ✅ Page opens with ready data — no loading flicker.
```

---

#### `configureStroid`

Sets global runtime behavior. Call once at app entry, before any store is created.

```ts
import { configureStroid } from "stroid";

configureStroid({
  asyncAutoCreate: false,       // don't auto-create stores on fetch
  strictMutatorReturns: true,   // warn if a mutator returns undefined
  defaultSnapshotMode: "deep",  // snapshot depth strategy
});
```

---

### 2. React Hooks — `stroid/react`

All hooks subscribe automatically. No manual cleanup needed.

---

#### `useStore`

Subscribes a component to an entire store. Re-renders on any change.

```tsx
import { useStore } from "stroid/react";

function CartPanel() {
  const cart = useStore("cart");
  return <div>{cart ? `${cart.items.length} items` : "Cart empty"}</div>;
}
// ✅ Re-renders whenever any part of cart changes.
```

---

#### `useSelector`

Subscribes to a computed slice. Re-renders only when the selected value changes.

```tsx
import { useSelector } from "stroid/react";

function CartTotal() {
  const total = useSelector("cart", (s: any) => s?.total ?? 0);
  return <strong>Rs. {total}</strong>;
}
// ✅ Only re-renders when `total` changes — not when items change.
```

> **Prefer `useSelector` over `useStore`** whenever you only need one field. It prevents unnecessary renders.

---

#### `useStoreField`

Subscribes to a single field by path. Simpler than a selector for direct reads.

```tsx
import { useStoreField } from "stroid/react";

function DeliveryTypeChip() {
  const deliveryType = useStoreField("checkout", "deliveryType");
  return <span>{deliveryType ?? "standard"}</span>;
}
```

---

#### `useStoreStatic`

Reads a snapshot of the store — does **not** subscribe. Use for one-time reads or debugging.

```tsx
import { useStoreStatic } from "stroid/react";

function DebugPanel() {
  const snapshot = useStoreStatic("cart");
  return <pre>{JSON.stringify(snapshot, null, 2)}</pre>;
}
// ✅ Component will NOT re-render when cart changes.
```

---

#### `useAsyncStore`

Fetches remote data and puts it into a store — with loading and error state.

```tsx
import { useAsyncStore } from "stroid/react";

function Menu() {
  const { loading, error, data } = useAsyncStore("menu", "https://api.example.com/menu");

  if (loading) return <p>Loading menu...</p>;
  if (error)   return <p>Failed to load menu</p>;
  return <MenuList items={data} />;
}
```

---

#### `useAsyncStoreSuspense`

Same as `useAsyncStore`, but throws a Promise — works with `<Suspense>`.

```tsx
import { useAsyncStoreSuspense } from "stroid/react";

function MenuSuspense() {
  const data = useAsyncStoreSuspense("menu", "https://api.example.com/menu");
  return <MenuList items={data} />;
}

// Wrap with:
// <Suspense fallback={<Spinner />}><MenuSuspense /></Suspense>
```

---

#### `useFormStore`

Manages form state in a named store — useful for shared or multi-step forms.

```tsx
import { useFormStore } from "stroid/react";

function LoginForm() {
  const form = useFormStore("loginForm", { email: "", password: "" });
  return (
    <button disabled={!form?.email || !form?.password}>
      Sign in
    </button>
  );
}
```

---

#### `RegistryScope`

Provides an isolated store registry for a subtree. Required for SSR and multi-tenant apps.

```tsx
import { RegistryScope } from "stroid/react";

function App({ registry }: { registry: any }) {
  return (
    <RegistryScope registry={registry}>
      <CartPanel />
      <ProfilePanel />
    </RegistryScope>
  );
}
// ✅ Each request/tenant gets its own store registry.
```

---

### 3. Selectors & Computed

Derived state — reads that recompute only when dependencies change.

#### `createSelector` — `stroid/selectors`

A memoized read function over a store.

```ts
import { createSelector } from "stroid/selectors";

const selectItemCount = createSelector(
  "cart",
  (s: any) => s?.items?.length ?? 0
);

// Use outside React:
const count = selectItemCount();
```

---

#### `subscribeWithSelector` — `stroid/selectors`

Run a side effect whenever a selected value changes. Returns an unsubscribe function.

```ts
import { subscribeWithSelector } from "stroid/selectors";

const stop = subscribeWithSelector(
  "cart",
  (s: any) => s?.total,
  Object.is,                     // equality check
  (next, prev) => {
    if (next > prev) showToast(`Price updated to Rs. ${next}`);
  }
);

// Later: stop() to unsubscribe
```

---

#### `createComputed` — `stroid/computed`

A reactive store whose value is derived from other stores.

```ts
import { createComputed } from "stroid/computed";

createComputed(
  "deliveryFee",
  ["cart"],                       // dependencies
  (cart: any) => ({
    value: (cart?.total ?? 0) > 1000 ? 0 : 60,
  })
);

// Use like any other store:
const fee = getStore("deliveryFee");
```

---

#### `invalidateComputed` / `deleteComputed` / `isComputedStore`

```ts
import { invalidateComputed, deleteComputed, isComputedStore } from "stroid/computed";

invalidateComputed("deliveryFee");   // force recompute on next read
deleteComputed("deliveryFee");       // remove computed store
isComputedStore("deliveryFee");      // → true
```

---

### 4. Async — `stroid/async`

Remote data fetching with built-in caching and revalidation.

```ts
import { fetchStore, refetchStore, enableRevalidateOnFocus } from "stroid/async";

// Fetch once
await fetchStore("menu", "https://api.example.com/menu");

// Re-fetch with same URL
await refetchStore("menu");

// Auto-refresh when user returns to tab
const stop = enableRevalidateOnFocus("menu");
```

---

### 5. PSR — Write Governance

> See the [**dedicated PSR section**](#-psr--write-governance) for the full story.

```ts
import { applyStorePatch, applyStorePatchesAtomic } from "stroid/psr";

// Single governed write
applyStorePatch({
  id: "cart-patch-1",
  store: "cart",
  path: ["total"],
  op: "set",
  value: 549,
  meta: { timestamp: Date.now(), source: "setStore" },
});

// Atomic multi-store write (all succeed or all roll back)
applyStorePatchesAtomic([
  { id: "a1", store: "wallet", path: ["balance"], op: "set", value: 900, meta: { timestamp: Date.now(), source: "setStore" } },
  { id: "a2", store: "order",  path: ["status"],  op: "set", value: "paid", meta: { timestamp: Date.now(), source: "setStore" } },
]);
```

---

### 6. Feature Install — Opt-In Capabilities

Call each once at app entry, before your components mount.

```ts
import { installPersist } from "stroid/persist";
import { installSync }    from "stroid/sync";
import { installDevtools } from "stroid/devtools";

installPersist();   // enables localStorage sync for marked stores
installSync();      // enables cross-tab state sync
installDevtools();  // connects the browser extension
```

> **None of these run unless you call them.** Stroid's core has zero overhead from features you don't install.

---

### 7. SSR — `stroid/server`

Each server request gets fully isolated state. No cross-request bleed.

```ts
import { createStoreForRequest } from "stroid/server";

// In your Next.js / Remix loader:
const requestScope = createStoreForRequest((api) => {
  api.create("session", { userId: "u-1" });
  api.create("cart",    { items: [], total: 0 });
});

const html = requestScope.hydrate(() => renderToString(<App />));
// html contains a <script> with the hydration payload
```

---

### 8. Helpers — `stroid/helpers`

Pre-built store shapes for common data patterns.

```ts
import { createEntityStore, createListStore, createCounterStore } from "stroid/helpers";

// Normalized entity map with upsert / remove
const users = createEntityStore<{ id?: string; name: string }>("users");
users.upsert({ id: "u1", name: "Asha" });
users.remove("u1");

// Ordered list with push / remove / clear
const tasks = createListStore("tasks", [] as string[]);
tasks.push("pick up order");
tasks.remove("pick up order");

// Counter with inc / dec / reset
const retries = createCounterStore("retries", 0);
retries.inc();
retries.dec();
retries.reset();
```

---

### 9. Testing — `stroid/testing`

Clean test isolation, mocks, and performance benchmarking.

```ts
import {
  createMockStore,
  resetAllStoresForTest,
  withMockedTime,
  benchmarkStoreSet,
} from "stroid/testing";

// Mock a store with controllable state
const mockOrder = createMockStore("order", { status: "draft" });
mockOrder.set({ status: "confirmed" });

// Reset everything between tests (call in afterEach)
afterEach(() => resetAllStoresForTest());

// Freeze time for timestamp-sensitive tests
withMockedTime(1700000000000, () => {
  // test logic — Date.now() returns 1700000000000
});

// Benchmark write performance (300 iterations)
const result = benchmarkStoreSet({ name: "cart" } as any, 300);
console.log(result.opsPerSecond);
```

---

### 10. Runtime Observability — `stroid/runtime-tools`

Inspect the live state of your entire store registry. Useful in DevTools, admin panels, and monitoring.

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

listStores();                     // ["cart", "profile", "checkout"]
getStoreMeta("cart");             // { created, keys, features, ... }
getMetrics("cart");               // { reads, writes, notifies, ... }
getSubscriberCount("cart");       // 4
getStoreHealth();                 // { healthy: true, coldStores: [], ... }
findColdStores();                 // stores with 0 subscribers
getComputedGraph();               // full computed dependency graph
getComputedDeps("deliveryFee");   // ["cart"]
getPersistQueueDepth("cart");     // pending persist writes
```

---

### 11. Runtime Admin — `stroid/runtime-admin`

Bulk operations for clearing stores. Use with caution in production.

```ts
import { clearAllStores, clearStores } from "stroid/runtime-admin";

clearAllStores();        // wipes every store
clearStores("cart*");    // wipes stores matching pattern
```

---

### 12. DevTools Bridge — `stroid/devtools`

Programmatic access to the DevTools event history from your code.

```ts
import { getHistory, clearHistory } from "stroid/devtools";

const cartHistory = getHistory("cart");
// → [ { op, path, value, timestamp }, ... ]

clearHistory("cart");
```

---

### 13. Plugin API — `stroid/feature`

Register custom store lifecycle hooks. Use to build logging, auditing, or analytics plugins.

```ts
import {
  registerStoreFeature,
  hasRegisteredStoreFeature,
  getRegisteredFeatureNames,
} from "stroid/feature";

registerStoreFeature("auditFeature", () => ({
  onStoreCreate(ctx) {
    // fires whenever any store is created
  },
  onStoreWrite(ctx) {
    // fires before every write
  },
}));

hasRegisteredStoreFeature("auditFeature");  // → true
getRegisteredFeatureNames();                // ["auditFeature"]
```

---

## 🛡️ PSR — Write Governance

PSR (**Pre-commit State Resolution**) is Stroid's most powerful feature — and has no equivalent on npm.

### The problem it solves

In a standard state library, writes go straight to the store. By the time you react, the invalid state has already committed — you're doing damage control, not prevention.

PSR intercepts every write **before** it commits. You can:
- ✅ Validate the new value against business rules
- ✅ Transform or normalize the value
- ✅ Reject the write entirely (with a reason)
- ✅ Defer the write for conflict resolution

### Where PSR makes the real difference

| Scenario | Without PSR | With PSR |
|---|---|---|
| Optimistic UI rollback | You undo after the fact | Write is governed at entry, rollback is structured |
| Collaborative editing | Conflicts resolved reactively | Writes are serialized and validated before commit |
| Payment / wallet state | You hope validators fire | No invalid write reaches the store |
| Write audit trail | You log after | Every write has a typed, structured `meta` |

### PSR API

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
} from "stroid/psr";

// Stable snapshot for diffing / conflict detection
const snapshot = getStoreSnapshot("cart");

// Subscribe outside React (analytics, sync adapters, etc.)
const stop = subscribeStore("cart", (next) => {
  analytics.track("cart_changed", next);
});

// Inspect the full store + computed dependency graph
const graph = getRuntimeGraph();

// Test a computed node against a hypothetical state
const trial = evaluateComputed("checkoutTotal", {
  cart: { items: [{ id: "pizza", qty: 2 }], total: 998 },
});

// Understand async/sync contract of a store's runtime path
const timing = getTimingContract("cart");
```

---

## 🔬 DevTools

Stroid DevTools is a browser extension (Chrome / Firefox) that gives you a live control room for your app's state.

**What it shows:**
- **Ring-buffer event timeline** — every state write in order, with path, value, and timestamp
- **Computed graph** — visual dependency map of your computed stores
- **Store health** — subscriber counts, cold stores, persist queue depth
- **PSR audit log** — every governed write with its `meta`

**Setup:**
1. Install the extension (link TBD — see [Releases](https://github.com/your-org/stroid-devtools/releases))
2. Add one line to your app entry:
   ```ts
   import { installDevtools } from "stroid/devtools";
   installDevtools();
   ```
3. Open browser DevTools → **Stroid** tab

> DevTools are a no-op in production unless you explicitly enable them. No bundle cost, no runtime overhead.

---

## 🍕 Real-World Examples

### Food delivery cart (the full picture)

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

createStore("cart",     { items: [], total: 0 });
createStore("checkout", { coupon: null, deliveryType: "standard", tip: 0 });
createStore("profile",  { name: "", address: "" });

// components/CartPanel.tsx
import { useSelector, useStoreField } from "stroid/react";

function CartPanel() {
  const total        = useSelector("cart", (s: any) => s?.total ?? 0);
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

### Atomic payment (wallet + order status together)

```ts
import { applyStorePatchesAtomic } from "stroid/psr";

async function confirmPayment(amount: number) {
  applyStorePatchesAtomic([
    {
      id: "pay-wallet",
      store: "wallet",
      path: ["balance"],
      op: "set",
      value: getStore("wallet").balance - amount,
      meta: { timestamp: Date.now(), source: "confirmPayment" },
    },
    {
      id: "pay-order",
      store: "order",
      path: ["status"],
      op: "set",
      value: "paid",
      meta: { timestamp: Date.now(), source: "confirmPayment" },
    },
  ]);
  // Both commit together — or neither does.
}
```

### Menu with Suspense

```tsx
import { Suspense } from "react";
import { useAsyncStoreSuspense } from "stroid/react";

function MenuList() {
  const menu = useAsyncStoreSuspense("menu", "https://api.example.com/menu");
  return <ul>{menu.map(item => <li key={item.id}>{item.name}</li>)}</ul>;
}

export function MenuPage() {
  return (
    <Suspense fallback={<p>Loading menu...</p>}>
      <MenuList />
    </Suspense>
  );
}
```

---

## 🧭 Learning Path

If you're just getting started, follow this order:

| Step | What to learn | Time |
|---|---|---|
| 1 | `createStore`, `setStore`, `getStore` | 5 min |
| 2 | `useStore`, `useSelector`, `useStoreField` | 10 min |
| 3 | `setStoreBatch`, `resetStore` | 5 min |
| 4 | `createSelector`, `createComputed` | 15 min |
| 5 | `fetchStore`, `useAsyncStore` | 10 min |
| 6 | `installPersist`, `installSync` | 10 min |
| 7 | PSR — `applyStorePatch`, `applyStorePatchesAtomic` | 20 min |
| 8 | SSR — `createStoreForRequest` | 15 min |

---

## 🤝 Contributing

We welcome contributions. See [**CONTRIBUTING.md**](./CONTRIBUTING.md) for:
- Monorepo structure and how packages relate
- Running tests locally
- The PR and review process
- Coding standards

---

## 📜 Changelog

See [**CHANGELOG.md**](./CHANGELOG.md) for the full version history and migration notes.

Breaking changes are always documented with a before/after table.

---

## 📄 License

MIT © Stroid Contributors

---

<div align="center">

**Made with care for developers who think about state seriously.**

[⭐ Star on GitHub](https://github.com/your-org/stroid) · [🐛 Report a bug](https://github.com/your-org/stroid/issues) · [💬 Discussions](https://github.com/your-org/stroid/discussions)

</div>