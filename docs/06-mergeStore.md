# Chapter 6 — mergeStore

> *"Adding new keys is a different operation than updating existing ones. Stroid treats them differently."*

---

## Basic Usage

```js
import { mergeStore } from "stroid/core"

mergeStore("storeName", newData)
```

`mergeStore` is for **adding new keys** to an existing store. It will not overwrite keys that already exist unless you tell it to.

---

## Adding New Keys

```js
createStore("user", {
  name: "Eli",
  theme: "dark"
})

// Add address — didn't exist before
mergeStore("user", {
  address: {
    city: "NYC",
    country: "USA"
  }
})

// Result:
// {
//   name: "Eli",        ← untouched
//   theme: "dark",      ← untouched
//   address: { city: "NYC", country: "USA" }  ← added
// }
```

---

## The Difference Between setStore and mergeStore

```js
// setStore — updates existing keys
setStore("user.name", "Jo")        // ✅ name exists
setStore("user.address", {...})    // ⚠️ warns — address doesn't exist

// mergeStore — adds new keys
mergeStore("user", { address: {} }) // ✅ adds address
mergeStore("user", { name: "Jo" })  // ✅ updates name too (merge)
```

**The rule:**
- Key already exists → use `setStore`
- Key doesn't exist yet → use `mergeStore`

---

## Deep Merge

```js
mergeStore("user", {
  settings: {
    notifications: {
      email: true,
      push: false
    }
  }
})
```

Stroid walks the tree and merges at every level.

---

**[← Chapter 5 — setStore](./05-setStore.md)** · **[Chapter 7 — getStore →](./07-getStore.md)**