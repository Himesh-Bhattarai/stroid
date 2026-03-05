# Stroid

Compact, batteries-included state management for JavaScript and React. No provider, no dispatch, dot-path ergonomics.

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

---

See `/docs` for full details and roadmap.
