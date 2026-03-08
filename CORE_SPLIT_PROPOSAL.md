# Core Split Proposal

Date: `2026-03-08`  
Target branch: `v0.0.5`

## Goal

Refactor Stroid so:

1. the **user-facing API stays simple**
2. the **core stays minimal**
3. features are **split internally by concern**
4. the public API remains a **single `createStore(...)` flow**

This proposal is the architectural target to implement before further feature work.

## Decision Summary

### Recommended workflow

1. define the final public API
2. define strict internal module boundaries
3. split implementation by concern
4. integrate grouped options into `createStore(...)`
5. deprecate legacy option names gradually

### Recommended public API shape

Users should still write:

```ts
import { createStore } from "stroid";

createStore("user", initialState, {
  scope: "global",
  validate: userSchema,
  onError: console.error,

  persist: {
    key: "user",
    version: 2,
    migrations: {
      2: (state) => ({ ...state, token: state.token ?? null }),
    },
  },

  sync: {
    channel: "user-sync",
    maxPayloadBytes: 64 * 1024,
  },

  devtools: {
    enabled: true,
    historyLimit: 50,
    redactor: (state) => ({ ...state, token: "***" }),
  },

  lifecycle: {
    middleware: [
      ({ next }) => ({ ...next, updatedAt: Date.now() }),
    ],
    onSet(prev, next) {},
    onDelete(prev) {},
  },
});
```

The important point is:

- **one import**
- **one `createStore(...)` call**
- **grouped feature options**
- **internally split implementation**

## Why This Direction

This model is better than the current flat option bag because:

- it keeps the top-level API smaller
- it makes feature ownership clearer
- it reduces option sprawl
- it allows internal code to be split without making usage verbose
- it scales better as more modules are added later

This model is better than a pure `withPersist()` / `withSync()` style for Stroid because:

- it preserves simple developer experience
- it matches how users already think about store setup
- it avoids turning basic store creation into multi-step composition

## Public API Proposal

## `createStore(name, initialState, options?)`

### Core top-level options

These are the only top-level options that should remain in core:

| Option | Type | Purpose |
| --- | --- | --- |
| `scope` | `"request" \| "global" \| "temp"` | Defines intended store lifetime and SSR/global behavior. |
| `validate` | `schema-like object \| (nextState) => boolean` | Single validation entry point for state acceptance. |
| `onError` | `(message: string) => void` | Shared error sink across core and integrated features. |
| `persist` | `PersistOptions` | Persistence feature block. |
| `sync` | `SyncOptions` | Sync feature block. |
| `devtools` | `boolean \| DevtoolsOptions` | Debug/inspection feature block. |
| `lifecycle` | `LifecycleOptions` | Lifecycle hooks and middleware feature block. |

### Proposed option blocks

#### `persist`

```ts
type PersistOptions = {
  driver?: StorageLike;
  key?: string;
  serialize?: (value: unknown) => string;
  deserialize?: (value: string) => unknown;
  encrypt?: (value: string) => string;
  decrypt?: (value: string) => string;
  version?: number;
  migrations?: Record<number, (state: any) => any>;
  onMigrationFail?: "reset" | "keep" | ((state: unknown) => unknown);
  onStorageCleared?: (info: {
    name: string;
    key: string;
    reason: "clear" | "remove" | "missing";
  }) => void;
};
```

#### `sync`

```ts
type SyncOptions = {
  channel?: string;
  maxPayloadBytes?: number;
  conflictResolver?: (args: {
    local: unknown;
    incoming: unknown;
    localUpdated: number;
    incomingUpdated: number;
  }) => unknown;
};
```

#### `devtools`

```ts
type DevtoolsOptions = {
  enabled?: boolean;
  historyLimit?: number;
  redactor?: (state: any) => any;
};
```

#### `lifecycle`

```ts
type LifecycleOptions<State = unknown> = {
  middleware?: Array<(ctx: {
    action: string;
    name: string;
    prev: State;
    next: State;
    path: unknown;
  }) => State | void>;
  onCreate?: (initial: State) => void;
  onSet?: (prev: State, next: State) => void;
  onReset?: (prev: State, next: State) => void;
  onDelete?: (prev: State) => void;
};
```

## What Moves Where

### Core keeps

- store registry
- store creation
- store read/write/delete/reset primitives
- path handling
- state cloning/sanitization
- scope checks
- validation entry point
- centralized error dispatch
- subscription registry
- batched notification scheduling

### Persist module owns

- storage normalization
- persist load/save
- migration application
- migration failure recovery
- storage-cleared watching
- persist timers
- persist key collision handling

### Sync module owns

- BroadcastChannel setup
- sync message format
- sync clocks and ordering
- reconnect snapshot requests
- payload size guards
- conflict resolution

### Devtools module owns

- devtools connection
- history snapshots
- redaction before inspection
- metrics formatting for debugging surfaces

### Lifecycle module owns

- middleware execution
- onCreate/onSet/onReset/onDelete hooks

## Current Option Mapping

This section defines how current options map into the proposed structure.

| Current option | Proposed location |
| --- | --- |
| `allowSSRGlobalStore` | replaced by `scope: "global"` |
| `schema` | merged into `validate` |
| `validator` | merged into `validate` |
| `persist` | remains `persist`, but becomes the full persistence block |
| `version` | moves into `persist.version` |
| `migrations` | moves into `persist.migrations` |
| `sync` | remains `sync` |
| `devtools` | becomes `devtools.enabled` or `devtools: true` |
| `historyLimit` | moves into `devtools.historyLimit` |
| `redactor` | moves into `devtools.redactor` |
| `middleware` | moves into `lifecycle.middleware` |
| `onCreate` | moves into `lifecycle.onCreate` |
| `onSet` | moves into `lifecycle.onSet` |
| `onReset` | moves into `lifecycle.onReset` |
| `onDelete` | moves into `lifecycle.onDelete` |
| `onError` | stays top-level |

## Option Cleanup Decisions

### Remove or deprecate

#### `allowSSRGlobalStore`

Deprecate in favor of:

```ts
scope: "global"
```

Reason:

- one lifetime model is cleaner than a special SSR-only boolean

#### `isGlobal`

Do not add.

Reason:

- duplicates `scope: "global"`
- creates conflicting combinations if combined with other booleans

#### `isTemp`

Do not add as a standalone boolean.

Reason:

- too vague alone
- better expressed as `scope: "temp"`

### Keep as API, not option

#### `deleteStore`

Keep it.

Reason:

- explicit teardown primitive is still required
- lifecycle rules may call it automatically, but should not replace it

#### `setStore.replace`

If implemented, it should be a write API feature, not a `createStore` option. and not need for now

## Scope Semantics

The proposed `scope` option should behave as:

| Scope | Meaning |
| --- | --- |
| `"request"` | default request-safe scope; server globals are not allowed in production |
| `"global"` | explicit long-lived/global scope; allows intentional global store usage |
| `"temp"` | short-lived store intent; can later integrate with auto-dispose policies |

Important:

- `scope` describes lifecycle intent
- it does **not** replace `deleteStore`
- future auto-cleanup features may use `scope`, but teardown should still go through the same delete path

## Validation Semantics

The current split between `schema` and `validator` should be simplified.

Proposal:

```ts
validate: schemaOrFn
```

Accepted forms:

- schema object
- custom validation function

Internal handling:

- normalize into one validation pipeline
- keep current behavior where invalid writes are blocked before commit

Reason:

- two top-level validation options are more confusing than one
- most users think in terms of “validate this store”, not “schema plus validator”

## Devtools Semantics

Current `devtools`, `historyLimit`, and `redactor` are related enough to belong together.

Proposal:

```ts
devtools: true
```

or

```ts
devtools: {
  enabled: true,
  historyLimit: 50,
  redactor: redactFn,
}
```

Reason:

- avoids unrelated top-level options
- groups debug-only concerns together

## Internal Architecture Proposal

## New internal files

Suggested internal layout:

```txt
src/
  core/
    registry.ts
    create-store.ts
    set-store.ts
    get-store.ts
    delete-store.ts
    reset-store.ts
    batch.ts
    notify.ts
    meta.ts
    validate.ts
    scope.ts
  features/
    persist.ts
    sync.ts
    devtools.ts
    lifecycle.ts
  adapters/
    options.ts
  store.ts
```

### Role of `adapters/options.ts`

This file should:

- accept the public options shape
- normalize grouped options into internal module-ready structures
- support legacy options during migration

This is the key compatibility layer.

## Initialization Order

Initialization should be explicit and stable:

1. validate store name and initial data
2. normalize public options
3. enforce scope/SSR rules
4. sanitize initial state
5. run validation
6. register store core state
7. initialize persist
8. initialize lifecycle create hook
9. initialize devtools
10. initialize sync
11. push create history

The order matters because persistence and sync depend on registered store metadata, and devtools/history depend on finalized normalized configuration.

## Migration Strategy

### Phase 1: internal split only

- keep current public API working
- move code into module files internally
- no user-facing breaking change yet

### Phase 2: add grouped options support

Support both:

```ts
createStore("user", initial, {
  version: 2,
  migrations: { ... },
  historyLimit: 50,
  middleware: [fn],
})
```

and:

```ts
createStore("user", initial, {
  persist: { version: 2, migrations: { ... } },
  devtools: { historyLimit: 50 },
  lifecycle: { middleware: [fn] },
})
```

### Phase 3: deprecate old shape

- warn on legacy option usage in development
- document the grouped replacement

### Phase 4: remove legacy shape

- make grouped options the only supported API

## Recommended First Implementation Steps

1. extract option normalization into its own module
2. define the new normalized internal types
3. move persist logic into a feature module
4. move sync logic into a feature module
5. move lifecycle/middleware logic into a feature module
6. move devtools/history/redaction logic into a feature module
7. add grouped public options support
8. add compatibility warnings for legacy option names

## Non-Goals

This proposal does **not** require:

- removing `deleteStore`
- converting the public API to `withPersist()` style
- changing all subpath exports immediately
- changing React APIs as part of the same refactor

## Open Questions

These should be answered before implementation completes:

1. Should `devtools: true` stay supported permanently, or only `devtools: { enabled: true }`?, we split that so rather then redux or feature own plugin supportable so i prever devtools: {enabled: ture} so in future more feature can we add in needed
2. Should `scope` default to `"request"` in all environments? - resquet rather then "global" is more good
3. Should `"temp"` later support built-in `ttl` or `autoDispose`, or remain metadata only at first? will support more feature but one question reemain tepm is spicall i want because that is good usecase in form data collection
4. Should `validate` support both schema objects and raw functions from day one, or normalize only function-based validation first? how before exactly

## Recommendation

Proceed with:

- **strict proposal first**
- **internal split second**
- **grouped option integration third**

This is the cleanest path because it preserves developer experience while making the core genuinely smaller and easier to evolve.
