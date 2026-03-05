<div align="center">

<img src="./stroid-website/public/Screenshot%202026-03-05%20185907.jpg" alt="Stroid logo" width="720" />

# Stroid

Compact, batteries-included state management for JavaScript and React. No provider, no dispatch, dot-path ergonomics.

</div>

---

## Quick Example

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

## What You Can Use

- Core API: `createStore`, `setStore`, `mergeStore`, `resetStore`, `getStore`, `setStoreBatch`
- Helpers: selectors, history, metrics, entity/list/counter stores, chain, async fetch helpers
- React Hooks: `useStore`, `useSelector`, `useStoreField`, `useStoreStatic`, `useAsyncStore`, `useFormStore`
- Persistence: per-store `persist` option (localStorage/sessionStorage/custom driver)
- Async: `fetchStore`, `refetchStore`, `enableRevalidateOnFocus`, `getAsyncMetrics`
- Testing: `createMockStore`, `resetAllStoresForTest`, `withMockedTime`, `benchmarkStoreSet`

See `/docs` for full details and roadmap.

---

## Highlights

- Dot-path API with path safety, schema/validator guardrails
- Built-in persistence, async caching, and cross-tab sync without extra packages
- React hooks tuned to avoid over-rendering; no Provider required
- Devtools/history/metrics out of the box; zero runtime dependencies
- <10 kB gzipped target when tree-shaken

---

## GitHub Stats

[![Contributors](https://img.shields.io/github/contributors/Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid/graphs/contributors)
[![Forks](https://img.shields.io/github/forks/Himesh-Bhattarai/stroid?style=social)](https://github.com/Himesh-Bhattarai/stroid/network/members)
[![Stargazers](https://img.shields.io/github/stars/Himesh-Bhattarai/stroid?style=social)](https://github.com/Himesh-Bhattarai/stroid/stargazers)
[![Issues](https://img.shields.io/github/issues/Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid/issues)
[![License](https://img.shields.io/github/license/Himesh-Bhattarai/stroid)](./LICENSE)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-himesh--bhattarai-blue?logo=linkedin)](https://www.linkedin.com/in/himeshbhattarai/)
[![Bundlephobia](https://img.shields.io/bundlephobia/minzip/stroid)](https://bundlephobia.com/package/stroid)
[![Packagephobia](https://img.shields.io/packagephobia/install/stroid)](https://packagephobia.com/result?p=stroid)

---

## Built With

[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white)](#)
[![React 18](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=1a1a1a)](#)
[![Node](https://img.shields.io/badge/Node-18+-339933?logo=node.js&logoColor=white)](#)
[![tsup](https://img.shields.io/badge/Bundler-tsup-000000)](#)
[![tsx](https://img.shields.io/badge/Runtime-tsx-6c4cff)](#)
[![ESLint](https://img.shields.io/badge/ESLint-5c6bc0?logo=eslint&logoColor=white)](#)

---

## Why Stroid vs Others

| Feature | Stroid | Redux | Zustand | Context |
| --- | --- | --- | --- | --- |
| Provider required | No | Yes | Optional | Yes |
| Dot-path updates | Yes | No | No | No |
| Built-in persist/sync | Yes | No (extra libs) | Plugins | No |
| Async helper baked in | Yes | Thunks/sagas | No | No |
| Devtools/history | Built-in toggle | External | Plugin | No |

---

## Support Matrix

- Node: 18+
- React: 18+
- Module format: ESM-only, tree-shakeable, side-effect free
- Browser: modern evergreen; BroadcastChannel required for sync

---

## Migration and Docs

- Migration guide: [`docs/23-migration.md`](./docs/23-migration.md)
- Roadmap: [`docs/24-roadmap.md`](./docs/24-roadmap.md)
- Success path: [`docs/25-success-path.md`](./docs/25-success-path.md)
- Changelog: [`CHANGELOG.md`](./CHANGELOG.md)

---

## Top Contributors

[![Contributors graph](https://contrib.rocks/image?repo=Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid/graphs/contributors)

---

## Contact

- Issues: https://github.com/Himesh-Bhattarai/stroid/issues
- LinkedIn: https://www.linkedin.com/in/himeshbhattarai/
