<div align="center">

# ⚡ Stroid

**Lightweight state management for React.**
No Provider. No dispatch. No boilerplate.

```bash
npm install stroid
```

[![version](https://img.shields.io/badge/version-0.0.3-blue)](./docs/15-migration.md)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![size](https://img.shields.io/badge/core-~4KB_gzip-orange)](./docs/02-getting-started.md)
[![typescript](https://img.shields.io/badge/TypeScript-ready-blue)](./docs/03-createStore.md)

---

📖 **[Read The Book →](./docs/README.md)**

</div>

---

```js
import { createStore, setStore } from "stroid/core"
import { useStore } from "stroid/react"

createStore("user", { name: "Eli", theme: "dark" })

function Profile() {
  const name = useStore("user.name")
  return <div>{name}</div>
}
```

---

<div align="center">

**[Book](./docs/README.md)** · **[Quick Start](./docs/02-getting-started.md)** · **[API](./docs/03-createStore.md)** · **[Roadmap](./docs/16-roadmap.md)**

</div>