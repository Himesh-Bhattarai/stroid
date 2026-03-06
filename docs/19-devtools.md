# Chapter 19 -- Devtools

> "See everything. Understand everything."

---

## Enable

```js
createStore("auth", initial, { devtools: true })
```

If Redux DevTools is available in the environment, stroid connects automatically and sends actions (`set`, `merge`, `reset`, `delete`, `create`).

---

## What You Get

- State snapshots per store
- Action history with diffs
- Metrics (notify timings) per store

---

## Notes

- Devtools wiring is built in; no extra package is required in v0.0.4.
- Disable per store by leaving `devtools` false (default) or close the DevTools extension to avoid overhead.

---

**[<- Chapter 18 -- SSR](./18-ssr.md) :: [Chapter 20 -- Testing ->](./20-testing.md)**
