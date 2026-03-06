# Chapter 21 -- Architecture Patterns

> "Stroid is flexible. These patterns are proven."

---

## Store Organization

### By Feature (Recommended)
```
stores/
  auth.ts    -> createStore("auth", ...)
  user.ts    -> createStore("user", ...)
  cart.ts    -> createStore("cart", ...)
  checkout.ts-> createStore("checkout", ...)
```

Keep store creation close to the domain logic; export helpers (selectors, typed setters) from the same file.

---

## Lifetime Discipline

Stroid v0.0.3 does not auto-scope stores. Create them once at module level, and explicitly clean up when they are no longer needed:

```js
import { deleteStore, clearAllStores } from "stroid"

// Remove a store when its feature is torn down
deleteStore("onboarding")

// In tests or storybook teardown
clearAllStores()
```

---

## Logout Pattern

```js
import { setStoreBatch, setStore, resetStore } from "stroid"

export function logout() {
  setStoreBatch(() => {
    setStore("auth.user", null)
    setStore("auth.token", null)
    setStore("auth.isLoggedIn", false)
  })
  resetStore("cart")
  resetStore("user")
}
```

One batch, predictable renders.

---

## Loading Flags

```js
createStore("ui", { loading: { products: false, user: false } })

setStore("ui.loading.products", true)
// ...fetch...
setStore("ui.loading.products", false)
```

Granular paths keep re-renders small.

---

## Form State

```js
createStore("checkoutForm", {
  fields: { email: "", card: "" },
  errors: {},
  isSubmitting: false
})

async function handleSubmit() {
  setStore("checkoutForm.isSubmitting", true)
  try {
    await api.checkout(getStore("checkoutForm.fields"))
    resetStore("cart")
  } catch (e) {
    setStore("checkoutForm.errors", { submit: e.message })
  } finally {
    setStore("checkoutForm.isSubmitting", false)
  }
}
```

---

**[<- Chapter 20 -- Testing](./20-testing.md) :: [Chapter 22 -- Performance ->](./22-performance.md)**
