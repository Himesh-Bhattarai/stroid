# Chapter 15 -- Sync

> "Keep tabs in sync with one flag."

---

## Enable Cross-Tab Sync

```js
createStore("cart", { items: [] }, { sync: true })
```

Stroid uses `BroadcastChannel` under the hood. Updates in one tab are broadcast to others, including history and metrics updates.

---

## Custom Channel and Conflict Resolution

```js
createStore("document", { content: "" }, {
  sync: {
    channel: "docs-channel",
    conflictResolver: ({ local, incoming, localUpdated, incomingUpdated }) => {
      return incomingUpdated >= localUpdated ? incoming : local
    }
  }
})
```

If the resolver returns `undefined`, the incoming update is ignored.

---

## Notes

- Sync is opt-in per store.
- When schema validation fails on the receiving tab, the update is dropped.
- There is no WebSocket or remote adapter in v0.0.3.

---

**[<- Chapter 14 -- Persistence](./14-persist.md) :: [Chapter 16 -- Middleware ->](./16-middleware.md)**
