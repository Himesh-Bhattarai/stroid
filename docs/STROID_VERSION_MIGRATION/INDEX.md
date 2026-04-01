# 📦 Version Migration Guide

> **Version:** 0.1.4 &nbsp;|&nbsp; **Last Updated:** 2026-04-01 &nbsp;|&nbsp; **Confidence:** ![HIGH](https://img.shields.io/badge/confidence-HIGH-brightgreen)
>
> *Per-release migration scripts and breaking changes*

---

## 📚 Table of Contents

- [Current Version](#-current-version)
- [Migration Strategy](#-migration-strategy)
- [Breaking Changes](#-breaking-changes)
- [Deprecations](#-deprecations)
- [How to Report Issues](#-how-to-report-issues)

---

## 📌 Current Version

**Stroid v0.1.4**

```json
{
  "name": "stroid",
  "version": "0.1.4",
  "description": "Deterministic state engine for React and JavaScript with SSR-safe isolation, multi-store coordination, and decision-driven state workflows."
}
```

---

## 🔄 Migration Strategy

Since Stroid is in **active beta** (v0.1.x), breaking changes may occur. When upgrading:

1. **Check this file** for breaking changes in your version range
2. **Review TypeScript errors** — they often point directly to required changes
3. **Run tests** — your test suite will catch most issues
4. **Check the CHANGELOG** — see `CHANGELOG.md` in the repo

---

## ⚠️ Breaking Changes

### v0.1.4

`0.1.4` itself is a fixes-only release. It does not add new breaking changes beyond the `0.1.4-beta.0` upgrade notes below.

### Upgrading from `0.1.3` to `0.1.4`

The `0.1.4` release line includes these upgrade-relevant breaking changes introduced in `0.1.4-beta.0`:

#### Optional feature modules are now explicit installers

`stroid/persist`, `stroid/sync`, and `stroid/devtools` are now side-effect-free modules. Importing them no longer registers the feature runtime automatically.

**Before:**
```ts
import "stroid/persist";
import "stroid/sync";
import "stroid/devtools";
```

**After:**
```ts
import { installPersist } from "stroid/persist";
import { installSync } from "stroid/sync";
import { installDevtools } from "stroid/devtools";

installPersist();
installSync();
installDevtools();
```

You can also install them from `stroid/install`:

```ts
import { installPersist, installSync, installDevtools } from "stroid/install";

installPersist();
installSync();
installDevtools();
```

**Impact:** Stores configured with `persist`, `sync`, or DevTools support will stay inactive until the relevant installer is called.

#### Removed placeholder framework exports

Dead placeholder exports for `stroid/vue` and `stroid/svelte` were removed from the published package.

**Migration:** Remove those imports or switch to supported public entrypoints only.

#### Optional adoption: post-hydration consistency

`0.1.4` also adds an optional post-hydration consistency surface:

```ts
hydrateStores(snapshot, options, trust, consistency?)
```

This is **not** a breaking migration. Existing trusted hydration calls still work unchanged:

```ts
hydrateStores(snapshot, options, { allowTrusted: true })
```

If you want to adopt the new consistency layer, the lowest-friction rollout is:

- start with `bootWindowMs` plus `onDrift`
- keep server-truth stores on `server_wins`
- keep drafts/forms on `client_wins`
- use `merge` for shallow mergeable objects
- use `invalidate_and_refetch` only when the store already has a replayable `fetchStore(...)` recipe

Operational usage, policy defaults, and runtime-tools inspection live in [Post-Hydration Consistency](../STROID_SERVER/POST_HYDRATION_CONSISTENCY.md).

---

## 🗑️ Deprecations

### allowUntrustedHydration → allowTrustedHydration

**Status:** Deprecated before `0.1.4`; still supported in `0.1.4`

**Old (deprecated):**
```ts
configureStroid({
  allowUntrustedHydration: true // ❌ Confusing name
})
```

**New (recommended):**
```ts
configureStroid({
  allowTrustedHydration: true // ✅ Clearer intent
})
```

**Why:** The old name was semantically opposite to its intent. Use `allowTrustedHydration` or the alias `allowHydration`.

**Migration:**
```ts
// Replace all instances:
allowUntrustedHydration → allowTrustedHydration
```

The old name still works but may be removed in v0.2.0.

---

## 🎯 Version History

### v0.1.4 (Current)

- ✅ Final `0.1.4` release is fixes-only
- ⚠️ Upgrade from `0.1.3` still requires the explicit feature installer migration
- 📝 Migration guidance should be read together with `CHANGELOG.md`

**Key exports:**
- `createStore`, `getStore`, `setStore` — Core API
- `useStore`, `useSelector`, `useAsyncStore` — React hooks
- `fetchStore`, `refetchStore` — Async data fetching
- `sync` — Cross-tab/cross-worker sync
- `persist` — Data persistence
- `psr` — Parallel State Reduction

---

## 🔍 Pre-Release Status

**Beta considerations:**
- Some features are experimental and may change
- Type definitions are comprehensive but may shift
- Documentation is actively updated (you're reading it!)
- Bug reports are welcome — they help shape the final release

---

## 📋 Upgrade Checklist

When moving from one minor version to the next:

- [ ] Consult this file for breaking changes
- [ ] Run TypeScript type check: `npm run typecheck`
- [ ] Run your test suite: `npm test`
- [ ] Check imports are still valid
- [ ] Call `installPersist()`, `installSync()`, and `installDevtools()` explicitly if you use those features
- [ ] If adopting post-hydration consistency, add the optional fourth `hydrateStores(..., consistency?)` argument deliberately instead of changing every hydration call at once
- [ ] Test async operations (if using `fetchStore`)
- [ ] Test SSR (if using `createStoreForRequest`)
- [ ] Test persistence (if using `persist`)

---

## 🐛 How to Report Issues

Found a breaking change not documented here? Report it:

1. **GitHub Issues:** [Stroid Issues](https://github.com/Himesh-Bhattarai/stroid/issues)
2. **Include:**
   - Your current version
   - Code example showing the issue
   - Error message (if any)
   - Steps to reproduce

---

## 📚 Related Guides

- **Migration from other libraries:** See [STROID_MIGRATION](../STROID_MIGRATION/INDEX.md) for comparisons with Redux, Zustand, Jotai, etc.
- **Configuration:** See [STROID_CONFIG](../STROID_CONFIG/INDEX.md) for all config options
- **Core concepts:** See [STROID_CORE](../STROID_CORE/INDEX.md)

---

## 🔮 Looking Ahead

**Expected upcoming changes (not guaranteed):**
- Stability hardening as we approach v1.0
- Refined DevTools API
- Enhanced TypeScript support
- Documentation examples for common frameworks (Vue, Svelte, Angular)

---

## Notes for Contributors

If you're contributing to Stroid, always update this file when introducing breaking changes:

```md
### v0.2.0 (when released)

**Breaking:**
- Removed `oldOption` — use `newOption` instead
- Changed `storeName` parameter from required to optional (was breaking before, now with defaults)

**Migrated:**
- Use find-and-replace to update in your code
```
