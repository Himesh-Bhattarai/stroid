<div align="center">

<img src="./stroid-website/public/favicon/web-app-manifest-512x512.png" alt="Stroid logo" width="240" />

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

## GitHub Stats

[![Contributors](https://img.shields.io/github/contributors/Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid/graphs/contributors)
[![Forks](https://img.shields.io/github/forks/Himesh-Bhattarai/stroid?style=social)](https://github.com/Himesh-Bhattarai/stroid/network/members)
[![Stargazers](https://img.shields.io/github/stars/Himesh-Bhattarai/stroid?style=social)](https://github.com/Himesh-Bhattarai/stroid/stargazers)
[![Issues](https://img.shields.io/github/issues/Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid/issues)
[![License](https://img.shields.io/github/license/Himesh-Bhattarai/stroid)](./LICENSE)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-himesh--bhattarai-blue?logo=linkedin)](https://www.linkedin.com/in/himeshbhattarai/)

---

## Built With

- TypeScript
- React 18 (peer)
- Node 18+
- tsup (bundler)
- TSX (test/runtime loader)
- ESLint + TypeScript config

---

## Top Contributors

[![Contributors graph](https://contrib.rocks/image?repo=Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid/graphs/contributors)

---

## Why It’s Interesting

- Dot-path API with path safety and schema/validator guardrails
- Built-in persistence, async caching, and cross-tab sync without extra packages
- React hooks that avoid over-rendering; no Provider required
- Devtools, history, and metrics ready for debugging out of the box
