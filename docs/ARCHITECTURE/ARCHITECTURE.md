<div align="center">

# 🗂️ Stroid Architecture

[![Version](https://img.shields.io/badge/version-1.0.0-6e40c9?style=for-the-badge)](.)
[![Confidence](https://img.shields.io/badge/confidence-HIGH-22c55e?style=for-the-badge)](.)
[![Type](https://img.shields.io/badge/type-Architecture-f59e0b?style=for-the-badge)](.)
[![Last Updated](https://img.shields.io/badge/last_updated-March_2026-3b82f6?style=for-the-badge)](.)
[![Status](https://img.shields.io/badge/status-Production_Ready-22c55e?style=for-the-badge)](.)

**A named-store state engine — layered, zero-overhead, SSR-safe.**

*Fully audited · Derived from source · Built for contributors*

</div>

---

> [!NOTE]
> **Confidence: HIGH** — all content derived directly from source code structure and module annotations. If something is wrong here, it is wrong in the source.

---

## 📚 Table of Contents

| # | Section | What you'll learn |
|---|---------|-------------------|
| 1 | [Overview](#-overview) | Core design philosophy and naming model |
| 2 | [Layer Stack](#-layer-stack) | How modules are organised from API to internals |
| 3 | [Registry Model](#-registry-model) | The shape of runtime state for any scope |
| 4 | [Write Data Flow](#-write-data-flow) | Every step from `setStore()` to subscriber delivery |
| 5 | [Notification Pipeline](#-notification-pipeline) | Async delivery, priority, chunking, snapshots |
| 6 | [Feature Hook Model](#-feature-hook-model) | How persist / sync / devtools plug in with zero overhead |
| 7 | [SSR Isolation](#-ssr-isolation) | Per-request registry isolation via `AsyncLocalStorage` |
| 8 | [Computed Stores](#-computed-stores) | Derived values, dependency graphs, cycle detection |
| 9 | [Transaction Model](#-transaction-model) | Atomic batch writes and rollback semantics |
| 10 | [Config System](#-config-system) | Registry-scoped config, SSR clone safety |
| 11 | [Versioning](#-versioning) | Release history |

---

## 🧭 Overview

Stroid is a **named-store state engine**. Every store has a string name. That name is its address — used uniformly across every operation:

```
read · write · subscribe · persist · sync · compute · debug
```

> [!TIP]
> Think of the store name as a primary key. Every subsystem — notifications, features, devtools, SSR — addresses stores by name. There are no opaque references.

The system is **strictly layered**:

- A **small, mandatory core** handles reads, writes, subscriptions, and notifications.
- **Optional feature modules** self-register via hooks and add zero runtime overhead to stores that don't use them.
- **Integration layers** (React, SSR, selectors, devtools) sit on top and never reach into core internals.

---

## 🏗️ Layer Stack

The architecture is divided into **eight layers**, from the public API surface down to internal utilities.

```mermaid
graph TB
    subgraph API ["🌐  Public API Surface"]
        IDX["src/index.ts · stroid barrel"]
        STORE["src/store.ts · core re-exports"]
    end

    subgraph CORE ["⚙️  Core Runtime  (src/core/)"]
        direction LR
        W["store-write.ts\ncreateStore · setStore\ndeleteStore · hydrateStores"]
        R["store-read.ts\ngetStore · hasStore\ngetMetrics"]
        N["store-notify.ts\nsubscribeStore\nsetStoreBatch"]
        NM["store-name.ts\nstore() · namespace()"]
        TX["store-transaction.ts\nbatch · rollback"]
    end

    subgraph LC ["🔁  Lifecycle  (src/core/store-lifecycle/)"]
        direction LR
        REG["registry.ts\nStoreRegistry · meta\nsubscribers"]
        VAL["validation.ts\nsanitize · path cache\nnormalizeCommit"]
        HK["hooks.ts\nfeature hook\ninvocation"]
        ID["identity.ts\nnameOf · reportError\nSSR warnings"]
    end

    subgraph NOTIFY ["🔔  Notification  (src/notification/)"]
        direction LR
        SCH["scheduler.ts\nchunked delivery\npriority ordering"]
        DEL["delivery.ts\nsubscriber dispatch"]
        SNAP["snapshot.ts\ndeep · shallow · ref"]
        PRI["priority.ts\nstore ordering"]
    end

    subgraph FEAT ["🧩  Features  (src/features/)"]
        direction LR
        PER["persist.ts\nload · save · crypto\nwatch"]
        SYN["sync.ts\nBroadcastChannel\nhooks"]
        DEV["devtools.ts\nhistory · redaction"]
        LCY["lifecycle.ts\nmiddleware runner\nMIDDLEWARE_ABORT"]
    end

    subgraph COMP ["🧮  Computed  (src/computed/)"]
        CMP["index.ts\ncreateComputed\ndeleteComputed"]
        GRP["computed-graph.ts\ndependency graph\ncycle detection"]
    end

    subgraph ASYNC ["⚡  Async  (src/async/)"]
        direction LR
        FET["fetch.ts\nfetchStore\nrefetchStore"]
        CACHE["cache.ts\nTTL cache\ninflight registry"]
        RET["retry.ts · rate.ts\nretry delay\nrate limiter"]
    end

    subgraph INT ["🔌  Integrations"]
        direction LR
        RCT["src/react/\nuseStore · useSelector\nuseFormStore"]
        SSR["src/server/\ncreateStoreForRequest\nAsyncLocalStorage"]
        SEL["src/selectors/\ncreateSelector\nsubscribeWithSelector"]
        DT["src/devtools/\ngetHistory\ninstallDevtools"]
        RT["src/runtime-tools/\nlistStores · getMetrics\ngetStoreHealth"]
    end

    subgraph PRIV ["🔒  Internals  (src/internals/)"]
        direction LR
        CFG["config.ts\nconfigureStroid"]
        DIAG["diagnostics.ts\nwarn · error routing"]
        WC["write-context.ts\ncorrelationId\ntraceContext"]
    end

    API --> CORE
    CORE --> LC
    LC --> NOTIFY
    LC --> FEAT
    LC --> COMP
    LC --> ASYNC
    CORE --> INT
    LC --> PRIV
```

<details>
<summary>📋 Full module reference — ASCII tree (click to expand)</summary>

```
┌────────────────────────────────────────────────────────────┐
│ src/index.ts          Public API barrel (stroid)           │
│ src/store.ts          Core runtime re-exports              │
├────────────────────────────────────────────────────────────┤
│ src/core/                                                  │
│   store-write.ts      createStore, setStore, etc.          │
│   store-read.ts       getStore, hasStore, getMetrics       │
│   store-notify.ts     subscribeStore, setStoreBatch        │
│   store-name.ts       store(), namespace()                 │
│   store-transaction.ts  batch/rollback state               │
├────────────────────────────────────────────────────────────┤
│ src/core/store-lifecycle/                                  │
│   registry.ts         StoreRegistry, meta, subscribers     │
│   validation.ts       sanitize, path cache, normalizeCommit│
│   hooks.ts            feature hook invocation              │
│   identity.ts         nameOf, reportError, SSR warnings    │
│   types.ts            StoreDefinition, WriteResult, paths  │
│   bind.ts             feature API binding                  │
├────────────────────────────────────────────────────────────┤
│ src/notification/                                          │
│   scheduler.ts        chunked delivery, priority ordering  │
│   delivery.ts         subscriber dispatch                  │
│   snapshot.ts         snapshot mode handling               │
│   priority.ts         priority store ordering              │
│   metrics.ts          notify timing                        │
├────────────────────────────────────────────────────────────┤
│ src/computed/                                              │
│   index.ts            createComputed, deleteComputed       │
│   computed-graph.ts   dependency graph, cycle detection    │
├────────────────────────────────────────────────────────────┤
│ src/features/                                              │
│   feature-registry.ts registerStoreFeature, hook dispatch  │
│   persist.ts          persistence feature hooks            │
│   persist/            crypto, load, save, watch, types     │
│   sync.ts             BroadcastChannel sync feature hooks  │
│   devtools.ts         history, redaction feature hooks     │
│   lifecycle.ts        MIDDLEWARE_ABORT, middleware runner   │
│   state-helpers.ts    createEntityStore, createCounterStore│
├────────────────────────────────────────────────────────────┤
│ src/async/                                                 │
│   fetch.ts            fetchStore, refetchStore             │
│   cache.ts            TTL cache, inflight registry         │
│   retry.ts            retry delay logic                    │
│   rate.ts             per-store rate limiter               │
│   inflight.ts         dedup / version tracking             │
│   request.ts          buildFetchOptions, parseResponseBody │
│   errors.ts           async usage error routing            │
│   registry.ts         async registry shape                 │
├────────────────────────────────────────────────────────────┤
│ src/selectors/index.ts  createSelector, subscribeWithSelector│
│ src/react/            useStore, useSelector, useFormStore  │
│ src/server/           createStoreForRequest (AsyncLocalStorage)│
│ src/helpers/          createEntityStore, createListStore   │
│ src/devtools/         getHistory, clearHistory, installDevtools│
│ src/runtime-tools/    listStores, getMetrics, getStoreHealth│
│ src/runtime-admin/    clearAllStores, clearStores          │
├────────────────────────────────────────────────────────────┤
│ src/internals/                                             │
│   config.ts           configureStroid, global config state │
│   diagnostics.ts      warn/error routing                   │
│   store-ops.ts        internal store read/write            │
│   store-admin.ts      delete hooks                         │
│   write-context.ts    correlationId / traceContext         │
│   test-reset.ts       deterministic test teardown          │
│   computed-order.ts   topological sort                     │
│   selector-store.ts   selector-facing store access         │
│   hooks-warnings.ts   one-time warning deduplication       │
│   reporting.ts        structured error reporting           │
└────────────────────────────────────────────────────────────┘
```

</details>

---

## 🗄️ Registry Model

A `StoreRegistry` holds **all runtime state** for a given scope — values, snapshots, subscribers, metadata, and scheduler state.

```mermaid
classDiagram
    class StoreRegistry {
        +stores: Record~string, unknown~
        +initialStates: Record~string, unknown~
        +initialFactories: Record~string, fn~
        +subscribers: Record~string, Set~Subscriber~~
        +metaEntries: Record~string, StoreMeta~
        +notify: FlushState
        +computedCleanups: Map~string, fn~
        +scope: global | request | temp
    }

    class StoreMeta {
        +createdAt: number
        +updatedAt: number
        +updateCount: number
        +correlationId: string
        +options: StoreOptions
    }

    class FlushState {
        +pending: boolean
        +queue: string[]
        +chunk: number
    }

    StoreRegistry "1" --> "many" StoreMeta : metaEntries
    StoreRegistry "1" --> "1" FlushState : notify
```

<details>
<summary>🔍 Full registry shape in TypeScript (click to expand)</summary>

```ts
{
  stores:           Record<string, unknown>            // live store values
  initialStates:    Record<string, unknown>            // deep clones at create time
  initialFactories: Record<string, () => unknown>      // lazy factories for deferred hydration
  subscribers:      Record<string, Set<Subscriber>>    // per-store notification sets
  metaEntries:      Record<string, StoreMeta>          // metrics, options, timestamps
  notify:           FlushState                         // scheduler state machine
  computedCleanups: Map<string, () => void>            // teardown functions for computed stores
  scope:            "global" | "request" | "temp"      // registry lifetime type
}
```

</details>

> [!NOTE]
> In SSR, each inbound request gets its own `StoreRegistry` via `AsyncLocalStorage`. The **global registry** is used in browser environments and non-SSR Node processes. Scopes never bleed into one another.

### Scope lifecycle

| Scope | Created by | Lifetime | Shared across requests? |
|-------|-----------|----------|------------------------|
| `"global"` | Module load | Process lifetime | ✅ Yes (browser / Node) |
| `"request"` | `createStoreForRequest()` | Single HTTP request | ❌ No — fully isolated |
| `"temp"` | Internal testing utilities | Test run | ❌ No |

---

## 🔄 Write Data Flow

Every call to `setStore()` passes through a deterministic pipeline before any subscriber is notified.

```mermaid
flowchart TD
    START(["setStore(name, update)"])

    START --> A["🔍 Resolve active registry\nglobal or request-scoped"]
    A --> B["💧 materializeInitial\nlazy store hydration"]
    B --> C{Store registered?}

    C -- "❌ No" --> ERR(["⛔ Throw / warn\nvia reportError()"])

    C -- "✅ Yes" --> D["⚙️ Compute next value\nmerge · deep path · mutator fn"]
    D --> E["🧹 sanitizeValue\nreject non-serializable types"]
    E --> F["🛡️ runMiddlewareForStore"]

    F -- "🚫 MIDDLEWARE_ABORT" --> ABORT(["⛔ Write aborted\nno notification"])
    F -- "✅ continue" --> G["✔️ normalizeCommittedState\nvalidate rule"]

    G --> H{"shallowEqual?\nnext === current"}
    H -- "✅ unchanged" --> SKIP(["⏭️ Skip — no notification"])

    H -- "❌ changed" --> I{Inside\nsetStoreBatch?}

    I -- "✅ Yes" --> BATCH["📦 stageTransactionValue\nregisterTransactionCommit\nheld until batch end"]

    I -- "❌ No" --> COMMIT

    subgraph COMMIT ["commitStoreUpdate()"]
        direction TB
        C1["💾 setStoreValueInternal"]
        C2["🏷️ Update meta\nupdatedAt · updateCount · correlationId"]
        C3["🔗 runFeatureWriteHooks\npersist save · sync broadcast · devtools record"]
        C4["🎣 runStoreHookSafe\nonSet lifecycle hook"]
        C5["📣 notifyStore → scheduler → subscribers"]
        C1 --> C2 --> C3 --> C4 --> C5
    end

    style ERR fill:#fca5a5,stroke:#ef4444,color:#7f1d1d
    style ABORT fill:#fca5a5,stroke:#ef4444,color:#7f1d1d
    style SKIP fill:#d1fae5,stroke:#10b981,color:#064e3b
    style BATCH fill:#fef3c7,stroke:#f59e0b,color:#78350f
    style COMMIT fill:#dbeafe,stroke:#3b82f6,color:#1e3a8a
```

> [!WARNING]
> Middleware can return `MIDDLEWARE_ABORT` to cancel a write entirely — no value is committed, no subscribers are notified, and no feature hooks run.

> [!TIP]
> The `shallowEqual` check is a deliberate performance gate. If the computed next value is reference-equal (or shallow-equal for objects) to the current value, the entire notification phase is skipped — even inside a batch.

---

## 🔔 Notification Pipeline

After `commitStoreUpdate()` calls `notifyStore()`, control moves entirely into `src/notification/`. Delivery is **always asynchronous** relative to the write.

```mermaid
sequenceDiagram
    participant W as store-write.ts
    participant S as scheduler.ts
    participant P as priority.ts
    participant D as delivery.ts
    participant SN as snapshot.ts
    participant SUB as Subscriber

    W->>S: notifyStore(name)
    S->>S: enqueue name into flush queue

    Note over S: Next microtask / frame

    S->>P: order queue by priorityStores config
    P-->>S: ordered store list

    loop For each store in ordered queue (chunked)
        S->>D: dispatch(storeName, subscribers)
        D->>SN: clone(value, snapshotMode)
        SN-->>D: deep | shallow | ref clone
        D->>SUB: subscriber(value, prev)

        alt Store updated mid-flush
            W->>S: notifyStore(name) [re-enqueue]
            S->>D: re-deliver updated snapshot in same cycle
        end
    end
```

### Pipeline configuration

| Concern | What it does | Config key | Default |
|---------|-------------|------------|---------|
| **Priority ordering** | Listed stores notify their subscribers first | `flush.priorityStores` | `[]` |
| **Chunked delivery** | Splits subscriber calls across frames to avoid blocking | `flush.chunkSize` | unbounded |
| **Chunk delay** | Gap between chunks in ms | `flush.chunkDelayMs` | `0` |
| **Snapshot mode** | Controls depth of value clone sent to each subscriber | `snapshot` | `"deep"` |
| **Mid-flush re-delivery** | Updated stores re-queued and delivered in same flush cycle | automatic | always on |

> [!WARNING]
> `snapshot: "ref"` skips cloning entirely — subscribers receive the live store reference. Use only when you own all mutation paths and never mutate state you receive in a subscriber.

---

## 🧩 Feature Hook Model

Optional features plug into the core lifecycle via **three hook points**, invoked by `src/core/store-lifecycle/hooks.ts`. Each feature self-registers with `registerStoreFeature()` and is **completely absent from the call path** for stores that don't use it.

```mermaid
flowchart LR
    subgraph CORE ["Core Lifecycle"]
        CREATE["createStore()"]
        WRITE["commitStoreUpdate()"]
        DELETE["deleteStore()"]
    end

    subgraph HOOKS ["Hook Dispatch  (hooks.ts)"]
        H1["onStoreCreate"]
        H2["onStoreWrite"]
        H3["beforeStoreDelete"]
    end

    subgraph FEATURES ["Registered Features"]
        P["🟢 persist\nload · save · cleanup"]
        SY["🔵 sync\nsubscribe · broadcast · unsub"]
        DV["🟡 devtools\ninit history · record · —"]
        AX["🔴 async\n— · — · cancel inflight"]
    end

    CREATE -->|triggers| H1
    WRITE  -->|triggers| H2
    DELETE -->|triggers| H3

    H1 --> P & SY & DV
    H2 --> P & SY & DV
    H3 --> P & SY & AX
```

### Hook responsibility matrix

| Hook | Fired after… | 🟢 persist | 🔵 sync | 🟡 devtools | 🔴 async |
|------|-------------|-----------|---------|------------|---------|
| `onStoreCreate` | `createStore()` succeeds | Load persisted value | Subscribe to channel | Init history buffer | — |
| `onStoreWrite` | Value committed | Save to storage | Broadcast update | Record history entry | — |
| `beforeStoreDelete` | Before store removed | Cleanup storage key | Unsubscribe channel | — | Cancel inflight |

> [!WARNING]
> If `persist: true` is set on a store but `installPersist()` was never called, Stroid emits a warning. Set `strictMissingFeatures: true` in config to promote this to a thrown error.

<details>
<summary>🔍 How to register a custom feature (click to expand)</summary>

```ts
import { registerStoreFeature } from 'stroid/features';

registerStoreFeature({
  name: 'my-feature',

  onStoreCreate(storeName, registry) {
    // called after every createStore() for stores that opt in
  },

  onStoreWrite(storeName, next, prev, registry) {
    // called after every committed write
  },

  beforeStoreDelete(storeName, registry) {
    // called before deleteStore() removes the store
  },
});
```

</details>

---

## 🌐 SSR Isolation

`createStoreForRequest` (exported from `stroid/server`) creates a fresh `StoreRegistry` for each inbound request and runs the provided async callback inside it using Node's `AsyncLocalStorage`. **Every store operation inside the callback — including nested awaits — resolves to the request-scoped registry.**

```mermaid
sequenceDiagram
    participant HTTP as HTTP Request
    participant SFR as createStoreForRequest()
    participant ALS as AsyncLocalStorage
    participant REG as Request Registry
    participant APP as App Code

    HTTP->>SFR: inbound request
    SFR->>REG: new StoreRegistry { scope: "request" }
    SFR->>ALS: run(registry, callback)

    activate ALS
    ALS->>APP: callback(stores)

    APP->>REG: stores.hydrate(fn) — seed initial state
    APP->>APP: render / process
    APP->>REG: getStore(), setStore(), subscribeStore()

    Note over REG: Concurrent requests use separate registries — zero bleed

    APP->>SFR: stores.snapshot() — serialise for client
    deactivate ALS

    SFR-->>HTTP: html + stateSnapshot
```

### SSR stores API

```ts
const { html, state } = await createStoreForRequest(async (stores) => {

  // 1. Seed server-side state
  await stores.hydrate((set) => {
    set('user',    await fetchUser(req));
    set('session', await fetchSession(req));
  });

  // 2. Render — all store reads resolve to this request's registry
  const html = renderToString(<App />);

  // 3. Serialise state for client hydration
  return { html, state: stores.snapshot() };
});
```

> [!NOTE]
> Concurrent requests **never share** store values, subscribers, or scheduler state. Each `createStoreForRequest` call produces a fully independent registry that is garbage collected when the callback resolves.

---

## 🧮 Computed Stores

Computed stores are regular named stores whose values are **derived** from one or more dependency stores. They are transparent to subscribers — you subscribe to a computed store exactly as you would any other.

```mermaid
flowchart TD
    subgraph DEPS ["Dependency Stores"]
        DA["depStore A\n(named store)"]
        DB["depStore B\n(named store)"]
        DC["depStore C\n(named store)"]
    end

    subgraph GRAPH ["computed-graph.ts"]
        direction TB
        TRACK["Track dependencies\non first run"]
        CYCLE["Check for cycles\nat registration time"]
        TOPO["Topological sort\nfor flush ordering"]
        TRACK --> CYCLE --> TOPO
    end

    subgraph COMPUTED ["Computed Store"]
        FN["computeFn(a, b, c)"]
        RS["replaceStore(name, result)"]
        FN --> RS
    end

    DA & DB & DC -->|"any dep changes"| GRAPH
    GRAPH -->|"re-run"| FN
    RS -->|"notifies subscribers\nlike any write"| SUB(["📣 Subscribers"])

    style CYCLE fill:#fef3c7,stroke:#f59e0b
    style TOPO fill:#dbeafe,stroke:#3b82f6
```

Two key guarantees:

| Guarantee | Mechanism |
|-----------|-----------|
| **No circular dependencies** | Cycle detection runs at `createComputed()` call time — throws immediately if a cycle is introduced |
| **Correct flush order** | The notification scheduler topologically sorts stores so dependents always see up-to-date dependency values |

<details>
<summary>🔍 Creating a computed store (click to expand)</summary>

```ts
import { createComputed } from 'stroid/computed';

// Derived from two named dependencies
createComputed('fullName', ['firstName', 'lastName'], (first, last) => {
  return `${first} ${last}`;
});

// Subscribe exactly as with any other store
subscribeStore('fullName', (value) => {
  console.log('Full name changed:', value);
});
```

</details>

---

## 📦 Transaction Model

`setStoreBatch(fn)` provides **atomic multi-store writes**. All `setStore()` calls inside the batch are staged rather than committed immediately. They either all commit or all roll back.

```mermaid
stateDiagram-v2
    [*] --> BatchOpen : setStoreBatch(fn)

    BatchOpen --> Staging : setStore() calls\nstageTransactionValue()

    Staging --> Staging : more setStore() calls

    Staging --> Committing : fn() returns\nwithout error

    Committing --> Committed : all staged values\ncommit atomically\nnotifyStore fires for each

    Committing --> [*] : done

    Staging --> RolledBack : fn() throws\nor write fails

    RolledBack --> [*] : all staged values\ndiscarded — no notification

    state Committed {
        [*] --> NotifyAll
        NotifyAll --> [*]
    }
```

> [!WARNING]
> **Disallowed inside a batch:** `createStore`, `deleteStore`, and `hydrateStores` will throw (or warn, depending on config) if called while a batch is open. Stores must exist before the batch begins.

<details>
<summary>🔍 Batch usage example (click to expand)</summary>

```ts
import { setStoreBatch } from 'stroid';

// All three writes commit atomically, or none do
setStoreBatch(() => {
  setStore('cart',   addItem(getStore('cart'), newItem));
  setStore('total',  recalculate());
  setStore('synced', false);
});

// Subscribers for cart, total, and synced all fire after the batch commits
```

</details>

---

## ⚙️ Config System

`configureStroid(config)` is **registry-scoped**, not process-global. In SSR, each request registry receives a **deep clone** of the global config so that per-request adjustments cannot bleed into adjacent requests.

```ts
configureStroid({
  // Notification tuning
  flush: {
    priorityStores: ['auth', 'session'],  // these notify subscribers first
    chunkSize:      20,                   // subscribers per delivery chunk
    chunkDelayMs:   4,                    // ms gap between chunks
  },

  // Default snapshot mode for all stores (overridable per store)
  snapshot: 'deep',                       // "deep" | "shallow" | "ref"

  // Feature safety
  strictMissingFeatures: true,            // throw instead of warn on missing features
});
```

### Config inheritance in SSR

```mermaid
flowchart LR
    GC["Global Config\nconfigureStroid(...)"]
    GC -->|"deep clone at\nrequest start"| RC1["Request A\nRegistry Config"]
    GC -->|"deep clone"| RC2["Request B\nRegistry Config"]
    GC -->|"deep clone"| RC3["Request C\nRegistry Config"]

    RC1 -.->|"isolated mutation\nno bleed"| RC1
    RC2 -.->|"isolated mutation\nno bleed"| RC2
```

> [!NOTE]
> The global config acts as a **baseline template**. Each request registry can mutate its local clone freely — changing log levels, toggling middleware — without affecting any other request or the global default.

---

## 🏷️ Versioning

<div align="center">

| Field | Value |
|-------|-------|
| **Version** | `1.0.0` |
| **Released** | March 2026 |
| **Scope** | Core runtime · Registry isolation · Computed stores · SSR request scoping · Feature hook model · Async fetch layer · Transaction batch / rollback |
| **Changelog** | [CHANGELOG.md](./CHANGELOG.md) |

</div>

---

<div align="center">

*Architecture document maintained by the Stroid core team.*
*Open a PR to propose corrections — all claims are verifiable against source.*

</div>