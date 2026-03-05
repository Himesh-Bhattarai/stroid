<div align="center">

# Stroid

Compact, batteries-included state management for JavaScript & React.

Mutable-friendly updates · Selectors · Persistence · Async caching · Sync · Drop-in presets — all in one ergonomic package.

> Note: This library targets experienced teams; it is not a beginner-oriented state tool.

</div>

---

Jump to: [Installation](#installation) | [Quick Start](#quick-start) | [Core API](#core-api) | [React Hooks](#react-hooks) | [Persistence](#persistence) | [Async Helper](#async-helper) | [Testing](#testing) | [Roadmap](#roadmap)

Docs accuracy: the GitHub README is the source of truth; npm README may lag.

---

## Package Stats

| Metric | Value |
| --- | --- |
| Version | 0.0.3 |
| Maintainer | @himesh.hcb |
| Dependencies | 0 |
| Bundle size (min) | 24 kB (Bundlephobia v0.0.3) |
| Bundle size (min+gzip) | 9 kB (Bundlephobia v0.0.3) |
| Unpacked size | 43 kB |
| Download time — Slow 3G | 171 ms |
| Download time — Emerging 4G | 10 ms |
| Vulnerability score | 100 / 100 |
| Quality score | 83 / 100 |
| Maintenance score | 86 / 100 |
| License score | 100 / 100 |
| Build | ESM only, tree-shakeable, side-effect free, no dependencies |

Verified on BundlePhobia · Socket.dev

---

## Installation

```bash
npm install stroid
```

---

## Quick Start

```js
import { createStore, setStore } from "stroid/core"
import { useStore } from "stroid/react"

createStore("user", { name: "Eli", theme: "dark" })

function Profile() {
  const name = useStore("user.name")
  return <div>{name}</div>
}
```

---

## Core API

- `createStore(name, initial, options?)`
- `setStore(nameOrPath, value | updater)`
- `mergeStore(name, data)`
- `resetStore(name)`
- `getStore(nameOrPath)`
- `setStoreBatch(fn)`
- Helpers: selectors, history, metrics, entity/list/counter stores, chain, async fetch helpers.

See: [`docs/04-createStore.md`](./docs/04-createStore.md) and [`docs/05-setStore.md`](./docs/05-setStore.md)

---

## React Hooks

- `useStore(path or selector)`
- `useSelector(store, selector, equality?)`
- `useStoreField`, `useStoreStatic`, `useAsyncStore`, `useFormStore`

See: [`docs/12-react.md`](./docs/12-react.md)

---

## Persistence

Per-store opt-in via `persist` option (localStorage/sessionStorage/custom driver).

See: [`docs/14-persist.md`](./docs/14-persist.md)

---

## Async Helper

`fetchStore`, `refetchStore`, `enableRevalidateOnFocus`, `getAsyncMetrics`.

See: [`docs/13-async.md`](./docs/13-async.md)

---

## Testing

Testing helpers live in `stroid/testing`: `createMockStore`, `resetAllStoresForTest`, `withMockedTime`, `benchmarkStoreSet`.

See: [`docs/20-testing.md`](./docs/20-testing.md)

---

## Roadmap

Current baseline: v0.0.3. Next up: bug fixes/stability in v0.0.4, then core cleanup (`isGlobal`/`isTemp`, `setStore.replace`), modular subpaths, DX, perf/size, docs/examples, beta hardening, and v1.0 API lock.

See: [`docs/24-roadmap.md`](./docs/24-roadmap.md) and [`docs/25-success-path.md`](./docs/25-success-path.md)
