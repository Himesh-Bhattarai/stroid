# Chapter 21 — Architecture Patterns

> *"Stroid is flexible. These patterns are proven."*

---

## Store Organization

### By Feature (Recommended)
```
stores/
  auth.ts       → createStore("auth", ...)
  user.ts       → createStore("user", ...)
  cart.ts       → createStore("cart", ...)
  checkout.ts   → createStore("checkout", ...)
```

Each file creates its store and exports any related utilities. Clean, discoverable, maintainable.

---

### Global vs Local — The Rule

```
Is this state needed by more than one component?
  YES → isGlobal: true, create outside components
  NO  → isTemp: true, create inside component
```

---

## The Logout Pattern

```js
// stores/auth.ts
export function logout() {
  setStoreBatch([
    ["auth.user", null],
    ["auth.token", null],
    ["auth.isLoggedIn", false]
  ])
  resetStore("cart")
  resetStore("user")
}
```

All related state resets in one coordinated call.

---

## The Loading Pattern

```js
createStore("ui", {
  loading: {
    products: false,
    user: false,
    checkout: false
  }
})

// Set loading for specific feature
setStore("ui.loading.products", true)
// Clear after done
setStore("ui.loading.products", false)
```

---

## The Form Pattern

```js
// Inside component
function CheckoutPage() {
  createStore("checkoutForm", {
    fields: { email: "", card: "" },
    errors: {},
    isDirty: false,
    isSubmitting: false
  }, { isTemp: true })

  async function handleSubmit() {
    setStore("checkoutForm.isSubmitting", true)
    try {
      await api.checkout(getStore("checkoutForm.fields"))
      resetStore("cart")
      navigate("/success")
    } catch (e) {
      setStore("checkoutForm.errors", { submit: e.message })
    } finally {
      setStore("checkoutForm.isSubmitting", false)
    }
  }
}
```

---

**[← Chapter 20 — Testing](./20-testing.md)** · **[Chapter 22 — Performance →](./22-performance.md)**