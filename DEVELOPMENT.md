# Development Guide

**Purpose**
This document is a practical guide for contributors. It explains how the codebase is layered, how feature runtimes are wired, and how registry scoping works so you can ship changes without asking for hidden context.

**Quick Start**
1. Install dependencies: `npm install`
2. Build: `npm run build`
3. Run tests: `npm test`
4. Type checks: `npm run typecheck` and `npm run test:types`
5. Performance tests: `npm run test:performance`

**Repo Map**
- `src/core`: store runtime (create/read/write/hydrate/transaction, registry, lifecycle).
- `src/notification`: flush scheduling and subscriber delivery.
- `src/async`: fetch/cache/retry/inflight/rate logic for async stores.
- `src/features`: feature runtimes (persist, sync, devtools).
- `src/computed`: computed store graph and recomputation.
- `src/selectors`: selector tracking and subscription helpers.
- `src/react`: React hooks and helpers.
- `src/server`: SSR support and request-scoped registries.
- `src/devtools`: devtools wiring.
- `src/internals`: shared internal utilities (config, diagnostics, reporting, test reset).
- `src/utils.ts`: base utilities used across layers.
- `tests/`: unit, integration, regression, SSR, performance tests.

**Layering Model**
Every module starts with a header like `LAYER: Store runtime` or `LAYER: Feature runtime`. That tag is the source of truth for dependency direction.

Layering rules:
- Lower layers must not import higher layers.
- Public API files (`src/index.ts`, `src/store.ts`, `src/async.ts`, `src/feature.ts`, `src/config.ts`) should be thin re-exports.
- If you need shared logic across layers, move it to `src/internals` or `src/utils.ts`.
- `src/features` can import `src/core`, `src/internals`, `src/utils.ts`, but should not import `src/react` or `src/server`.
- `src/core` should not import `src/react`, `src/server`, or `src/devtools`.

Practical layer ordering (low to high):
- Utilities and internals
- Core runtime
- Notification and async subsystems
- Feature runtimes
- Computed and selectors
- React + Server + Devtools
- Public API barrels

**Registries And runWithRegistry**
Stroid keeps state in `StoreRegistry` objects. There is a default registry (global) and request-scoped registries for SSR.

`runWithRegistry(registry, fn)` executes `fn` with the given registry set as the active registry for the duration of the call.
- On the server, `runWithRegistry` uses AsyncLocalStorage (see `src/server/index.ts`).
- In non-ALS environments it falls back to an internal stack so synchronous calls still work.
- `getActiveStoreRegistry()` reads the current active registry (or falls back to the default).

Use `runWithRegistry` when you have an explicit registry handle or when you call into store APIs from an async boundary and need the correct registry to be active.

Example:
```ts
import { runWithRegistry } from "./core/store-registry.js";
import { setStore } from "./core/store-write.js";

runWithRegistry(registry, () => {
  setStore("session", { userId: "abc" });
});
```

**Adding A Feature Runtime**
Feature runtimes are registered via the feature registry and invoked on create/write/delete.

1. Create a runtime module under `src/features/<name>.ts`.
2. Implement and export a `create<Name>FeatureRuntime()` that returns a `StoreFeatureRuntime`.
3. Register the runtime in a `register<Name>Feature()` function that calls `registerStoreFeature("<name>", factory)`.
4. Wire it into installation in `src/install.ts` and add a public entrypoint like `src/<name>.ts` if the feature is built-in.
5. Add option parsing if the feature needs config (see below).
6. Add tests in `tests/integration` or `tests/regression`.

Minimal skeleton:
```ts
import { registerStoreFeature, type StoreFeatureRuntime } from "./feature-registry.js";

export const createMyFeatureRuntime = (): StoreFeatureRuntime => ({
  onStoreCreate(ctx) {
    if (!ctx.options.features?.myFeature) return;
    ctx.log(`[myFeature] ${ctx.name} created`);
  },
  onStoreWrite(ctx) {
    if (!ctx.options.features?.myFeature) return;
    ctx.notify();
  },
});

export const registerMyFeature = (): void => {
  registerStoreFeature("myFeature", createMyFeatureRuntime);
};
```

Feature options:
- Built-in features add options directly to `StoreOptions` and `NormalizedOptions` in `src/adapters/options.ts`, then normalize them in `normalizeStoreOptions`.
- Third-party features should use `StoreOptions["features"]` and read `ctx.options.features?.myFeature`. You can add typing by augmenting `FeatureOptionsMap` in `src/adapters/options.ts`.

Runtime hook flow:
- Create: `runFeatureCreateHooks` in `src/core/store-lifecycle/hooks.ts`
- Write: `runFeatureWriteHooks`
- Delete: `runFeatureDeleteHooks`

**Contribution Checklist**
1. Update docs for public API changes (`API_REFERENCE.md` and `docs/api/API_REFERENCE.md`).
2. Add or update tests under `tests/`.
3. Run `npm test` and `npm run test:types` before opening a PR.
4. Keep new modules small and follow the LAYER boundaries above.
