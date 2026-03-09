# Appendices

Appendices exist for one reason:

to reduce repeated cognitive load.

If the main chapters teach the system, the appendices should make the system easier to recall under pressure.

## Appendix A: Glossary of Core Terms

### Named Store

A Stroid store identified by a stable string key such as `theme`, `checkout`, or `profileDraft`.

### Scope

The declared lifetime/intention class of a store.

Current core values:

- `request`
- `global`
- `temp`

### Runtime Layer

A module that consumes or orchestrates store behavior without being part of lean core.

Examples:

- `stroid/react`
- `stroid/async`
- `stroid/selectors`

### Store-Attached Feature

A feature activated by explicit import and requested through store options.

Examples:

- `persist`
- `sync`
- `devtools`

### Hydration

Loading external or prebuilt state into Stroid stores through `hydrateStores(...)`.

### Revalidation

Refreshing async-backed store data after cache usage, focus return, or network recovery.

### Conflict Resolver

A function used by sync to decide what should win when local and incoming state disagree.

### Runtime Tools

Read-oriented operational APIs for inspecting registry state.

Current import path:

```ts
import { listStores, getStoreMeta, getInitialState, getMetrics } from "stroid/runtime-tools";
```

### Runtime Admin

Destructive global runtime operations.

Current import path:

```ts
import { clearAllStores } from "stroid/runtime-admin";
```

## Appendix B: Import Matrix

Table B.1: Public Import Paths

| Import Path | Purpose |
|---|---|
| `stroid` | lean default core entry |
| `stroid/core` | explicit lean core entry |
| `stroid/persist` | register persistence support |
| `stroid/sync` | register sync support |
| `stroid/devtools` | register devtools/history support |
| `stroid/react` | React hooks |
| `stroid/async` | async orchestration |
| `stroid/selectors` | selector helpers |
| `stroid/chain` | fluent nested access |
| `stroid/helpers` | store helper factories |
| `stroid/server` | request-scoped buffering |
| `stroid/runtime-tools` | runtime inspection |
| `stroid/runtime-admin` | runtime cleanup |
| `stroid/testing` | testing helpers |

## Appendix C: Scope Decision Cheat Sheet

Table C.1: Scope Selection

| Scope | Best For | Default Behavior Direction |
|---|---|---|
| `temp` | drafts, dropdowns, transient UI flow | lighter defaults, no persist/sync/devtools unless explicit |
| `request` | normal application flow state | standard general-purpose store |
| `global` | long-lived shared state | SSR global-store opt-in and broad shared intent |

Quick rule:

- if the state should die with the interaction, use `temp`
- if the state belongs to a normal workflow, use `request`
- if the state is intentionally shared and long-lived, use `global`

## Appendix D: Async State Shape Reference

Table D.1: Async Store Shape

| Key | Meaning |
|---|---|
| `data` | current payload |
| `loading` | request in progress |
| `error` | error string or `null` |
| `status` | lifecycle state |
| `cached` | cache served value |
| `revalidating` | background refresh in progress |

## Appendix E: Sync Decision Checklist

Use built-in sync when:

- the peers are local
- whole-store sync is acceptable
- `BroadcastChannel` is enough
- reconnect catch-up is enough

Do not use built-in sync when:

- remote server arbitration is required
- state is highly collaborative and high-frequency
- operation-based merge semantics are required
- multi-device durable sync is the real problem

## Appendix F: Test Surface Reference

Main test areas in the repository:

- [tests/store.test.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/tests/store.test.ts)
- [tests/async.test.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/tests/async.test.ts)
- [tests/persist.test.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/tests/persist.test.ts)
- [tests/sync.test.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/tests/sync.test.ts)
- [tests/react-hooks.test.tsx](/c:/Users/Himesh/Desktop/SM_STROID/stroid/tests/react-hooks.test.tsx)
- [tests/testing.test.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/tests/testing.test.ts)
- [tests/heavy](/c:/Users/Himesh/Desktop/SM_STROID/stroid/tests/heavy)

This appendix matters because a state-management library should not be understood only by API surface. It should also be understood by what behavior is being defended in tests.
