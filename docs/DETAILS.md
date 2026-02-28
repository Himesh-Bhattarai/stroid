# Stroid Details

## SSR / RSC patterns (Next.js-style)
- Per-request stores: `const reqStore = createStoreForRequest(api => api.create("user", { id, theme })); const snapshot = reqStore.snapshot();` (server) → `hydrateStores(snapshot);` (client).
- Avoid shared singletons: do not reuse global stores across requests; always create/hydrate per request.
- Static reads in RSC: use `useStoreStatic(name, path)` in server components to read without subscribing.
- Hydration ordering: hydrate before first client render; with React 18 streaming, hydrate inside `useEffect` gated by `typeof window !== "undefined"`.

## Conflict resolution for sync
- Enable sync: `createStore("cart", { items: [] }, { sync: true });` uses last-write-wins by timestamp.
- Custom resolver: `sync: { conflictResolver: ({ local, incoming }) => incoming }` can merge or prefer local; return `undefined` to ignore.
- Redaction still applies: synced payloads run through `redactor` before broadcast.
- Note: LWW uses `Date.now()`; significant clock skew between tabs/devices can reorder updates.

## Single-file demo

```js
import {
  createStore,
  setStore,
  setStoreBatch,
  createSelector,
  useStore,
  useSelector,
  fetchStore,
} from "stroid";

createStore("user", { name: "Alex", theme: "dark" }, { persist: true, devtools: true });
setStore("user", draft => { draft.name = "Jordan"; });

const selectGreeting = createSelector("user", (u) => `Hi, ${u.name}!`);
console.log(selectGreeting());

setStoreBatch(() => {
  setStore("user", "theme", "light");
  setStore("user", draft => { draft.loggedIn = true; });
});

await fetchStore("todos", "https://jsonplaceholder.typicode.com/todos", {
  ttl: 30_000,
  staleWhileRevalidate: true,
  retry: 2,
});

// React usage
// function Header() {
//   const theme = useStore("user", "theme");
//   const greeting = useSelector("user", (u) => `Hi, ${u.name}`);
//   return <div data-theme={theme}>{greeting}</div>;
// }
```
