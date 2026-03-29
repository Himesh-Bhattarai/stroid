# 📦 Version Migration Guide

> **Version:** 0.1.4-beta &nbsp;|&nbsp; **Last Updated:** 2026-03-29 &nbsp;|&nbsp; **Confidence:** ![MEDIUM](https://img.shields.io/badge/confidence-MEDIUM-orange)
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

**Stroid v0.1.4-beta**

```json
{
  "name": "stroid",
  "version": "0.1.4-beta.0",
  "description": "SSR-Safe, Named-store state engine for JavaScript/React with optional persistence, async caching, sync, and devtools."
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

### None documented yet

Stroid is still in early beta. This section will grow as the API stabilizes and versions increment.

---

## 🗑️ Deprecations

### allowUntrustedHydration → allowTrustedHydration

**Status:** Deprecated as of v0.1.4-beta

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

### v0.1.4-beta (Current)

- ✅ Core stable for most use cases
- ✅ React integration stable
- ⚠️ Some features still in development (devtools, server APIs)
- 📝 API subject to minor adjustments

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
- **Core concepts:** See [Core Concepts](../core-concepts/STORES.md)

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
