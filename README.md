<div align="center">

<img src=".\stroid-website\public\Screenshot 2026-03-05 185907.jpg" alt="Stroid logo"/>

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

[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white)](#)
[![React 18](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=1a1a1a)](#)
[![Node](https://img.shields.io/badge/Node-18+-339933?logo=node.js&logoColor=white)](#)
[![tsup](https://img.shields.io/badge/Bundler-tsup-000000)](#)
[![tsx](https://img.shields.io/badge/Runtime-tsx-6c4cff)](#)
[![ESLint](https://img.shields.io/badge/ESLint-5c6bc0?logo=eslint&logoColor=white)](#)

---

## Top Contributors

[![Contributors graph](https://contrib.rocks/image?repo=Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid/graphs/contributors)

---

## Why It’s Interesting

- Dot-path API with path safety and schema/validator guardrails
- Built-in persistence, async caching, and cross-tab sync without extra packages
- React hooks that avoid over-rendering; no Provider required
- Devtools, history, and metrics ready for debugging out of the box
