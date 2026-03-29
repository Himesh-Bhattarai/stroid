# Migrating from Valito

> **Comparison:** Valito vs Stroid &nbsp;|&nbsp; **Last Updated:** 2026-03-29
>
> *Help migrating from Valito to Stroid*

---

## 📚 Table of Contents

- [About Valito](#-about-valito)
- [Conceptual Differences](#-conceptual-differences)
- [Store Definition](#-store-definition)
- [Validation](#-validation)
- [Form Integration](#-form-integration)

---

## ℹ️ About Valito

**Valito** is a lightweight form state management library with built-in validation.

**Stroid** is a general-purpose state engine with optional validation and form helpers.

---

## 🧭 Conceptual Differences

| Aspect | Valito | Stroid |
|--------|--------|--------|
| **Purpose** | Form state only | General state + optional forms |
| **Validation** | Built-in schema validation | Configurable validators |
| **Field binding** | Auto two-way binding | Manual or `useStoreField` |
| **Type safety** | Schema-based types | TypeScript declarations |

---

## ✅ Validation

### Valito (Before)

```ts
const form = createForm({
  schema: z.object({
    name: z.string().min(3),
    email: z.string().email(),
  }),
})
```

### Stroid (After)

```ts
import { createStore, setStore } from "stroid"
import { z } from "zod"

const FormSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
})

createStore("form", {
  data: { name: "", email: "" },
  errors: {} as Record<string, string>,
})

function validateForm() {
  try {
    FormSchema.parse(getStore("form").data)
    setStore("form", { errors: {} })
    return true
  } catch (err) {
    // Handle errors
    return false
  }
}
```

---

## 📝 Form Integration

### Valito (Two-Way Binding)

```ts
<input bind:value={form.fields.email} />
```

### Stroid (Manual Binding)

```ts
import { useFormStore } from "stroid/react"

const { bind } = useFormStore("form", "data")
<input {...bind("email")} />
```

---

## 📚 Documentation

- [Core Concepts](../core-concepts/STORES.md)
- [React Hooks](../STROID_REACT/INDEX.md)
- [Form Integration](../guides/REACT.md#-form-integration)
