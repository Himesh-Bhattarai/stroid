<div align="center">

<img src="./stroid-website/public/Screenshot%202026-03-05%20185907.jpg" alt="Stroid logo" width="720" />

# ⚡ Stroid

Compact, batteries-included state management for JavaScript & React.

Mutable-friendly updates · Selectors · Persistence · Async caching · Sync · Drop-in presets — all in one ergonomic package.

> Note: this library is not aimed at beginners.

</div>

---

## 📛 Badges

[![npm](https://img.shields.io/npm/v/stroid?color=6366f1&label=version&style=flat-square)](https://www.npmjs.com/package/stroid)
[![bundle](https://img.shields.io/badge/min+gzip-~9KB-6366f1?style=flat-square)](https://bundlephobia.com/package/stroid)
[![downloads](https://img.shields.io/npm/dm/stroid?color=6366f1&style=flat-square)](https://www.npmjs.com/package/stroid)
[![license](https://img.shields.io/badge/license-MIT-6366f1?style=flat-square)](./LICENSE)
[![typescript](https://img.shields.io/badge/TypeScript-ready-6366f1?style=flat-square)](./docs/02-getting-started.md)
[![tree-shakeable](https://img.shields.io/badge/tree--shakeable-yes-6366f1?style=flat-square)](./docs/22-performance.md)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Himesh_Bhattarai-0A66C2?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/himeshchanchal-bhattarai-9687612bb/)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-9806352021-25D366?logo=whatsapp&logoColor=white)](https://wa.me/9806352021)

---

## 🎯 Hook

Three primitives (create → set → read) with built-in guardrails (schema, validator, middleware) and batteries included (persistence, async caching, cross-tab sync). Under 10 kB gzipped, ESM-only, tree-shakeable, side-effect free, zero dependencies.

Jump to: [Installation](#-install) | [Quick Example](#-quick-example-15-lines) | [Features](#-feature-highlights) | [Comparison](#-comparison) | [React Hooks](./docs/12-react.md) | [Async](./docs/13-async.md) | [Persistence](./docs/14-persist.md) | [Core API](./docs/04-createStore.md)

---

## ⚡ Quick Example (15 lines)

```js
import { createStore, setStore } from "stroid/core"
import { useStore } from "stroid/react"

createStore("user", { name: "Eli", theme: "dark" })

function Profile() {
  const name = useStore("user.name") // re-renders only when name changes
  return <h1>Hello, {name}</h1>
}

setStore("user.theme", "light")
```

---

## 📦 Install

```bash
npm install stroid
```

---

## ✅ Feature Highlights

- 🧭 Dot-path API with path safety + schema/validator guardrails
- 💾 Persistence via per-store `persist` option (local/session/custom driver)
- 🌐 Async caching helpers: `fetchStore`, `refetchStore`, TTL, dedupe, revalidate-on-focus
- 🔄 Cross-tab sync via BroadcastChannel
- 🎛️ Devtools/history/metrics built in; zero runtime deps
- 🧰 Helpers: selectors, history, metrics, entity/list/counter stores, chain, SSR hydrate

---

## 🆚 Comparison

| Feature | Stroid | Redux | Zustand | Context |
| --- | --- | --- | --- | --- |
| Provider required | No | Yes | Optional | Yes |
| Dot-path updates | Yes | No | No | No |
| Built-in persist/sync | Yes | No (extra libs) | Plugins | No |
| Async helper | Yes (`fetchStore`) | Thunks/sagas | No | No |
| Devtools/history | Built-in toggle | External | Plugin | No |
| Size focus | <10 kB gzipped | Larger | Small | N/A |

---

## 🧭 Navigation

- 📘 [The Book](./docs/README.md)
- ⚡ [Quick Start](./docs/02-getting-started.md)
- 🛠️ [Core API](./docs/04-createStore.md)
- 🔗 [React Hooks](./docs/12-react.md)
- 💾 [Persistence](./docs/14-persist.md)
- 🌐 [Async](./docs/13-async.md)
- 🔬 [Testing](./docs/20-testing.md)
- 🗺️ [Roadmap](./docs/24-roadmap.md)

---

## 🧱 Built With

[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white)](#)
[![React 18](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=1a1a1a)](#)
[![Node](https://img.shields.io/badge/Node-18+-339933?logo=node.js&logoColor=white)](#)
[![tsup](https://img.shields.io/badge/Bundler-tsup-000000)](#)
[![tsx](https://img.shields.io/badge/Runtime-tsx-6c4cff)](#)
[![ESLint](https://img.shields.io/badge/ESLint-5c6bc0?logo=eslint&logoColor=white)](#)

---

## 🧭 Versioning

Stroid follows Semantic Versioning:
- MAJOR — breaking changes
- MINOR — new backwards-compatible features
- PATCH — bug fixes

See [`CHANGELOG.md`](./CHANGELOG.md) for the full history.

---

## 👥 Top Contributors

[![Contributors graph](https://contrib.rocks/image?repo=Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid/graphs/contributors)

---

## 📄 License

MIT © Himeshchanchal Bhattarai

---

## 📬 Contact

- Issues: https://github.com/Himesh-Bhattarai/stroid/issues
- LinkedIn: https://www.linkedin.com/in/himeshchanchal-bhattarai-9687612bb/
- WhatsApp: https://wa.me/9806352021
