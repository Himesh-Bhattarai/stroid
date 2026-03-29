# ⚙️ Configuration Guide

> **Version:** 1.0 &nbsp;|&nbsp; **Last Updated:** 2026-03-29 &nbsp;|&nbsp; **Confidence:** ![HIGH](https://img.shields.io/badge/confidence-HIGH-brightgreen)
>
> *Derived from `src/internals/config.ts`, `src/config.ts`*

---

## 📚 Table of Contents

- [Setup](#-setup)
- [configureStroid()](#-configurestroid)
- [Core Options](#-core-options)
- [Logging](#-logging)
- [Async Options](#-async-options)
- [SSR & Hydration](#-ssr--hydration)
- [Performance & Cloning](#-performance--cloning)
- [Validation](#-validation)
- [Type Safety](#-type-safety)
- [Registry-Scoped Config](#-registry-scoped-config)

---

## ⚙️ Setup

```ts
import { configureStroid } from "stroid"

// Call once, early in your app initialization
configureStroid({
  namespace: "myapp",
  strictMissingFeatures: true,
  defaultSnapshotMode: "deep",
  // ... other options
})
```

> [!NOTE]
> Configuration is registry-scoped. Each request's `createStoreForRequest()` can have its own config. Call `configureStroid()` before creating stores to apply to the default registry.

---

## 🎛️ configureStroid()

**Type:**
```ts
configureStroid(options?: StroidConfig): void
```

**Options are applied to the active store registry** — the global registry by default, or the request registry inside `.hydrate()` and server handlers.

---

## 📋 Core Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `namespace` | `string` | `""` | Prefix for stores (useful for multi-app environments). Applied when reading/writing stores. |
| `strictMissingFeatures` | `boolean` | `true` | Throw errors when using unloaded features (e.g., calling `fetchStore` without importing `"stroid/async"`). |
| `strictMutatorReturns` | `boolean` | `true` | Throw if a mutator function returns a value (should use draft instead). |
| `assertRuntime` | `boolean` | `false` | Throw errors for invalid runtime conditions. Useful for strict development. |

---

## 📨 Logging

**Type:**
```ts
logSink?: {
  log?: (msg: string, meta?: Record<string, unknown>) => void
  warn?: (msg: string, meta?: Record<string, unknown>) => void
  critical?: (msg: string, meta?: Record<string, unknown>) => void
}
```

**Example:**
```ts
configureStroid({
  logSink: {
    log: (msg, meta) => logger.info(msg, meta),
    warn: (msg, meta) => logger.warn(msg, meta),
    critical: (msg, meta) => logger.error(msg, meta),
  }
})
```

Default: Logs to `console.log`, `console.warn`, `console.error` with `[stroid]` prefix.

---

## 🔄 Async Options

| Option | Type | Values | Default | Description |
|--------|------|--------|---------|-------------|
| `asyncAutoCreate` | `boolean` | - | `false` | Automatically create stores when `fetchStore()` encounters missing stores. |
| `asyncCloneResult` | `string` | `"none"` \| `"shallow"` \| `"deep"` | `"none"` | Clone async fetch results before writing to store (prevents mutations affecting the cache). |
| `strictAsyncUsageErrors` | `boolean` | - | `false` | Throw errors on async usage mistakes instead of returning `null` and logging. |
| `autoCorrelationIds` | `boolean` | - | `false` | Auto-generate correlation IDs for async fetch writes (useful for tracing). |

### revalidateOnFocus

Controls behavior when the browser regains focus ([`enableRevalidateOnFocus`](../STROID_ASYNC/INDEX.md)):

```ts
revalidateOnFocus?: {
  debounceMs?: number      // Debounce re-fetch: 0 (default)
  maxConcurrent?: number   // Max concurrent fetches: 3 (default)
  staggerMs?: number       // Delay between concurrent fetches: 100ms (default)
}
```

---

## 🔒 SSR & Hydration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `allowTrustedHydration` | `boolean` | `false` | Allow `hydrateStores()` to accept snapshots without explicit trust verification. Use only for trusted internal sources. |
| `allowHydration` | `boolean` | `false` | Alias for `allowTrustedHydration` (deprecated name). |

> [!WARNING]
> Only set `allowTrustedHydration: true` for internal state sources (your server, not user input).

---

## 📊 Performance & Cloning

| Option | Type | Values | Default | Description |
|--------|------|--------|---------|-------------|
| `defaultSnapshotMode` | `string` | `"deep"` \| `"shallow"` \| `"ref"` | `"deep"` | How deeply to clone store state on reads. `"ref"` = no clone, `"shallow"` = one level. |
| `snapshotStrategy` | `string` | `"deep"` \| `"shallow"` \| `"ref"` | — | Alias for `defaultSnapshotMode`. |
| `selectorCloneFrozen` | `boolean` | - | `true` | Clone frozen stores before proxy tracking in selectors (safer in dev). |
| `pathCacheSize` | `number` | - | `500` | Max cached path validation verdicts per store. Increase if using many unique paths. |

### Snapshot Modes

```ts
// "deep" (default) — full deep clone
const state = getStore("user") // Structurally independent copy
state.profile.name = "Hacked"  // Original unaffected
getStore("user").profile.name  // Still original value

// "shallow" — one level deep
configureStroid({ defaultSnapshotMode: "shallow" })
const state = getStore("user")
state.profile = {}            // Original unaffected
state.profile.name = "Hacked" // Original affected (shallow)

// "ref" — no clone (fastest, but mutable)
configureStroid({ defaultSnapshotMode: "ref" })
const state = getStore("user")
state.name = "Hacked"         // Original affected
```

---

## 🧪 Validation

### Middleware

Intercept and validate writes before they hit a store:

```ts
import { MIDDLEWARE_ABORT } from "stroid"

configureStroid({
  middleware: [
    (ctx) => {
      if (ctx.storeName === "admin" && !user.isAdmin) {
        return MIDDLEWARE_ABORT // Reject write
      }
      // Return void to allow write through unmodified
    }
  ]
})
```

**Middleware Context (`MiddlewareCtx`):**
```ts
type MiddlewareCtx = {
  storeName: string
  path?: string
  value: any
  op: "merge" | "path" | "mutator" | "replace"
}
```

---

## 🔗 Type Safety

### mutatorProduce

Enable structural sharing with [Immer](https://immerjs.github.io/):

```ts
import { produce } from "immer"
import { configureStroid, registerMutatorProduce } from "stroid"

// Option 1: Register globally (recommended)
registerMutatorProduce(produce)
createStore("user", { name: "Ava" })

// Option 2: Configure inline
configureStroid({
  mutatorProduce: produce
})

// Option 3: Use "immer" string (if registered)
configureStroid({
  mutatorProduce: "immer"
})
```

### acknowledgeLooseTypes

Suppress dev warnings when you intentionally skip `StoreStateMap` augmentation:

```ts
configureStroid({
  acknowledgeLooseTypes: true
})
```

---

## 🗂️ Flush Configuration

Controls notification batching for performance:

```ts
flush?: {
  chunkSize?: number       // Max writes per batch: ∞ (default)
  chunkDelayMs?: number    // Delay before flush: 0ms (default)
  priorityStores?: string[] // Flush these stores first
}
```

**Example:**
```ts
configureStroid({
  flush: {
    chunkSize: 50,         // Batch up to 50 writes
    chunkDelayMs: 16,      // Wait 16ms (one frame)
    priorityStores: ["ui", "auth"] // Flush UI state first
  }
})
```

---

## 📍 Registry-Scoped Config

Each store registry (default global + per-request) has its own config:

```ts
// Global config (applies to all stores by default)
configureStroid({ namespace: "global" })

// Request-scoped config (inside .hydrate or request handler)
const stores = await createStoreForRequest(async ({ configureStroid }) => {
  configureStroid({ namespace: "request-123" })
  // Only this request's stores see this config
})
```

---

## 🔄 Resetting Configuration

For testing:

```ts
import { resetConfig } from "stroid"

resetConfig() // Restore defaults
```

---

## Summary

| Use Case | Options |
|----------|---------|
| **Logging to custom logger** | `logSink` |
| **Reduce memory with shallow cloning** | `defaultSnapshotMode: "shallow"` |
| **Dev safety (catch mistakes)** | `strictMissingFeatures`, `strictMutatorReturns`, `assertRuntime` |
| **Immer structural sharing** | `registerMutatorProduce(produce)` or `mutatorProduce` |
| **Auto-fetch validation** | `middleware` |
| **Async reliability** | `autoCorrelationIds`, `revalidateOnFocus` |
| **SSR safety** | `allowTrustedHydration` (only for trusted sources) |
