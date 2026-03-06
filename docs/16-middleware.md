# Chapter 16 -- Middleware

> "Intercept, audit, or transform every update."

---

## Configure Per Store

```js
const logger = ({ action, name, prev, next, path }) => {
  console.info(`[${name}] ${action} @ ${path ?? "(root)"}`, { prev, next })
}

createStore("settings", { theme: "dark" }, { middleware: [logger] })
```

Each middleware receives:
`{ action: "set" | "merge" | "reset" | "delete", name, prev, next, path }`

Return a value to replace `next`; return `undefined` to keep the current `next`.

---

## Use Cases

- Logging or analytics
- Enforcing invariants before schema/validator
- Injecting timestamps, user IDs, or audit data

---

## Ordering

Middlewares run in array order; the output of one is passed to the next. Keep them pure and fast -- slow middleware affects all updates.

---

**[<- Chapter 15 -- Sync](./15-sync.md) :: [Chapter 17 -- Schema & Validation ->](./17-schema.md)**
