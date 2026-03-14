# Architecture Overview

Weaknesses and tradeoffs (start here):
1. Optional features increase the mental model and can expose internals through public APIs.
2. Global registry coupling makes cross-feature side effects harder to reason about.
3. Snapshot cloning and hashing can be expensive for large or frequently updated stores.

Problem this system solves:
Stroid provides a predictable, feature-rich state management system with computed stores, async data, persistence, synchronization, and devtools support under a consistent API.

Core design philosophy:
Minimal abstraction over plain data; explicit store names; opt-in feature layers; runtime validation and diagnostics; predictable mutation with transactions and controlled notifications.

Architecture layers:
1. Public API layer - `src/store-write.ts`, `src/store-read.ts`, `src/hooks*.ts`. This exposes create, read, update, delete, and React bindings.
2. Lifecycle layer - `src/store-lifecycle/*`. This owns registry state, validation, and feature hook integration.
3. Notification layer - `src/store-notify.ts` and `src/store-transaction.ts`. This manages batching, snapshots, and subscriber delivery.
4. Computed layer - `src/computed.ts`, `src/computed-graph.ts`, `src/computed-entry.ts`. This tracks dependencies and recomputation.
5. Feature layer - `src/features/*` and `src/feature-registry.ts`. This adds persist, sync, devtools, and lifecycle hooks.
6. Integration layer - `src/server.ts` and runtime admin/tooling modules for SSR and diagnostics.

State model:
A single StoreRegistry holds store values, metadata, initial states and factories, subscribers, snapshot cache, computed graph, async cache state, and feature metadata.

Data flow:
createStore -> registry + meta -> setStore / reset / delete -> sanitize + validate -> middleware -> commit -> notify -> subscribers and computed recomputation. Async fetch writes to cache and store. Persist serializes state to storage. Sync broadcasts state versions.

Control flow:
Writes are synchronous and can be batched through transactions. Notifications are chunked and scheduled. Async fetches use Promise workflows with retry policies. Sync and persist are event-driven and timer-based.

Feature hook model:
Feature modules register create, write, and delete hooks via the feature registry. The lifecycle layer invokes these hooks to keep optional features decoupled from the core API.

Observability and diagnostics:
Diagnostics and devtools hooks provide visibility into store updates, async operations, and sync events, but production-grade telemetry requires external integration.
