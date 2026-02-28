# stroid

Compact state management for JavaScript/React with batteries included: mutable-friendly updates, selectors, persistence, async caching, sync, and drop-in presets. ESM-only; import subpaths like `stroid/core`, `stroid/react`, `stroid/async`, `stroid/testing` as needed. For non-React/Node usage, prefer `stroid/core`.

## Quick start

```js
import { createStore, setStore, useStore } from "stroid";

createStore("user", { name: "Alex", theme: "dark" }, { devtools: true, persist: true });
setStore("user", (draft) => { draft.name = "Jordan"; });

function Profile() {
  const name = useStore("user", "name");
  return <div>{name}</div>;
}
```

Install: `npm install stroid`

## Highlights
- Mutator-friendly updates and batched notifications.
- Selectors (`createSelector`, `useSelector`) and presets (counter/list/entity).
- Persistence adapters with checksum + migrations; sync via BroadcastChannel.
- Async helper with SWR, TTL, dedupe, retries, abort, focus/online revalidate; metrics.
- React hooks (`useStore`, `useStoreField`, `useSelector`, `useAsyncStore`, `useFormStore`, `useStoreStatic`); `useStore` warns in dev when subscribing to the whole store.
- DevTools bridge (Redux DevTools), middleware hooks, schema validation.
- Subpath imports share a common internal chunk today; true per-feature isolation is planned for v1.1.

## Testing
Import testing helpers without bundling them into apps:
```js
import { createMockStore, resetAllStoresForTest } from "stroid/testing";
```

## More docs
- SSR/RSC patterns, sync conflict resolution, and the full demo: `docs/DETAILS.md`.
- LWW sync uses `Date.now()`; significant clock skew between tabs/devices can reorder updates.

## Roadmap (packaging)
- Phase 1 (done): sideEffects flag, testing subpath, dev-only verbose warnings, lazy CRC init.
- Phase 2 (done): hooks split, subpath exports, focus/online revalidate helper, useStore selector overload.
- Phase 3 (planned): modularize persistence/history/devtools/sync into opt-in chunks.

## Versioning / Semver
Follows semver. Breaking changes bump MAJOR; features MINOR; fixes PATCH. See CHANGELOG.md.
