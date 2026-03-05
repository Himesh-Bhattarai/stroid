<div align="center">

<img src="./stroid-website/public/Screenshot%202026-03-05%20185907.jpg" alt="Stroid logo" width="760" />

# 🚀 Stroid

Compact, batteries-included state management for JavaScript & React. No provider. No dispatch. Dot-path ergonomics with guardrails.

</div>

---

## 📛 Badges

[![Contributors](https://img.shields.io/github/contributors/Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid/graphs/contributors)
[![Forks](https://img.shields.io/github/forks/Himesh-Bhattarai/stroid?style=social)](https://github.com/Himesh-Bhattarai/stroid/network/members)
[![Stars](https://img.shields.io/github/stars/Himesh-Bhattarai/stroid?style=social)](https://github.com/Himesh-Bhattarai/stroid/stargazers)
[![Issues](https://img.shields.io/github/issues/Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid/issues)
[![License](https://img.shields.io/github/license/Himesh-Bhattarai/stroid)](./LICENSE)
[![Bundlephobia](https://img.shields.io/bundlephobia/minzip/stroid)](https://bundlephobia.com/package/stroid)
[![Packagephobia](https://img.shields.io/packagephobia/install/stroid)](https://packagephobia.com/result?p=stroid)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Himesh_Bhattarai-blue?logo=linkedin)](https://www.linkedin.com/in/himeshchanchal-bhattarai-9687612bb/)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-9806352021-25D366?logo=whatsapp&logoColor=white)](https://wa.me/9806352021)

---

## 🎯 Hook

Stroid keeps global state simple: three primitives (create → set → read), optional guardrails (schema, validator, middleware), and built-ins for persistence, async caching, and cross-tab sync. Under 10 kB gzipped when tree-shaken.

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

## ⚡ Quick Example (15 lines)

```js
import { createStore, setStore } from "stroid/core"
import { useStore } from "stroid/react"

createStore("user", { name: "Eli", theme: "dark" })

function Profile() {
  const name = useStore("user.name")
  return <div>{name}</div>
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
- 💾 Built-in persistence (local/session/custom driver)
- 🌐 Async caching helpers with TTL, dedupe, revalidate-on-focus
- 🔄 Cross-tab sync via BroadcastChannel
- 🎛️ Devtools/history/metrics built in; zero runtime deps
- 🧰 Helpers: entity/list/counter stores, chain, selectors, SSR hydrate

---

## 🆚 Why Stroid vs Others

| Feature | Stroid | Redux | Zustand | Context |
| --- | --- | --- | --- | --- |
| Provider required | No | Yes | Optional | Yes |
| Dot-path updates | Yes | No | No | No |
| Built-in persist/sync | Yes | No (extra libs) | Plugins | No |
| Async helper baked in | Yes | Thunks/sagas | No | No |
| Devtools/history | Built-in toggle | External | Plugin | No |
| Size focus | <10 kB gzipped (tree-shaken) | Depends | Small | N/A |

---

## 🧱 Built With

[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white)](#)
[![React 18](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=1a1a1a)](#)
[![Node](https://img.shields.io/badge/Node-18+-339933?logo=node.js&logoColor=white)](#)
[![tsup](https://img.shields.io/badge/Bundler-tsup-000000)](#)
[![tsx](https://img.shields.io/badge/Runtime-tsx-6c4cff)](#)
[![ESLint](https://img.shields.io/badge/ESLint-5c6bc0?logo=eslint&logoColor=white)](#)

---

## 🧭 Support Matrix

- Node: 18+
- React: 18+
- Module: ESM-only, tree-shakeable, side-effect free
- Browser: modern evergreen; BroadcastChannel needed for sync

---

## 📝 Migration & Docs

- Migration guide: [`docs/23-migration.md`](./docs/23-migration.md)
- Roadmap: [`docs/24-roadmap.md`](./docs/24-roadmap.md)
- Success path: [`docs/25-success-path.md`](./docs/25-success-path.md)
- Changelog: [`CHANGELOG.md`](./CHANGELOG.md)

---

## 👥 Top Contributors

[![Contributors graph](https://contrib.rocks/image?repo=Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid/graphs/contributors)

---

## 📬 Contact

- Issues: https://github.com/Himesh-Bhattarai/stroid/issues
- LinkedIn: https://www.linkedin.com/in/himeshchanchal-bhattarai-9687612bb/
- WhatsApp: https://wa.me/9806352021
