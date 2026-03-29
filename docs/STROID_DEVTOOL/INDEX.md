# 🔧 Devtools Guide

> **Version:** 1.0 &nbsp;|&nbsp; **Last Updated:** 2026-03-29 &nbsp;|&nbsp; **Confidence:** ![HIGH](https://img.shields.io/badge/confidence-HIGH-brightgreen)
>
> *Derived from `src/devtools/api.ts`, `src/features/devtools.ts`*

---

## 📚 Table of Contents

- [Setup](#-setup)
- [Installation](#-installation)
- [getHistory()](#-gethistory)
- [clearHistory()](#-clearhistory)
- [History Entry Structure](#-history-entry-structure)
- [Use Cases](#-use-cases)
- [Integration](#-integration)

---

## ⚙️ Setup

Devtools are an optional feature for inspecting store mutations during development.

```ts
import { installDevtools } from "stroid/install"
import { getHistory, clearHistory } from "stroid/devtools"

// Install once at app startup
installDevtools()

// Now you can inspect history
const history = getHistory()
```

> [!NOTE]
> Devtools track every store write operation. They're designed for development but can be used in production if you need debugging. There is minimal overhead when history is not read.

---

## 🔌 Installation

**Type:**
```ts
installDevtools(): void
```

**Location:**
```ts
import { installDevtools } from "stroid/install"
```

Call **once** during app initialization, before creating stores:

```ts
// main.ts
import { installDevtools } from "stroid/install"

installDevtools()

// ... rest of your app
createStore("user", { name: "Ava" })
```

---

## 📖 getHistory()

**Type:**
```ts
getHistory(): HistoryEntry[]
```

**Returns:** Array of all recorded store mutations (most recent last).

**Example:**
```ts
import { getHistory } from "stroid/devtools"

const history = getHistory()

history.forEach(entry => {
  console.log(`[${entry.timestamp}] ${entry.storeName}:`, {
    value: entry.value,
    diff: entry.diff,
    error: entry.error,
  })
})
```

---

## 🗑️ clearHistory()

**Type:**
```ts
clearHistory(): void
```

**Clears all recorded history** — useful when you want to reset the log mid-session.

**Example:**
```ts
import { clearHistory, getHistory } from "stroid/devtools"

// Record some mutations
createStore("user", { name: "Ava" })
setStore("user", { name: "Bob" })

console.log(getHistory().length) // 2

clearHistory()

console.log(getHistory().length) // 0
```

---

## 📋 History Entry Structure

Each entry captures a complete mutation:

```ts
type HistoryEntry = {
  // Metadata
  timestamp: number          // Unix milliseconds when write occurred
  storeName: string          // Store name (without namespace prefix)

  // Write details
  value: unknown             // Final value written to store
  diff?: {                   // What changed (if available)
    added?: string[]         // New keys
    modified?: string[]      // Changed keys
    deleted?: string[]       // Removed keys
  }

  // Status
  error?: {                  // Error if write failed
    message: string
    code?: string
  }
}
```

**Example Entry:**
```json
{
  "timestamp": 1711747200000,
  "storeName": "user",
  "value": {
    "name": "Alice",
    "role": "admin",
    "createdAt": "2026-03-29"
  },
  "diff": {
    "added": ["createdAt"],
    "modified": ["name"]
  }
}
```

---

## 🎯 Use Cases

### Development Debugging

```ts
const history = getHistory()
const lastEntry = history[history.length - 1]

if (lastEntry?.error) {
  console.error("Last write failed:", lastEntry.error)
}
```

### Undo/Redo System

```ts
let undoStack: HistoryEntry[] = []

function recordUndo() {
  const history = getHistory()
  undoStack.push(history[history.length - 1])
}

function undo() {
  const entry = undoStack.pop()
  if (entry) {
    setStore(entry.storeName, entry.value)
  }
}
```

### Debugging Performance Issues

```ts
const before = getHistory().length
expensiveOperation()
const after = getHistory().length

console.log(`Operation triggered ${after - before} store writes`)
```

### Testing State Mutations

```ts
import { getHistory, clearHistory } from "stroid/devtools"

describe("Cart", () => {
  beforeEach(() => clearHistory())

  test("adds item to cart", () => {
    addToCart(item)

    const history = getHistory()
    const cartWrites = history.filter(e => e.storeName === "cart")

    expect(cartWrites).toHaveLength(1)
    expect(cartWrites[0].diff?.modified).toContain("items")
  })
})
```

---

## 🔗 Integration

### With Browser DevTools

Store the devtools API globally for console access:

```ts
import { installDevtools, getHistory, clearHistory } from "stroid/devtools"

installDevtools()

// Make available in browser console
if (typeof window !== "undefined") {
  ;(window as any).__stroid = {
    getHistory,
    clearHistory,
  }
}

// Now in browser console:
// __stroid.getHistory()
// __stroid.clearHistory()
```

### With Redux DevTools Extension

Stroid doesn't have native Redux DevTools integration, but you can bridge it:

```ts
import { getHistory } from "stroid/devtools"

// Poll history and send to Redux DevTools
const devToolsExtension = (window as any).__REDUX_DEVTOOLS_EXTENSION__

setInterval(() => {
  const history = getHistory()
  const lastEntry = history[history.length - 1]

  if (lastEntry) {
    devToolsExtension?.send(
      `${lastEntry.storeName}:write`,
      lastEntry.value
    )
  }
}, 1000)
```

### With Custom Logger

```ts
import { installDevtools, getHistory } from "stroid/devtools"
import { configureStroid } from "stroid"

installDevtools()

configureStroid({
  logSink: {
    log: (msg, meta) => {
      const history = getHistory()
      logger.info(msg, {
        ...meta,
        historySize: history.length,
        lastWrite: history[history.length - 1]?.timestamp,
      })
    }
  }
})
```

---

## ⚠️ Limitations

- **Memory:** History grows with every write. Call `clearHistory()` periodically in production.
- **No Replay:** Devtools provide inspection only, not automatic state replay.
- **Sync Only:** Async mutations within `fetchStore` and PSR are tracked separately; see their respective guides.

---

## 🔄 Best Practices

1. **Clear history between test cases** to avoid memory bloat in test suites.
2. **Use in development only** or behind a feature flag for production.
3. **Export history for debugging** — save snapshots when bugs occur.
4. **Combine with logging** for end-to-end visibility into state changes.

```ts
// Clear on app reset
export function resetApp() {
  clearHistory()
  // ... reset stores
}
```
