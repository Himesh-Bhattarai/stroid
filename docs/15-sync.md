# Chapter 15 -- Sync

> "Keep tabs in sync with one flag."

---

## Enable Cross-Tab Sync

```js
createStore("cart", { items: [] }, { sync: true })
```

Stroid uses `BroadcastChannel` under the hood. Updates in one tab broadcast store state to the others. History and metrics are local only.

---

## Custom Channel and Conflict Resolution

```js
createStore("document", { content: "" }, {
  sync: {
    channel: "docs-channel",
    maxPayloadBytes: 32 * 1024,
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
- New tabs request the latest snapshot on startup and again on `focus` / `online`.
- If `BroadcastChannel` is unavailable or the payload exceeds `maxPayloadBytes`, the store reports through `onError`.
- There is no WebSocket or remote adapter in v0.0.4.

---

**[<- Chapter 14 -- Persistence](./14-persist.md) :: [Chapter 16 -- Middleware ->](./16-middleware.md)**
