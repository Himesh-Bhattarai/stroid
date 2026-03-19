# Persistence Guide

> **Confidence: HIGH** — derived from `src/features/persist.ts`, `src/features/persist/*`, `src/adapters/options.ts`.

---

## Setup

Add a side-effect import **once** at your app entry point. Without it, any store with `persist` options silently does nothing (or throws with `strictMissingFeatures: true`).

```ts
// main.tsx or app entry
import "stroid/persist"
```

---

## Basic Usage

```ts
import { createStore } from "stroid"
import "stroid/persist"

createStore("settings", { theme: "dark", lang: "en" }, {
  persist: true  // persists to localStorage with key "stroid_settings"
})
```

After a page reload, the store is re-hydrated from `localStorage` automatically.

---

## Persist Options

```ts
createStore("settings", { theme: "dark" }, {
  persist: {
    key:            "app-settings",       // custom storage key (default: "stroid_{name}")
    allowPlaintext: true,                 // required when no encrypt hook is provided
    version:        2,
    migrations: {
      1: (old) => ({ ...old, lang: "en" }),  // upgrade from v1 to v2
    },
    onMigrationFail: "reset",  // "reset" | "keep" | (state) => state
    onStorageCleared: ({ name, reason }) => {
      console.warn(`${name} cleared: ${reason}`)
    },
  }
})
```

> **Important:** The migrations format is `Record<version_number, fn>`, not `(old, v) => ...`. The README's inline `migrate` callback example is incorrect — use the `migrations` object.

---

## Custom Storage Driver

```ts
createStore("session", { token: null }, {
  persist: {
    driver: window.sessionStorage,  // or any { getItem, setItem, removeItem } adapter
    key:    "app-session",
    allowPlaintext: true,
  }
})
```

`driver` falls back to in-memory storage when the requested storage is unavailable (e.g., Safari private mode).

---

## Encryption

```ts
createStore("vault", { apiKey: "" }, {
  persist: {
    key:           "secure-vault",
    encrypt:       (data) => myAES.encrypt(data),
    decrypt:       (raw)  => myAES.decrypt(raw),
    sensitiveData: true,   // throws if no encrypt hook is provided
  }
})
```

### Async Encryption

```ts
persist: {
  encryptAsync: async (data) => await webCrypto.encrypt(data),
  decryptAsync: async (raw)  => await webCrypto.decrypt(raw),
  // Both must be provided together; mismatched async/sync pairs throw at store creation.
}
```

---

## Integrity Checking

```ts
persist: {
  checksum: "hash",    // default: POJO hash checksum
  // or:
  checksum: "sha256",  // stronger SHA-256 (may be async in browsers)
  // or:
  checksum: "none",    // no integrity check
}
```

> **Note:** `"hash"` is non-cryptographic and only detects accidental corruption.  
> `"sha256"` improves integrity checks but is still forgeable without a secret â€” use encryption or signing for adversarial cases.

---

## Size Limits

```ts
persist: {
  maxSize: 50_000,  // characters; hydration skipped if payload exceeds this
}
```

---

## Sensitive Data

```ts
persist: {
  sensitiveData: true,  // throws at store creation if no encrypt hook provided
}
```

This is a safety guard — it makes accidental plaintext persistence of secrets a hard error.

---

## `onStorageCleared`

Called when the storage key is externally removed (another tab clearing localStorage, DevTools, etc.).

```ts
persist: {
  onStorageCleared: ({ name, key, reason }) => {
    // reason: "clear" | "remove" | "missing"
    redirectToLogin()
  }
}
```

---

## Defaults

| Option | Default |
|--------|---------|
| `driver` | `localStorage` |
| `key` | `"stroid_{storeName}"` |
| `serialize` | `JSON.stringify` |
| `deserialize` | `JSON.parse` |
| `checksum` | `"hash"` |
| `onMigrationFail` | `"reset"` |
| `allowPlaintext` | `false` |
| `sensitiveData` | `false` |

---

## Notes

- Persist and sync can be used together. A write in one tab is saved locally and broadcast to all other tabs.
- `scope: "temp"` automatically disables persistence.
- `persist.maxSize` warnings fire only when unbounded payloads exceed a large size during hydration.
