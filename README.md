# Stroid

[![npm](https://img.shields.io/npm/v/stroid)](https://www.npmjs.com/package/stroid)
[![npm downloads](https://img.shields.io/npm/dm/stroid)](https://www.npmjs.com/package/stroid)
[![bundle size](https://img.shields.io/bundlephobia/minzip/stroid)](https://bundlephobia.com/package/stroid)
[![types](https://img.shields.io/npm/types/stroid)](https://www.npmjs.com/package/stroid)
[![license](https://img.shields.io/npm/l/stroid)](https://github.com/Himesh-Bhattarai/stroid/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/Himesh-Bhattarai/stroid/ci.yml?branch=main)](https://github.com/Himesh-Bhattarai/stroid/actions)
[![issues](https://img.shields.io/github/issues/Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid/issues)
[![stars](https://img.shields.io/github/stars/Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid)
[![forks](https://img.shields.io/github/forks/Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid)
[![contributors](https://img.shields.io/github/contributors/Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid/graphs/contributors)
[![last commit](https://img.shields.io/github/last-commit/Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid/commits/main)
[![commit activity](https://img.shields.io/github/commit-activity/m/Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid/commits/main)
[![code size](https://img.shields.io/github/languages/code-size/Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid)
[![node](https://img.shields.io/node/v/stroid)](https://www.npmjs.com/package/stroid)

Stroid is a named-store state library for JavaScript and React. Core stays small; optional layers unlock persist, async caching, sync, and devtools.

> **Note:** The `main` branch is reserved for releases and is locked between publishes. Current development happens on the `dev` branch. Please target PRs, pulls, and forks to the active development branch.

> **Commits:** We prefer [STATUS-based commit messages](CONTRIBUTING.md)(STATUS.md) to maintain a clean, narrative, and high-quality git history.

## Table of Contents

- [Install](#install)
- [Minimal Usage](#minimal-usage)
- [Module Imports](#module-imports)
- [Stroid At a Glance](#stroid-at-a-glance)
- [Public API Index](#public-api-index)
- [Subpath API Index](#subpath-api-index)
- [Options Index](#options-index)
- [Types Index](#types-index)
- [Behavior Notes](#behavior-notes)
- [Short Recipes](#short-recipes)
- [Docs](#docs)
- [Docs Index (Full)](#docs-index-full)
- [Changelog and License](#changelog-and-license)

## Install

```bash
npm install stroid
```

## Minimal Usage

```ts
import { createStore, getStore, setStore } from "stroid";

createStore("counter", { count: 0 });
setStore("counter", "count", 1);

console.log(getStore("counter"));
```

## Module Imports

Core (root) entry:

```ts
import { createStore, setStore, getStore } from "stroid";
```

Subpath modules:

```ts
import { useStore } from "stroid/react";
import { fetchStore } from "stroid/async";
import { createSelector } from "stroid/selectors";
import { createComputed } from "stroid/computed";
import { createEntityStore } from "stroid/helpers";
import { createMockStore } from "stroid/testing";
import { listStores } from "stroid/runtime-tools";
import { clearAllStores } from "stroid/runtime-admin";
import { createStoreForRequest } from "stroid/server";
```

Feature registration (side-effect imports):

```ts
import "stroid/persist";
import "stroid/sync";
import "stroid/devtools";
```

## Stroid At a Glance

Core API:
- createStore, createStoreStrict, setStore, setStoreBatch, getStore, deleteStore, resetStore, hasStore, hydrateStores
- store(name) and namespace(ns) helpers for typed handles
- createComputed, invalidateComputed, deleteComputed, isComputedStore
- configureStroid and queryIntegrations helpers

Runtime layers:
- stroid/react: useStore, useStoreField, useSelector, useStoreStatic, useAsyncStore, useFormStore, useAsyncStoreSuspense
- stroid/async: fetchStore, refetchStore, enableRevalidateOnFocus, getAsyncMetrics
- stroid/selectors: createSelector, subscribeWithSelector

Store-attached features (side-effect imports):
- stroid/persist
- stroid/sync
- stroid/devtools

Operational tools:
- stroid/runtime-tools
- stroid/runtime-admin
- stroid/server
- stroid/helpers
- stroid/testing
- stroid/computed

## Public API Index

Root export names (stroid and stroid/core):
- `createStore(name, initialState, options?)`
- `createStoreStrict(name, initialState, options?)`
- `setStore(nameOrHandle, updateOrPath, value?)`
- `setStoreBatch(fn)`
- `getStore(nameOrHandle, path?)`
- `deleteStore(nameOrHandle)`
- `resetStore(nameOrHandle)`
- `hasStore(nameOrHandle)`
- `hydrateStores(snapshot, options?, trustOptions?)`
- `store(name)`
- `namespace(ns)`
- `createComputed(name, deps, compute, options?)`
- `invalidateComputed(name)`
- `deleteComputed(name)`
- `isComputedStore(name)`
- `configureStroid(config)`
- `queryIntegrations (reactQueryKey, createReactQueryFetcher, swrKey, createSwrFetcher)`

Root exported types:
- `Path`
- `PathValue`
- `PartialDeep`
- `StoreDefinition`
- `StoreValue`
- `StoreKey`
- `StoreName`
- `StateFor`
- `StoreStateMap`
- `StrictStoreMap`
- `WriteResult`
- `PersistOptions`
- `StoreOptions`
- `SyncOptions`

## Subpath API Index

### stroid/react

- `useStore`
- `useStoreField`
- `useSelector`
- `useStoreStatic`
- `useAsyncStore`
- `useFormStore`
- `useAsyncStoreSuspense`

### stroid/async

- `fetchStore`
- `refetchStore`
- `enableRevalidateOnFocus`
- `getAsyncMetrics`
- `_resetAsyncStateForTests`
- `FetchOptions (type)`
- `FetchInput (type)`
- `AsyncStateSnapshot (type)`
- `AsyncStateAdapter (type)`

### stroid/selectors

- `createSelector`
- `subscribeWithSelector`

### stroid/computed

- `createComputed`
- `invalidateComputed`
- `deleteComputed`
- `isComputedStore`
- `_resetComputedForTests`
- `getFullComputedGraph`
- `getComputedDepsFor`

### stroid/helpers

- `createCounterStore`
- `createListStore`
- `createEntityStore`

### stroid/testing

- `createMockStore`
- `withMockedTime`
- `resetAllStoresForTest`
- `benchmarkStoreSet`

### stroid/runtime-tools

- `listStores`
- `getStoreMeta`
- `getInitialState`
- `getMetrics`
- `getSubscriberCount`
- `getAsyncInflightCount`
- `getPersistQueueDepth`
- `getComputedGraph`
- `getComputedDeps`

### stroid/runtime-admin

- `clearAllStores`
- `clearStores`

### stroid/server

- `createStoreForRequest`

### stroid/persist

- `side-effect only (registers persistence feature)`

### stroid/sync

- `side-effect only (registers sync feature)`

### stroid/devtools

- `side-effect only (registers devtools feature)`

## Behavior Notes

- Feature layers are explicit: persist, sync, and devtools require side-effect imports.
- Default store scope is request; global stores must be opted in.
- Snapshot mode defaults to deep cloning for subscriptions and selector snapshots.
- hydrateStores requires trust options; use allowUntrusted or validate for SSR data.
- fetchStore writes the AsyncStateSnapshot shape by default unless stateAdapter is provided.
- Auto-create for fetchStore is controlled by FetchOptions.autoCreate or global config.
- Persist defaults to localStorage when enabled in the browser.
- Sync uses BroadcastChannel and warns if unavailable.
- Computed deps can be store names or handles; missing deps yield null until created.
- Store option validate replaces legacy schema and validator options.

## Short Recipes

### Create and update a store

```ts
import { createStore, setStore, getStore } from "stroid";

createStore("profile", { name: "Ava", age: 30 });
setStore("profile", "age", 31);

console.log(getStore("profile"));
```

### Use a typed store handle

```ts
import { createStore, store, setStore, getStore } from "stroid";

const counter = store<"counter", { count: number }>("counter");
createStore("counter", { count: 0 });
setStore(counter, (draft) => { draft.count += 1; });

console.log(getStore(counter, "count"));
```

### Batch multiple writes

```ts
import { setStoreBatch, setStore } from "stroid";

setStoreBatch(() => {
  setStore("a", { value: 1 });
  setStore("b", { value: 2 });
});
```

### Path updates with strict keys

```ts
import { createStore, setStore } from "stroid";

createStore("user", { profile: { name: "Ava" } });
setStore("user", "profile.name", "Kai");
```

### Path updates with pathCreate

```ts
import { createStore, setStore } from "stroid";

createStore("user", { profile: { name: "Ava" } }, { pathCreate: true });
setStore("user", "profile.age", 32);
```

### React hooks

```ts
import { useStore } from "stroid/react";

function Counter() {
  const state = useStore("counter");
  return <div>{state?.count ?? 0}</div>;
}
```

### Selectors

```ts
import { createSelector } from "stroid/selectors";

const selectName = createSelector("profile", (state) => state.name);
console.log(selectName());
```

### Computed stores

```ts
import { createComputed } from "stroid/computed";

createComputed("total", ["cart"], (cart) => {
  return cart ? cart.items.reduce((sum, item) => sum + item.price, 0) : 0;
});
```

### Persisted store

```ts
import { createStore } from "stroid";
import "stroid/persist";

createStore("prefs", { theme: "dark" }, {
  persist: { key: "prefs", allowPlaintext: true },
});
```

### Sync across tabs

```ts
import { createStore } from "stroid";
import "stroid/sync";

createStore("shared", { value: 0 }, { sync: true });
```

### Async fetch store

```ts
import { createStore } from "stroid";
import { fetchStore } from "stroid/async";

createStore("user", { data: null, loading: false, error: null, status: "idle" });
fetchStore("user", "/api/user");
```

### Async fetch with adapter

```ts
import { fetchStore } from "stroid/async";

fetchStore("user", "/api/user", {
  stateAdapter: ({ next, set }) => set({ user: next.data, status: next.status }),
});
```

### SSR request scope

```ts
import { createStoreForRequest } from "stroid/server";

const requestStore = createStoreForRequest(({ create, set }) => {
  create("session", { id: null });
  set("session", (draft) => { draft.id = "abc"; });
});

requestStore.hydrate(() => renderApp());
```

### Helpers

```ts
import { createEntityStore } from "stroid/helpers";

const users = createEntityStore("users");
users.upsert({ id: "1", name: "Ava" });
console.log(users.get("1"));
```

### Runtime inspection

```ts
import { listStores, getMetrics } from "stroid/runtime-tools";

const names = listStores();
const metrics = getMetrics(names[0]);
console.log(metrics);
```

### Runtime cleanup

```ts
import { clearAllStores } from "stroid/runtime-admin";

clearAllStores();
```

### React Query integration

```ts
import { queryIntegrations } from "stroid";

const key = queryIntegrations.reactQueryKey("user", 1);
const fetcher = queryIntegrations.createReactQueryFetcher("user", "/api/user");

console.log(key, fetcher);
```

## Docs

Quick links:
- [Book Contents](docs/FRONT_MATTER/CONTENTS.md)
- [Start Here](docs/BODY_MATTER/BEGINNER_GUIDE/START_HERE.md)
- [Install and Imports](docs/BODY_MATTER/BEGINNER_GUIDE/INSTALL_AND_IMPORTS.md)
- [Core of Stroid](docs/BODY_MATTER/CORE_OF_STROID/INTRODUCTION.md)
- [React Layer](docs/BODY_MATTER/REACT_OF_STROID/INTRODUCTION.md)
- [Async Layer](docs/BODY_MATTER/ASYNC_OF_STROID/INTRODUCTION.md)
- [Persistence](docs/BODY_MATTER/PERSIST_OF_STROID/INTRODUCTION.md)
- [Sync](docs/BODY_MATTER/SYNC_OF_STROID/INTRODUCTION.md)
- [Runtime Operations](docs/BODY_MATTER/RUNTIME_OPERATIONS_OF_STROID/INTRODUCTION.md)
- [Server and SSR](docs/BODY_MATTER/SERVER_OF_STROID/INTRODUCTION.md)
- [Helpers](docs/BODY_MATTER/HELPERS_AND_CHAIN_OF_STROID/INTRODUCTION.md)
- [Testing](docs/BODY_MATTER/TESTING_OF_STROID/INTRODUCTION.md)
- [Selectors](docs/BODY_MATTER/SELECTORS_OF_STROID/INTRODUCTION.md)
- [Devtools](docs/BODY_MATTER/DEVTOOLS_OF_STROID/INTRODUCTION.md)

## Docs Index (Full)

### Architecture

- [Architecture](docs/ARCHITECTURE/ARCHITECTURE.md)

### Back Matter

- [Appendices](docs/BACK_MATTER/APPENDICES.md)
- [Back Cover](docs/BACK_MATTER/BACK_COVER.md)
- [Bibliography](docs/BACK_MATTER/Bibliography.md)
- [Colophon](docs/BACK_MATTER/Colophon.md)
- [Contact Information](docs/BACK_MATTER/Contact_Information.md)

### Body Matter

- [Back Cover](docs/BODY_MATTER/BACK_COVER.md)

### Body Matter - Async Of Stroid

- [Cache And Revalidation](docs/BODY_MATTER/ASYNC_OF_STROID/CACHE_AND_REVALIDATION.md)
- [Fetch Flow](docs/BODY_MATTER/ASYNC_OF_STROID/FETCH_FLOW.md)
- [Introduction](docs/BODY_MATTER/ASYNC_OF_STROID/INTRODUCTION.md)
- [Real Use](docs/BODY_MATTER/ASYNC_OF_STROID/REAL_USE.md)

### Body Matter - Beginner Guide

- [First Store](docs/BODY_MATTER/BEGINNER_GUIDE/FIRST_STORE.md)
- [From Basic To Real](docs/BODY_MATTER/BEGINNER_GUIDE/FROM_BASIC_TO_REAL.md)
- [Install And Imports](docs/BODY_MATTER/BEGINNER_GUIDE/INSTALL_AND_IMPORTS.md)
- [React Usage](docs/BODY_MATTER/BEGINNER_GUIDE/REACT_USAGE.md)
- [Start Here](docs/BODY_MATTER/BEGINNER_GUIDE/START_HERE.md)

### Body Matter - Binary To Being

- [Async Layer](docs/BODY_MATTER/BINARY_TO_BEING/ASYNC_LAYER.md)
- [Design Principles Of Stroid](docs/BODY_MATTER/BINARY_TO_BEING/DESIGN_PRINCIPLES_OF_STROID.md)
- [Persistence Layer](docs/BODY_MATTER/BINARY_TO_BEING/PERSISTENCE_LAYER.md)
- [Production Patterns](docs/BODY_MATTER/BINARY_TO_BEING/PRODUCTION_PATTERNS.md)
- [React Bindings](docs/BODY_MATTER/BINARY_TO_BEING/REACT_BINDINGS.md)
- [Runtime Architecture](docs/BODY_MATTER/BINARY_TO_BEING/RUNTIME_ARCHITECTURE.md)
- [Selectors](docs/BODY_MATTER/BINARY_TO_BEING/SELECTORS.md)
- [Store System](docs/BODY_MATTER/BINARY_TO_BEING/STORE_SYSTEM.md)
- [Tooling And Debugging](docs/BODY_MATTER/BINARY_TO_BEING/TOOLING_AND_DEBUGGING.md)
- [Why State Management Fails In Large Apps](docs/BODY_MATTER/BINARY_TO_BEING/WHY_STATE_MANAGEMENT_FAILS_IN_LARGE_APPS.md)

### Body Matter - Bug As Helper

- [Intentional Bugs](docs/BODY_MATTER/BUG_AS_HELPER/INTENTIONAL_BUGS.md)
- [Introduction](docs/BODY_MATTER/BUG_AS_HELPER/INTRODUCTION.md)
- [No Need To Fix](docs/BODY_MATTER/BUG_AS_HELPER/NO_NEED_TO_FIX.md)
- [Real Use](docs/BODY_MATTER/BUG_AS_HELPER/REAL_USE.md)

### Body Matter - Core Of Stroid

- [Core Options](docs/BODY_MATTER/CORE_OF_STROID/CORE_OPTIONS.md)
- [Example](docs/BODY_MATTER/CORE_OF_STROID/EXAMPLE.md)
- [Introduction](docs/BODY_MATTER/CORE_OF_STROID/INTRODUCTION.md)
- [Real Use](docs/BODY_MATTER/CORE_OF_STROID/REAL_USE.md)

### Body Matter - Devtools Of Stroid

- [History And Redaction](docs/BODY_MATTER/DEVTOOLS_OF_STROID/HISTORY_AND_REDACTION.md)
- [Introduction](docs/BODY_MATTER/DEVTOOLS_OF_STROID/INTRODUCTION.md)
- [Real Use](docs/BODY_MATTER/DEVTOOLS_OF_STROID/REAL_USE.md)
- [Redux Devtools And Boundaries](docs/BODY_MATTER/DEVTOOLS_OF_STROID/REDUX_DEVTOOLS_AND_BOUNDARIES.md)

### Body Matter - Helpers And Chain Of Stroid

- [Chain Api](docs/BODY_MATTER/HELPERS_AND_CHAIN_OF_STROID/CHAIN_API.md)
- [Helper Factories](docs/BODY_MATTER/HELPERS_AND_CHAIN_OF_STROID/HELPER_FACTORIES.md)
- [Introduction](docs/BODY_MATTER/HELPERS_AND_CHAIN_OF_STROID/INTRODUCTION.md)
- [Real Use](docs/BODY_MATTER/HELPERS_AND_CHAIN_OF_STROID/REAL_USE.md)

### Body Matter - Opt In Features Of Stroid

- [Introduction](docs/BODY_MATTER/OPT_IN_FEATURES_OF_STROID/INTRODUCTION.md)
- [Power Tools](docs/BODY_MATTER/OPT_IN_FEATURES_OF_STROID/POWER_TOOLS.md)
- [Runtime Layers](docs/BODY_MATTER/OPT_IN_FEATURES_OF_STROID/RUNTIME_LAYERS.md)
- [Store Features](docs/BODY_MATTER/OPT_IN_FEATURES_OF_STROID/STORE_FEATURES.md)

### Body Matter - Persist Of Stroid

- [Failure And Recovery](docs/BODY_MATTER/PERSIST_OF_STROID/FAILURE_AND_RECOVERY.md)
- [Introduction](docs/BODY_MATTER/PERSIST_OF_STROID/INTRODUCTION.md)
- [Real Use](docs/BODY_MATTER/PERSIST_OF_STROID/REAL_USE.md)
- [Storage And Migrations](docs/BODY_MATTER/PERSIST_OF_STROID/STORAGE_AND_MIGRATIONS.md)

### Body Matter - Philosophy Of Stroid

- [Minimal Abstraction](docs/BODY_MATTER/PHILOSOPHY_OF_STROID/MINIMAL_ABSTRACTION.md)
- [Optional Complexity And Comparison](docs/BODY_MATTER/PHILOSOPHY_OF_STROID/OPTIONAL_COMPLEXITY_AND_COMPARISON.md)
- [Predictable State Mutation](docs/BODY_MATTER/PHILOSOPHY_OF_STROID/PREDICTABLE_STATE_MUTATION.md)
- [Runtime Observability](docs/BODY_MATTER/PHILOSOPHY_OF_STROID/RUNTIME_OBSERVABILITY.md)
- [Why The Mind Needs Structure](docs/BODY_MATTER/PHILOSOPHY_OF_STROID/WHY_THE_MIND_NEEDS_STRUCTURE.md)

### Body Matter - React Of Stroid

- [Form And Async](docs/BODY_MATTER/REACT_OF_STROID/FORM_AND_ASYNC.md)
- [Hooks](docs/BODY_MATTER/REACT_OF_STROID/HOOKS.md)
- [Introduction](docs/BODY_MATTER/REACT_OF_STROID/INTRODUCTION.md)
- [Real Use](docs/BODY_MATTER/REACT_OF_STROID/REAL_USE.md)

### Body Matter - Roadmap Of Stroid

- [Roadmap](docs/BODY_MATTER/ROADMAP_OF_STROID/ROADMAP.md)

### Body Matter - Runtime Operations Of Stroid

- [Admin Operations](docs/BODY_MATTER/RUNTIME_OPERATIONS_OF_STROID/ADMIN_OPERATIONS.md)
- [Inspection Tools](docs/BODY_MATTER/RUNTIME_OPERATIONS_OF_STROID/INSPECTION_TOOLS.md)
- [Introduction](docs/BODY_MATTER/RUNTIME_OPERATIONS_OF_STROID/INTRODUCTION.md)
- [Real Use](docs/BODY_MATTER/RUNTIME_OPERATIONS_OF_STROID/REAL_USE.md)

### Body Matter - Selectors Of Stroid

- [Create Selector](docs/BODY_MATTER/SELECTORS_OF_STROID/CREATE_SELECTOR.md)
- [Introduction](docs/BODY_MATTER/SELECTORS_OF_STROID/INTRODUCTION.md)
- [Real Use](docs/BODY_MATTER/SELECTORS_OF_STROID/REAL_USE.md)
- [Subscribe With Selector](docs/BODY_MATTER/SELECTORS_OF_STROID/SUBSCRIBE_WITH_SELECTOR.md)

### Body Matter - Server Of Stroid

- [Hydrate Flow](docs/BODY_MATTER/SERVER_OF_STROID/HYDRATE_FLOW.md)
- [Introduction](docs/BODY_MATTER/SERVER_OF_STROID/INTRODUCTION.md)
- [Real Use](docs/BODY_MATTER/SERVER_OF_STROID/REAL_USE.md)
- [Request Scope](docs/BODY_MATTER/SERVER_OF_STROID/REQUEST_SCOPE.md)

### Body Matter - Sync Of Stroid

- [Conflicts And Recovery](docs/BODY_MATTER/SYNC_OF_STROID/CONFLICTS_AND_RECOVERY.md)
- [Introduction](docs/BODY_MATTER/SYNC_OF_STROID/INTRODUCTION.md)
- [Real Use](docs/BODY_MATTER/SYNC_OF_STROID/REAL_USE.md)
- [Sync Options](docs/BODY_MATTER/SYNC_OF_STROID/SYNC_OPTIONS.md)

### Body Matter - Testing Of Stroid

- [Introduction](docs/BODY_MATTER/TESTING_OF_STROID/INTRODUCTION.md)
- [Mocks And Time](docs/BODY_MATTER/TESTING_OF_STROID/MOCKS_AND_TIME.md)
- [Real Use](docs/BODY_MATTER/TESTING_OF_STROID/REAL_USE.md)
- [Resets And Benchmarks](docs/BODY_MATTER/TESTING_OF_STROID/RESETS_AND_BENCHMARKS.md)

### Body Matter - The Glitch In Matrix

- [Introduction](docs/BODY_MATTER/THE_GLITCH_IN_MATRIX/INTRODUCTION.md)
- [Performance And Reality](docs/BODY_MATTER/THE_GLITCH_IN_MATRIX/PERFORMANCE_AND_REALITY.md)
- [Real Use](docs/BODY_MATTER/THE_GLITCH_IN_MATRIX/REAL_USE.md)
- [Tradeoffs And Limits](docs/BODY_MATTER/THE_GLITCH_IN_MATRIX/TRADEOFFS_AND_LIMITS.md)

### Front Matter

- [About Author](docs/FRONT_MATTER/ABOUT_AUTHOR.md)
- [Acknowledge](docs/FRONT_MATTER/ACKNOWLEDGE.md)
- [Contents](docs/FRONT_MATTER/CONTENTS.md)
- [Copyright](docs/FRONT_MATTER/COPYRIGHT.md)
- [Dedication](docs/FRONT_MATTER/DEDICATION.md)
- [Epigraph](docs/FRONT_MATTER/EPIGRAPH.md)
- [Foreword](docs/FRONT_MATTER/FOREWORD.md)
- [Front Cover Page](docs/FRONT_MATTER/FRONT_COVER_PAGE.md)
- [How To Use](docs/FRONT_MATTER/HOW_TO_USE.md)
- [Introduction](docs/FRONT_MATTER/INTRODUCTION.md)
- [List Of Table](docs/FRONT_MATTER/LIST_OF_TABLE.md)
- [Praise](docs/FRONT_MATTER/PRAISE.md)
- [Preface](docs/FRONT_MATTER/PREFACE.md)
- [Title Page](docs/FRONT_MATTER/TITLE_PAGE.md)

## Changelog and License

- [CHANGELOG](CHANGELOG.md)
- [LICENSE](LICENSE)
- [Issues](https://github.com/Himesh-Bhattarai/stroid/issues)
