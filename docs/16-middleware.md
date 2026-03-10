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

## What *doesn't* flow through middleware

- `resetStore(name)` skips middleware by design. It restores the initial snapshot, then runs feature hooks (persist/devtools/sync) and notifies subscribers. Use a normal `setStore` if you need middleware to see the reset payload.
- `deleteStore(name)` also bypasses middleware. It runs feature delete hooks and subscriber cleanup only.
- `setStoreBatch(fn)` executes the batched `setStore` calls inside the batch; the batch boundaries themselves are not a middleware action.

This keeps resets and deletes fast and side-effect-free, but it means middleware is not guaranteed to observe every state transition. If you need audit logging for resets/deletes, add `onReset/onDelete` handlers or feature hooks instead.

---

**[<- Chapter 15 -- Sync](./15-sync.md) :: [Chapter 17 -- Schema & Validation ->](./17-schema.md)**
