# Chapter 18 — SSR & RSC

> *"Stroid works on the server too."*

---

## Import

```js
import { hydrateStores, dehydrateStores } from "stroid/ssr"
```

---

## The Pattern

```js
// Server — serialize state
const snapshot = dehydrateStores(["user", "theme"])

// Pass to client via HTML
<script>
  window.__STROID__ = ${JSON.stringify(snapshot)}
</script>

// Client — restore state
hydrateStores(window.__STROID__)
```

---

## Next.js App Router

```js
// app/layout.tsx
import { dehydrateStores } from "stroid/ssr"

export default async function RootLayout({ children }) {
  createStore("config", await getServerConfig())
  const snapshot = dehydrateStores(["config"])

  return (
    <html>
      <body>
        <StroidHydrator snapshot={snapshot} />
        {children}
      </body>
    </html>
  )
}
```

---

## React Server Components

```js
// Server Component — read only
import { getStore } from "stroid/core"

export default async function ServerNav() {
  const config = getStore("config")
  return <nav>{config.navItems.map(...)}</nav>
}
```

---

**[← Chapter 17 — Schema](./17-schema.md)** · **[Chapter 19 — Devtools →](./19-devtools.md)**