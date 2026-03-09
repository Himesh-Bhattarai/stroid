# Chapter 72: From Basic to Real Usage

## The Simple Growth Path

A real Stroid app usually grows in this order:

1. install the package
2. create a plain store
3. read and update it
4. connect it to React if needed
5. add optional features only when a real problem appears

That last line matters a lot.
Do not add features because they sound powerful.
Add them because your app has a specific need.

## Feature Picker: What To Add And Why

### `stroid/react`

Use it when:

- you are building React components
- UI should update when store values change

Beginner summary:

- `useStore(...)` reads store data in components
- `useSelector(...)` reads derived values

### `stroid/selectors`

Use it when:

- you want to watch only one calculated part of a store
- you need subscriptions outside React

Example:

```ts
import { subscribeWithSelector } from "stroid/selectors";

const unsubscribe = subscribeWithSelector(
  "user",
  (state) => state.theme,
  Object.is,
  (theme) => {
    console.log("Theme changed to:", theme);
  }
);
```

### `stroid/persist`

Use it when:

- data should survive page refresh
- data should still exist when the user comes back later

Examples:

- theme preference
- language choice
- cart draft

```ts
import { createStore } from "stroid";
import "stroid/persist";

createStore("theme", { mode: "dark" }, {
  persist: { key: "theme", version: 1 },
});
```

### `stroid/sync`

Use it when:

- the same app is open in more than one browser tab
- changes should be shared across those tabs

Examples:

- cart updates across tabs
- theme changes across tabs

```ts
import { createStore } from "stroid";
import "stroid/sync";

createStore("cart", { items: [] }, {
  sync: true,
});
```

### `stroid/devtools`

Use it when:

- you want better debugging
- you want store history or devtools visibility

```ts
import { createStore } from "stroid";
import "stroid/devtools";

createStore("checkout", {
  step: 1,
  acceptedTerms: false,
}, {
  devtools: true,
});
```

### `stroid/async`

Use it when:

- data comes from an API
- you want caching
- you want retry, dedupe, or revalidation support

```ts
import { fetchStore } from "stroid/async";

await fetchStore("products", "/api/products", {
  ttl: 15_000,
  staleWhileRevalidate: true,
  dedupe: true,
});
```

Important difference:

- `persist`, `sync`, and `devtools` are store options plus side-effect imports
- `async` is a helper API you call directly

### `stroid/runtime-tools`

Use it when:

- you want to inspect what stores exist
- you want metadata during debugging

### `stroid/runtime-admin`

Use it when:

- you need app-wide cleanup or admin-style runtime operations

This is usually not where beginners should start.

### `stroid/testing`

Use it when:

- you are writing tests
- you want helpers for isolated store setup and reset

## One Small Real App Flow

A beginner-friendly path could look like this:

1. Create a `user` store for profile and auth flags.
2. Use `stroid/react` to show the user's name in the UI.
3. Add `stroid/persist` if theme or session-like preferences should survive refresh.
4. Add `stroid/devtools` when debugging becomes annoying.
5. Use `stroid/async` for API-backed data such as products or search results.
6. Add `stroid/sync` only if more than one browser tab must stay in sync.

## Suggested Folder Shape

Start simple:

```text
src/
  state/
    setup.ts
    user.ts
    theme.ts
    cart.ts
```

Example idea:

- `setup.ts` for side-effect feature imports
- `user.ts` for the user store
- `theme.ts` for theme store
- `cart.ts` for cart store

## Tips

- Keep one store for one clear domain concern.
- Prefer simple object state first.
- Add one optional feature at a time.
- Name stores after real app concepts, not generic ideas.

## Note

The best beginner setup is often boring:

- one or two stores
- normal reads
- normal updates
- React hooks only where needed

That is healthy, not weak.

## Warning

Do not enable every feature on every store.

Bad beginner habit:

- persist everything
- sync everything
- add devtools everywhere
- use async for data that is already local

Good beginner habit:

- each feature must answer one real problem

## Final Rule

If you cannot explain in one sentence why a store needs a feature, do not enable that feature yet.


## Navigation

- Previous: [Chapter 71: Use Stroid in React](REACT_USAGE.md)
- Jump to: [Unit Sixteen: Beginner Guide](../../FRONT_MATTER/CONTENTS.md#unit-sixteen-beginner-guide)
- Next: [Chapter 73: Introduction to Bug as Helper](../BUG_AS_HELPER/INTRODUCTION.md)
