# Chapter 1 — Why Stroid

> *"Every state library starts with the same promise: simplicity. Most break it by page three of the docs."*

---

## The Problem

State management in React has always been a negotiation between power and simplicity.

Redux gave you power. You paid with boilerplate. Actions, reducers, dispatchers, selectors — all for changing a single value in a nested object.

Zustand gave you simplicity. You paid with inconsistency. Every team uses it differently. No standard patterns. No guardrails.

Context API gave you nothing. You paid with re-renders.

Jotai and Recoil gave you atoms. You paid with a new mental model that doesn't map to how real applications think about data.

**None of them got it right.**

---

## What Developers Actually Want

After years of building React applications, the pattern is always the same. Developers want three things:

**1. Create state simply**
```js
// Just this. Nothing more.
createStore("user", { name: "Eli", theme: "dark" })
```

**2. Update state simply**
```js
// Just this. No actions. No reducers.
setStore("user.name", "Jo")
```

**3. Read state simply**
```js
// Just this. No selectors. No connect().
const name = useStore("user.name")
```

That's it. Everything else — persistence, sync, devtools, async — should be opt-in, not the default price of admission.

---

## Why Existing Solutions Fall Short

### Redux & Redux Toolkit
Redux was built for a different era. When applications were simpler and predictability was the primary concern. Redux Toolkit improved the experience but the fundamental mental model — actions, reducers, dispatch — adds cognitive overhead that most applications simply don't need.

```js
// Redux — change a name
const userSlice = createSlice({
  name: "user",
  initialState: { name: "Eli" },
  reducers: {
    setName: (state, action) => {
      state.name = action.payload
    }
  }
})
export const { setName } = userSlice.actions
dispatch(setName("Jo"))
```

Compare that to stroid:
```js
setStore("user.name", "Jo")
```

### Zustand
Zustand is better. But it has no opinions. No standard patterns. No built-in async handling. No persistence story. No sync story. Every team reinvents the same patterns over and over.

### Context API
Not a state management solution. A dependency injection mechanism being used as one. The performance characteristics are wrong for most use cases.

---

## The Stroid Answer

Stroid is built around one idea:

> **State should be as simple to manage as a variable — but as powerful as you need it to be.**

Three methods. One consistent API. Everything else is opt-in.

```js
createStore()   // define state and its lifetime
setStore()      // update state
useStore()      // read state in React
```

That's the whole story at the core level. Everything else — persistence, sync, async, devtools — plugs in when you need it, disappears when you don't.

---

## What Makes Stroid Different

**Lifetime awareness.** Stroid is the first state library that treats store lifetime as a first-class concept. You declare at creation whether a store is global, component-scoped, or temporary. No more memory leaks. No more forgotten cleanup.

**Modular by design.** The core is tiny. Every feature is a subpath import. You only ship what you use.

**No new mental model.** If you understand objects and functions, you understand stroid. There is no new paradigm to learn.

**Grows with you.** Start with the core API. Add persistence when you need it. Add sync when you need it. Add devtools when you need them. Stroid scales from a simple counter to a complex enterprise application without changing how you think about state.

---

## Who Stroid Is For

Stroid is for developers who:

- Are tired of boilerplate
- Want a consistent API across their entire application
- Need something that works in vanilla JS, React, and eventually other frameworks
- Want state management that stays out of the way until it needs to help

---

## Who Stroid Is Not For

Stroid is not for you if:

- You need Redux DevTools time-travel debugging today (it's coming)
- You have a massive existing Redux codebase and no appetite for migration
- You prefer atomic state (Jotai/Recoil) patterns

---

## The Journey Ahead

This book covers everything. From your first store to advanced patterns, from simple updates to async coordination, from local state to cross-tab sync.

Read it chapter by chapter or jump to what you need. Each chapter stands on its own.

Let's build something.

---

**[← Table of Contents](./README.md)** · **[Chapter 2 — Getting Started →](./02-getting-started.md)**