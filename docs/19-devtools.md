# Chapter 19 — Devtools

> *"See everything. Understand everything. Debug nothing."*

---

## Install

```bash
npm install stroid-devtools --save-dev
```

---

## Setup

```js
// One line in your app entry
import "stroid-devtools"

// That's it. All stores appear automatically.
```

---

## What You Get

### Store Explorer
Browse every store in your application. See current state, metadata, and lifetime status in real time.

### Action History
Every `setStore`, `mergeStore`, and `resetStore` call is logged with timestamp, store name, path, and value change.

### Diff Viewer
See exactly what changed between updates. Before and after, side by side.

### Lifetime Tracker
See which stores are alive, which are temp, which have been destroyed.

### Performance Panel
Updates per second, average update time, largest stores, subscriber counts.

---

## Chrome Extension

The devtools panel lives in your browser's DevTools. Install from the Chrome Web Store (coming soon).

---

## Configuration

```js
import { configureDevtools } from "stroid-devtools"

configureDevtools({
  enabled: process.env.NODE_ENV === "development",
  logLevel: "verbose",  // "silent" | "normal" | "verbose"
  maxHistory: 100       // how many actions to keep
})
```

---

## Production

Stroid devtools is a `devDependency`. It is never included in production builds. The bridge code is stripped automatically by your bundler.

---

**[← Chapter 18 — SSR](./18-ssr.md)** · **[Chapter 20 — Testing →](./20-testing.md)**