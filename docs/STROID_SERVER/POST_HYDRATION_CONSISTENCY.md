# Post-Hydration Consistency

> **Version:** 0.1.4 &nbsp;|&nbsp; **Last Updated:** 2026-04-01 &nbsp;|&nbsp; **Confidence:** ![HIGH](https://img.shields.io/badge/confidence-HIGH-brightgreen)
>
> *Derived from `src/core/store-hydrate-impl.ts`, `src/core/hydration-consistency/*.ts`, `src/runtime-tools/hydration.ts`*

---

## Overview

SSR gets you a correct initial snapshot. The remaining problem is what happens right after hydration, when browser-only writes, storage restores, sync traffic, and async revalidation begin.

`hydrateStores(snapshot, options, trust, consistency?)` adds a bounded consistency layer for that phase:

- snapshot metadata stays attached to each hydrated store
- a short boot window can defer risky writes
- drift becomes observable instead of silent
- each store can choose its own reconciliation policy

---

## API Shape

```ts
import { hydrateStores } from "stroid"

hydrateStores(window.__INITIAL_STATE__, {}, { allowTrusted: true }, {
  contract: {
    snapshotVersion: 3,
    timestamp: Date.now(),
    authority: "server-authoritative",
    stores: {
      session: { authority: "server-authoritative", schemaSignature: "session@1" },
      draft: { authority: "client-authoritative" },
      filters: { authority: "mergeable" },
    },
  },
  bootWindowMs: 30,
  policyMap: {
    session: "server_wins",
    draft: "client_wins",
    filters: {
      policy: "merge",
      merge: ({ baseline, live }) => ({ ...baseline, ...live }),
    },
    feed: {
      policy: "invalidate_and_refetch",
      onInvalidate: ({ store }) => {
        console.warn(`Refetch triggered for ${store}`)
      },
    },
  },
  onDrift: (event) => {
    console.warn(event.store, event.source, event.resolution)
  },
})
```

The fourth argument is optional. Existing trusted hydration calls stay valid.

---

## Contract Metadata

Use `consistency.contract` to persist the server-side hydration contract into runtime metadata.

- `snapshotVersion`: app-defined snapshot generation/version marker
- `timestamp`: server snapshot timestamp
- `checksum`: optional snapshot checksum or signature identifier
- `schemaSignature`: optional schema/version label
- `authority`: default authority for stores in this hydrate call
- `contract.stores[name]`: per-store overrides

Authorities map to sensible default policies:

- `server-authoritative` -> `server_wins`
- `client-authoritative` -> `client_wins`
- `mergeable` -> `merge`

You can still override any store explicitly through `policyMap`.

---

## Boot Window

`bootWindowMs` enables a short post-hydration gate.

During that window, Stroid defers writes tagged as:

- `effect`
- `storage`
- `network`
- `sync`

Those writes are replayed in insertion order once the window closes. This is mainly for:

- early user input or `useEffect` writes
- stale persistence restores
- immediate websocket bursts
- eager revalidation after boot

If you do not want deferral, omit `bootWindowMs` or set it to `0`.

---

## Reconciliation Policies

- `server_wins`: revert the attempted drift to the hydrated baseline
- `client_wins`: keep the live client value and emit drift diagnostics
- `merge`: merge baseline and live values; use a custom `merge(...)` callback when a shallow/default merge is not enough
- `invalidate_and_refetch`: mark the store invalidated, run `onInvalidate`, and trigger `refetchStore()` automatically when that store has a replayable async fetch recipe

`invalidate_and_refetch` treats the replayed `network` response as the refreshed canonical state so it does not loop on its own recovery write.

---

## Drift Sources

Drift events are tagged with a source hint:

- `effect`
- `storage`
- `network`
- `sync`
- `hydrate`
- `unknown`

These source hints are used for:

- `consistency.onDrift`
- runtime-tools event inspection
- first-divergence timestamps and counters

---

## Runtime Tools

Import from `stroid/runtime-tools` to inspect the consistency layer:

```ts
import {
  getHydrationConsistency,
  getHydrationDriftEvents,
  getHydrationDriftMetrics,
} from "stroid/runtime-tools"

const report = getHydrationConsistency("session")
const events = getHydrationDriftEvents(10)
const metrics = getHydrationDriftMetrics()
```

Use these helpers to answer:

- which stores were hydrated under a contract
- which policy each store uses
- when drift first appeared
- whether the boot window is still active
- how many writes were queued or replayed

---

## Adoption Defaults

Release-specific upgrade notes belong in the [Version Migration Guide](../STROID_VERSION_MIGRATION/INDEX.md). This section is only about operational rollout defaults once you choose to adopt post-hydration consistency.

If you want the lowest-friction rollout, start with a short boot window, explicit drift logging, and only tighten the stores that really need server authority:

```ts
hydrateStores(window.__INITIAL_STATE__, {}, { allowTrusted: true }, {
  contract: {
    authority: "client-authoritative",
    stores: {
      session: { authority: "server-authoritative" },
      filters: { authority: "mergeable" },
      feed: { authority: "server-authoritative" },
    },
  },
  bootWindowMs: 20,
  onDrift: (event) => {
    console.warn(event.store, event.source, event.resolution)
  },
})
```

Policy defaults that usually map well:

- `server_wins` for auth, session, entitlement, and SSR-critical server truth
- `client_wins` for drafts, forms, optimistic local buffers, and immediate user input
- `merge` for filters, preference bags, and shallow object state with obvious merge semantics
- `invalidate_and_refetch` for async caches that already have a replayable `fetchStore(...)` recipe

Suggested rollout sequence:

1. Keep the existing trusted hydration call and add only `bootWindowMs` plus `onDrift`.
2. Set a default authority that matches your rollout goal:
   use `client-authoritative` for the least disruptive adoption, or `server-authoritative` for the strictest SSR lock.
3. Override only the sensitive stores first:
   `session/auth` -> `server-authoritative`, `drafts` -> `client-authoritative`, `filters` -> `mergeable`.
4. Inspect `getHydrationConsistency(...)`, `getHydrationDriftEvents(...)`, and `getHydrationDriftMetrics()` before tightening more stores.

---

## Notes

- This does not promise permanent server/client equality forever.
- `merge` is intentionally overridable because business merge rules are app-specific.
- Request-scoped SSR safety still comes from `createStoreForRequest(...)`; this guide only covers what happens after the trusted snapshot reaches the client.
