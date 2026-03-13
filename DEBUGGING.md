# Debugging Stroid Registries and Proxy Access

This guide explains how `stores["user"]` and similar calls resolve under the hood,
so maintainers can set breakpoints and inspect the active registry without guessing.

## The Proxy Chain (What Actually Happens)

When you access a registry-backed object like `stores["user"]`, you are **not**
reading a plain object. You are hitting a Proxy defined in:
`src/store-lifecycle/registry.ts`.

Call chain (simplified):

```
stores["user"]
  -> Proxy get trap (createRegistryObjectProxy)
  -> getActiveRegistry()
     -> getActiveStoreRegistry(_defaultRegistry)
     -> initializeRegistryFeatureRuntimes(registry)
  -> registry.stores["user"]
```

Key details:
- `_defaultRegistry` is updated via `setRegistryContext(...)`.
- `getActiveStoreRegistry(...)` can swap the registry based on scope/request context.

## Where to Set Breakpoints

Use these locations when debugging registry access:

- `src/store-lifecycle/registry.ts` → `createRegistryObjectProxy` (Proxy get/set)
- `src/store-lifecycle/registry.ts` → `getActiveRegistry`
- `src/store-registry.ts` → `getActiveStoreRegistry`
- `src/store-lifecycle/registry.ts` → `setRegistryContext` (scope switches)

## Inspecting the Active Registry

If you are debugging inside the repo, you can read the registry directly:

```
import { getRegistry } from "stroid/store-lifecycle";

const registry = getRegistry();
console.log(registry.stores, registry.subscribers, registry.metaEntries);
```

For application-level inspection, prefer the public runtime tools:

```
import { listStores, getStoreMeta, getSubscriberCount } from "stroid/runtime-tools";

console.log(listStores());
console.log(getStoreMeta("user"));
console.log(getSubscriberCount("user"));
```

## Common Gotchas

- A request-scoped registry can be active, so `stores["user"]` may not be global.
- Missing stores return `undefined` silently (there is no thrown error at the proxy).
- Proxies hide the call chain in stack traces; set a breakpoint in the proxy trap.

---

If you want to surface the chain without changing behavior, you can add a dev-only
flag later (for example, `STROID_DEBUG_PROXY=1`) to log stack traces on proxy access.
