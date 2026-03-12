# Chapter 5 -- setStore

> "Update state by saying what you want, not how to get there."

---

## Shapes You Can Call

```js
setStore("user", { name: "Jo" })                     // merge object
setStore("user", "name", "Jo")                       // set by dot-path
setStore("user", draft => { draft.score += 1 })      // draft-style updater
```

No `setStore.replace` helper exists in v0.0.4; merging is the default. To fully replace a branch, just pass the new object yourself.

---

## Merge Semantics

- When you pass an object to an object-like store, stroid shallow-merges it into the existing store value.
- When you pass a path + value, only that path is updated. Missing object keys are created; array indices must exist.
- When you pass a function, stroid clones the current value, lets you mutate the clone, then commits the result.

---

## Path Safety

Stroid validates paths to avoid silent mistakes:
- Depth is limited (10 segments) to catch overly nested state.
- Setting inside null/undefined or type-mismatched branches warns and aborts.
- Array paths require valid indices.

---

## With Middleware, Schema, Validators

Before committing, stroid runs:
1) schema validation if configured on the store  
2) validator function (boolean gate)  
3) middleware pipeline (can modify the pending next value)

If schema or validator checks fail, the update is skipped. Invalid path-safety callbacks only report through `onError` in development.

---

## Examples

```js
// Add or update multiple fields at once
setStore("auth", { user, token, isLoggedIn: true })

// Toggle by reading current value first
const darkMode = getStore("ui", "darkMode") ?? false
setStore("ui", "darkMode", !darkMode)

// Safe nested mutation
setStore("cart", draft => {
  if (draft.items[0]) draft.items[0].qty += 1
})
```

Path updates take a concrete value, not an updater function. Compute the next value first or switch to a draft mutator when you need read-modify-write behavior.

---

**[<- Chapter 4 -- createStore](./04-createStore.md) :: [Chapter 7 -- getStore ->](./07-getStore.md)**
