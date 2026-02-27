# stroid

Lightweight state store helpers for JavaScript/React with batteries included: mutable-friendly updates, selectors, persistence, async caching, and drop-in presets.

## Quick start

```js
import { createStore, setStore, useStore } from "stroid";

createStore("user", { name: "Alex", theme: "dark" }, { devtools: true, persist: true });
setStore("user", draft => { draft.name = "Jordan"; }); // mutator-friendly

function Profile() {
  const name = useStore("user", "name");
  return <div>{name}</div>;
}
```

## Highlights
- Mutator-friendly updates (`setStore(name, draft => { draft.count++ })`) plus batched notifications.
- Selectors (`createSelector`, `useSelector`) and preset stores (`createCounterStore`, `createListStore`, `createEntityStore`).
- Persistence adapters (local/session/memory/custom) with optional encryption hooks, checksum + versioned migrations.
- Async fetch helper with SWR, TTL, dedupe, retries, abort, and metrics (`getAsyncMetrics`).
- React hooks for async state, static reads, form binding (`useFormStore`), and equality-aware selectors.
- DevTools bridge (Redux DevTools) with history/diff log, middleware hooks (`onSet`, `onReset`, `validator`, custom middleware).
- Realtime sync via BroadcastChannel, SSR hydration helpers, and a Zustand compatibility shim.

## SSR / RSC patterns (Next.js-style)
- Per-request stores: `const reqStore = createStoreForRequest(api => api.create("user", { id, theme })); const snapshot = reqStore.snapshot();` (server) → `hydrateStores(snapshot);` (client).
- Avoid shared singletons: do not reuse global stores across requests; always create/hydrate per request.
- Static reads in RSC: use `useStoreStatic(name, path)` in server components to read without subscribing.
- Hydration ordering: hydrate before first client render; with React 18 streaming, hydrate inside `useEffect` gated by `typeof window !== "undefined"`.

## Conflict resolution for sync
- Enable sync: `createStore("cart", { items: [] }, { sync: true });` uses last-write-wins by timestamp.
- Custom resolver: `sync: { conflictResolver: ({ local, incoming }) => incoming }` can merge or prefer local; return `undefined` to ignore.
- Redaction still applies: synced payloads run through `redactor` before broadcast.

## Testing

The tests currently use Jest-style assertions but the script is `node --test`; switch to your preferred runner before publishing.

## Single-file demo (beginner to advanced)

Create `state.js` and paste:

```js
import {
  createStore,
  setStore,
  setStoreBatch,
  createSelector,
  useStore,
  useSelector,
  fetchStore,
} from "./src/index.js"; // or from "stroid" when published

// 1) Basic store + mutator updates
createStore("user", { name: "Alex", theme: "dark" }, { persist: true, devtools: true });
setStore("user", draft => { draft.name = "Jordan"; });

// 2) Derived selector
const selectGreeting = createSelector("user", (u) => `Hi, ${u.name}!`);
console.log(selectGreeting()); // "Hi, Jordan!"

// 3) Batched updates (one re-render)
setStoreBatch(() => {
  setStore("user", "theme", "light");
  setStore("user", draft => { draft.loggedIn = true; });
});

// 4) Async fetch with SWR + retry
await fetchStore("todos", "https://jsonplaceholder.typicode.com/todos", {
  ttl: 30_000,            // cache 30s
  staleWhileRevalidate: true,
  retry: 2,
});

// 5) React usage
// function Header() {
//   const theme = useStore("user", "theme");
//   const greeting = useSelector("user", (u) => `Hi, ${u.name}`);
//   return <div data-theme={theme}>{greeting}</div>;
// }

// 6) Schema validation + migrations
// createStore("profile", { email: "" }, { schema: zodSchema, version: 2, migrations: { 2: (s) => ({ ...s, verified: false }) } });

// 7) SSR hydration
// const ssr = createStoreForRequest(api => api.create("user", { name: "SSR" }));
// const snapshot = ssr.snapshot(); // send to client
// hydrateStores(snapshot); // client-side
```
