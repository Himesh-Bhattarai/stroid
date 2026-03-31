# Stroid Imports Explained Like a Real App

This guide teaches each import with simple, real-life examples.
No `console` calls. Just practical code and plain words.

Think of one app while reading:
A **food delivery app** with cart, user profile, checkout, and order sync.

If bundle size matters, prefer the narrowest public entrypoint that solves the job:
`stroid/core` for CRUD, `stroid/query` for cache keys, direct feature modules for installers, and `stroid/runtime-tools` for observability.

---

## 1) Core from `stroid`

### `createStore`
Use this when you want to create a new state container.

```ts
import { createStore } from "stroid";

createStore("cart", {
  items: [],
  total: 0,
});
```

Real meaning: you created a “cart box” where cart data lives.

### `setStore`
Use this to update state.

```ts
import { setStore } from "stroid";

setStore("cart", "total", 499);
```

Real meaning: user added food, total changed to 499.

### `getStore`
Use this to read current state.

```ts
import { getStore } from "stroid";

const cartNow = getStore("cart");
```

Real meaning: checkout screen reads latest cart.

### `hasStore`
Use this to check if a store exists.

```ts
import { hasStore } from "stroid";

const cartExists = hasStore("cart");
```

Real meaning: if `false`, cart was not created yet.

### `resetStore`
Use this to return a store to initial state.

```ts
import { resetStore } from "stroid";

resetStore("cart");
```

Real meaning: order placed, cart becomes clean again.

### `deleteStore`
Use this to fully remove a store.

```ts
import { deleteStore } from "stroid";

deleteStore("cart");
```

Real meaning: user logged out, remove sensitive temporary state.

### `setStoreBatch`
Use this when many updates should happen together.

```ts
import { setStoreBatch, setStore } from "stroid";

setStoreBatch(() => {
  setStore("checkout", "coupon", "SAVE20");
  setStore("checkout", "deliveryType", "priority");
  setStore("checkout", "tip", 50);
});
```

Real meaning: one user action updates many fields together.

### `hydrateStores`
Use this when server already has data and client should start with it.

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

Real meaning: page opens with ready data, no empty flicker.

---

## 2) Native PSR from `stroid/psr`

Use this when you need advanced runtime control, patching, and observability.

### `getStoreSnapshot`

```ts
import { getStoreSnapshot } from "stroid/psr";

const snapshot = getStoreSnapshot("cart");
```

Real meaning: take a stable picture of current store state.

### `subscribeStore`

```ts
import { subscribeStore } from "stroid/psr";

const stopWatchingCart = subscribeStore("cart", (next) => {
  // example: trigger non-React analytics adapter here
});
```

Real meaning: run custom side code whenever cart changes.

### `applyStorePatch`

```ts
import { applyStorePatch } from "stroid/psr";

applyStorePatch({
  id: "cart-patch-1",
  store: "cart",
  path: ["total"],
  op: "set",
  value: 549,
  meta: { timestamp: Date.now(), source: "setStore" },
});
```

Real meaning: apply one structured change safely.

### `applyStorePatchesAtomic`

```ts
import { applyStorePatchesAtomic } from "stroid/psr";

applyStorePatchesAtomic([
  {
    id: "a1",
    store: "wallet",
    path: ["balance"],
    op: "set",
    value: 900,
    meta: { timestamp: Date.now(), source: "setStore" },
  },
  {
    id: "a2",
    store: "order",
    path: ["status"],
    op: "set",
    value: "paid",
    meta: { timestamp: Date.now(), source: "setStore" },
  },
]);
```

Real meaning: both updates happen as one safe unit.

### `getRuntimeGraph`

```ts
import { getRuntimeGraph } from "stroid/psr";

const graph = getRuntimeGraph();
```

Real meaning: inspect how stores/computed nodes connect.

### `getComputedDescriptor`

```ts
import { getComputedDescriptor } from "stroid/psr";

const descriptor = getComputedDescriptor("checkoutTotal");
```

Real meaning: ask runtime details about one computed node.

### `evaluateComputed`

```ts
import { evaluateComputed } from "stroid/psr";

const trial = evaluateComputed("checkoutTotal", {
  cart: { items: [{ id: "pizza", qty: 2 }], total: 998 },
});
```

Real meaning: test computed output on a custom snapshot.

### `getTimingContract`

```ts
import { getTimingContract } from "stroid/psr";

const timing = getTimingContract("cart");
```

Real meaning: learn sync/async behavior contract of runtime path.

---

## 3) Minimal core from `stroid/core`

Use this when you want smallest API surface.

```ts
import { createStore } from "stroid/core";
import { setStore } from "stroid/core";
import { getStore } from "stroid/core";
import { hasStore } from "stroid/core";
import { resetStore } from "stroid/core";
import { deleteStore } from "stroid/core";
```

Real meaning: same basics, lighter entrypoint.

---

## 4) React from `stroid/react`

### `useStore`

```tsx
import { useStore } from "stroid/react";

function CartPanel() {
  const cart = useStore("cart");
  return <div>{cart ? "Cart loaded" : "No cart yet"}</div>;
}
```

Real meaning: component re-renders when cart changes.

### `useSelector`

```tsx
import { useSelector } from "stroid/react";

function CartTotal() {
  const total = useSelector("cart", (s: any) => s?.total ?? 0);
  return <strong>Rs. {total}</strong>;
}
```

Real meaning: component listens only to selected piece.

### `useStoreField`

```tsx
import { useStoreField } from "stroid/react";

function DeliveryTypeChip() {
  const deliveryType = useStoreField("checkout", "deliveryType");
  return <span>{deliveryType ?? "standard"}</span>;
}
```

Real meaning: direct path read with subscription.

### `useStoreStatic`

```tsx
import { useStoreStatic } from "stroid/react";

function Summary() {
  const snapshot = useStoreStatic("cart");
  return <pre>{JSON.stringify(snapshot, null, 2)}</pre>;
}
```

Real meaning: read snapshot directly in component context.

### `useAsyncStore`

```tsx
import { useAsyncStore } from "stroid/react";

function Menu() {
  const asyncState = useAsyncStore("menu", "https://api.example.com/menu");
  if (asyncState?.loading) return <p>Loading menu...</p>;
  if (asyncState?.error) return <p>Failed to load</p>;
  return <p>Menu ready</p>;
}
```

### `useFormStore`

```tsx
import { useFormStore } from "stroid/react";

function LoginForm() {
  const form = useFormStore("loginForm", { email: "", password: "" });
  return <button disabled={!form}>Sign in</button>;
}
```

### `useAsyncStoreSuspense`

```tsx
import { useAsyncStoreSuspense } from "stroid/react";

function MenuSuspense() {
  const data = useAsyncStoreSuspense("menu", "https://api.example.com/menu");
  return <p>{data ? "Loaded with suspense" : ""}</p>;
}
```

### `RegistryScope`

```tsx
import { RegistryScope } from "stroid/react";

function AppWithScope({ registry, children }: any) {
  return <RegistryScope registry={registry}>{children}</RegistryScope>;
}
```

Real meaning: isolate store runtime per scope/request.

---

## 5) Async from `stroid/async`

### `fetchStore`

```ts
import { fetchStore } from "stroid/async";

await fetchStore("menu", "https://api.example.com/menu");
```

Real meaning: fetch remote data into store-managed async state.

### `refetchStore`

```ts
import { refetchStore } from "stroid/async";

await refetchStore("menu");
```

Real meaning: rerun last fetch recipe.

### `enableRevalidateOnFocus`

```ts
import { enableRevalidateOnFocus } from "stroid/async";

const stopAutoRefresh = enableRevalidateOnFocus("menu");
```

Real meaning: when user returns to tab, data refreshes.

---

## 6) Selectors and Computed

### `createSelector`

```ts
import { createSelector } from "stroid/selectors";

const selectItemCount = createSelector("cart", (s: any) => s?.items?.length ?? 0);
```

Real meaning: derived read, optimized.

### `subscribeWithSelector`

```ts
import { subscribeWithSelector } from "stroid/selectors";

const stop = subscribeWithSelector(
  "cart",
  (s: any) => s?.total,
  Object.is,
  (next, prev) => {
    // example: trigger UI toast when price changes
  }
);
```

### `createComputed`

```ts
import { createComputed } from "stroid/computed";

createComputed("deliveryFee", ["cart"], (cart: any) => {
  const base = cart?.total ?? 0;
  return { value: base > 1000 ? 0 : 60 };
});
```

### `invalidateComputed`

```ts
import { invalidateComputed } from "stroid/computed";

invalidateComputed("deliveryFee");
```

### `deleteComputed`

```ts
import { deleteComputed } from "stroid/computed";

deleteComputed("deliveryFee");
```

### `isComputedStore`

```ts
import { isComputedStore } from "stroid/computed";

const isComputed = isComputedStore("deliveryFee");
```

---

## 7) Query keys from `stroid/query`

Use this when you need stable TanStack Query or SWR keys without importing the heavier fetcher helpers.

### `reactQueryKey`

```ts
import { reactQueryKey } from "stroid/query";

const key = reactQueryKey("cart");
```

### `swrKey`

```ts
import { swrKey } from "stroid/query";

const key = swrKey("cart", "summary");
```

Real meaning: query libraries can share the same cache key shape without dragging in async runtime code.

---

## 8) Feature install (call once at app entry)

```ts
import { installPersist } from "stroid/persist";
installPersist();
```

```ts
import { installSync } from "stroid/sync";
installSync();
```

```ts
import { installDevtools } from "stroid/devtools";
installDevtools();
```

Real meaning: enable optional capabilities one time during app startup.

---

## 9) Server / SSR from `stroid/server`

```ts
import { createStoreForRequest } from "stroid/server";

const requestScope = createStoreForRequest((api) => {
  api.create("session", { userId: "u-1" });
});

const html = requestScope.hydrate(() => "<html>...</html>");
```

Real meaning: each request gets isolated store state.

---

## 10) Helpers from `stroid/helpers`

### `createEntityStore`

```ts
import { createEntityStore } from "stroid/helpers";

const users = createEntityStore<{ id?: string; name: string }>("users");
users.upsert({ id: "u1", name: "Asha" });
```

### `createListStore`

```ts
import { createListStore } from "stroid/helpers";

const tasks = createListStore("tasks", ["wash veggies"] as string[]);
tasks.push("cook momo");
```

### `createCounterStore`

```ts
import { createCounterStore } from "stroid/helpers";

const itemCount = createCounterStore("itemCount", 0);
itemCount.inc();
```

---

## 11) Testing from `stroid/testing`

### `createMockStore`

```ts
import { createMockStore } from "stroid/testing";

const mockOrder = createMockStore("mockOrder", { status: "draft" });
mockOrder.set({ status: "confirmed" });
```

### `resetAllStoresForTest`

```ts
import { resetAllStoresForTest } from "stroid/testing";

resetAllStoresForTest();
```

### `withMockedTime`

```ts
import { withMockedTime } from "stroid/testing";

withMockedTime(1700000000000, () => {
  // time-sensitive test logic
});
```

### `benchmarkStoreSet`

```ts
import { benchmarkStoreSet } from "stroid/testing";

const result = benchmarkStoreSet({ name: "cart" } as any, 300);
```

---

## 12) Runtime observability from `stroid/runtime-tools`

Import only the helpers you use. The internal runtime-tools helpers are grouped by concern, but the published multi-entry build still shares runtime chunks, so current bundle wins here are limited.

### `listStores`

```ts
import { listStores } from "stroid/runtime-tools";

const storeNames = listStores();
```

### `getStoreMeta`

```ts
import { getStoreMeta } from "stroid/runtime-tools";

const cartMeta = getStoreMeta("cart");
```

### `getMetrics`

```ts
import { getMetrics } from "stroid/runtime-tools";

const cartMetrics = getMetrics("cart");
```

### `getSubscriberCount`

```ts
import { getSubscriberCount } from "stroid/runtime-tools";

const cartSubs = getSubscriberCount("cart");
```

### `getStoreHealth`

```ts
import { getStoreHealth } from "stroid/runtime-tools";

const health = getStoreHealth();
```

### `findColdStores`

```ts
import { findColdStores } from "stroid/runtime-tools";

const cold = findColdStores();
```

### `getComputedGraph`

```ts
import { getComputedGraph } from "stroid/runtime-tools";

const graph = getComputedGraph();
```

### `getComputedDeps`

```ts
import { getComputedDeps } from "stroid/runtime-tools";

const deps = getComputedDeps("deliveryFee");
```

### `getPersistQueueDepth`

```ts
import { getPersistQueueDepth } from "stroid/runtime-tools";

const pendingPersist = getPersistQueueDepth("cart");
```

---

## 13) Runtime admin from `stroid/runtime-admin`

### `clearAllStores`

```ts
import { clearAllStores } from "stroid/runtime-admin";

clearAllStores();
```

### `clearStores`

```ts
import { clearStores } from "stroid/runtime-admin";

clearStores("cart*");
```

---

## 14) Devtools API from `stroid/devtools`

### `getHistory`

```ts
import { getHistory } from "stroid/devtools";

const cartHistory = getHistory("cart");
```

### `clearHistory`

```ts
import { clearHistory } from "stroid/devtools";

clearHistory("cart");
```

---

## 15) Config

### `configureStroid` from `stroid`

```ts
import { configureStroid } from "stroid";

configureStroid({
  asyncAutoCreate: false,
  strictMutatorReturns: true,
  defaultSnapshotMode: "deep",
});
```

Real meaning: set global runtime behavior once at startup.

---

## 16) Feature plugin API from `stroid/feature`

### `registerStoreFeature`

```ts
import { registerStoreFeature } from "stroid/feature";

registerStoreFeature("auditFeature", () => ({
  onStoreCreate(ctx) {
    // custom behavior when any store is created
  },
}));
```

### `hasRegisteredStoreFeature`

```ts
import { hasRegisteredStoreFeature } from "stroid/feature";

const installed = hasRegisteredStoreFeature("auditFeature");
```

### `getRegisteredFeatureNames`

```ts
import { getRegisteredFeatureNames } from "stroid/feature";

const allFeatures = getRegisteredFeatureNames();
```

---

## Final Simple Rule

Start small:
1. `createStore`
2. `setStore`
3. `getStore`
4. React hooks (`useStore`, `useSelector`)
5. Add async/persist/sync only when needed

That is the easiest path from beginner to production.
