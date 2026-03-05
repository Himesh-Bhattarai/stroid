# Chapter 23 — Migration Guide

---

## From v0.0.x to v0.1.x

### Immer-style draft removed

```js
// ❌ Old — no longer supported
setStore("user", draft => {
  draft.profile.name = "Eli"
})

// ✅ New — dot-path update
setStore("user.profile.name", "Eli")
```

### deleteStore removed

```js
// ❌ Old
deleteStore("modal")

// ✅ New — declare lifetime at creation
createStore("modal", { open: false }, { isTemp: true })
// auto-destroyed on unmount
```

### createStore options changed

```js
// ❌ Old
createStore("modal", {}, { scope: "local" })

// ✅ New
createStore("modal", {}, { isTemp: true })
```

---

## From Redux

```js
// Redux
const userSlice = createSlice({
  name: "user",
  initialState: { name: "Eli" },
  reducers: {
    setName: (state, action) => { state.name = action.payload }
  }
})
dispatch(setName("Jo"))

// Stroid
createStore("user", { name: "Eli" })
setStore("user.name", "Jo")
```

---

## From Zustand

```js
// Zustand
const useUserStore = create(set => ({
  name: "Eli",
  setName: (name) => set({ name })
}))
const name = useUserStore(s => s.name)

// Stroid
createStore("user", { name: "Eli" })
const name = useStore("user.name")
setStore("user.name", "Jo")
```

---

**[← Chapter 22 — Performance](./22-performance.md)** · **[Chapter 24 — Roadmap →](./24-roadmap.md)**