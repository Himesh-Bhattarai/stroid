# Chapter 17 -- Schema and Validation

> "Validate state before it lands."

---

## Schema Option

```js
import { z } from "zod"

createStore("profile", { name: "", age: 0 }, {
  schema: z.object({ name: z.string(), age: z.number().nonnegative() })
})
```

Supported styles:
- Zod: safeParse or parse
- Yup: validateSync or isValidSync
- Generic functions: `(value) => value | true | false`

If validation fails, the update is skipped and `onError` (if provided) is called in development.

---

## Validator Gate

```js
createStore("transfer", { amount: 0 }, {
  validator: (next) => next.amount <= 1000
})
```

Use `validator` for simple boolean checks; it runs after schema.

---

## Migrations and Versioning

```js
createStore("user", initial, {
  version: 2,
  migrations: {
    1: state => ({ ...state, fullName: `${state.first} ${state.last}` })
  }
})
```

Migrations apply when persisted data loads.

---

**[<- Chapter 16 -- Middleware](./16-middleware.md) :: [Chapter 18 -- SSR](./18-ssr.md)**
