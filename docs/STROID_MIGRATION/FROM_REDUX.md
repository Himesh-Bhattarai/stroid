# Migrating from Redux

> **Comparison:** Redux vs Stroid &nbsp;|&nbsp; **Last Updated:** 2026-03-29
>
> *Help migrating from Redux to Stroid*

---

## 📚 Table of Contents

- [Conceptual Differences](#-conceptual-differences)
- [Store Setup](#-store-setup)
- [Actions → Direct Writes](#-actions--direct-writes)
- [Reducers → Mutators](#-reducers--mutators)
- [Selectors](#-selectors)
- [Middleware](#-middleware)
- [Async Logic](#-async-logic)
- [DevTools](#-devtools)
- [Complete Example](#-complete-example)

---

## 🧭 Conceptual Differences

| Aspect | Redux | Stroid |
|--------|-------|--------|
| **Store** | Single global tree | Named stores (multiple) |
| **Actions** | Explicit action objects | Direct function calls |
| **Reducers** | Pure functions | Mutator functions (Immer-like) |
| **State updates** | Immutable replacements | Mutable draft semantics |
| **Selectors** | Memoization required | Automatic via `useSelector` |
| **Async** | Middleware (thunk, saga) | Native `fetchStore` |
| **SSR** | Context provider | Request-scoped stores |

---

## 🏗️ Store Setup

### Redux (Before)

```ts
import { createStore } from "redux"
import { Provider } from "react-redux"

const initialState = { user: null, posts: [] }
const reducer = (state, action) => { ... }
const store = createStore(reducer)

export default function App() {
  return (
    <Provider store={store}>
      <YourApp />
    </Provider>
  )
}
```

### Stroid (After)

```ts
import { createStore } from "stroid"

createStore("user", null)
createStore("posts", [])

// No provider needed!
export default function App() {
  return <YourApp />
}
```

---

## ⚡ Actions → Direct Writes

### Redux (Before)

```ts
const UPDATE_USER = "UPDATE_USER"

function updateUser(user) {
  return { type: UPDATE_USER, payload: user }
}

const reducer = (state, action) => {
  switch (action.type) {
    case UPDATE_USER:
      return { ...state, user: action.payload }
    default:
      return state
  }
}

// In component
dispatch(updateUser({ name: "Alice" }))
```

### Stroid (After)

```ts
import { setStore } from "stroid"

// Direct call — no action boilerplate
setStore("user", { name: "Alice" })
```

---

## 🔧 Reducers → Mutators

### Redux (Before)

```ts
const initialState = { count: 0, items: [] }

const reducer = (state = initialState, action) => {
  switch (action.type) {
    case "INCREMENT":
      // Immutable: spread + replace
      return {
        ...state,
        count: state.count + 1
      }
    case "ADD_ITEM":
      return {
        ...state,
        items: [...state.items, action.payload]
      }
    default:
      return state
  }
}
```

### Stroid (After)

```ts
import { setStore } from "stroid"

// Mutator function — mutation reads as mutation, not immutable replacement
setStore("counter", (draft) => {
  draft.count += 1
})

setStore("items", (draft) => {
  draft.push(newItem)
})
```

---

## 🎯 Selectors

### Redux (Before)

```ts
import { useSelector } from "react-redux"
import { createSelector } from "reselect"

// Memoized selector
const selectUserName = createSelector(
  state => state.user,
  user => user?.name
)

function UserName() {
  const name = useSelector(selectUserName)
  return <h1>{name}</h1>
}
```

### Stroid (After)

```ts
import { useSelector } from "stroid/react"

function UserName() {
  // Built-in memoization — re-renders only on value change
  const name = useSelector("user", user => user?.name)
  return <h1>{name}</h1>
}
```

---

## 🧩 Middleware

### Redux (Before)

```ts
import { createStore, applyMiddleware } from "redux"

const logger = store => next => action => {
  console.log("dispatch:", action)
  return next(action)
}

const store = createStore(reducer, applyMiddleware(logger))
```

### Stroid (After)

```ts
import { configureStroid } from "stroid"

configureStroid({
  middleware: [
    (ctx) => {
      console.log(`${ctx.name}: ${ctx.action}`, ctx.next)
    }
  ]
})
```

---

## 🔄 Async Logic

### Redux (Before)

```ts
import { useDispatch } from "react-redux"

const fetchUser = (id) => async (dispatch) => {
  dispatch({ type: "LOADING" })
  try {
    const user = await fetch(`/api/users/${id}`).then(r => r.json())
    dispatch({ type: "SET_USER", payload: user })
  } catch (error) {
    dispatch({ type: "ERROR", payload: error })
  }
}

function UserProfile() {
  const dispatch = useDispatch()
  useEffect(() => {
    dispatch(fetchUser(1))
  }, [])
}
```

### Stroid (After)

```ts
import { fetchStore } from "stroid/async"
import { useAsyncStore } from "stroid/react"

function UserProfile() {
  // Single call handles loading, error, data states
  const { data, isLoading, error } = useAsyncStore(
    "user",
    fetchStore("https://api.example.com/users/1")
  )

  if (isLoading) return <Spinner />
  if (error) return <Error error={error} />
  return <h1>{data.name}</h1>
}
```

---

## 🔧 DevTools

### Redux (Before)

```ts
import { createStore } from "redux"

const store = createStore(
  reducer,
  window.__REDUX_DEVTOOLS_EXTENSION__ && window.__REDUX_DEVTOOLS_EXTENSION__()
)
```

### Stroid (After)

```ts
import { installDevtools } from "stroid/install"
import { getHistory } from "stroid/devtools"

installDevtools()

// Later, inspect history
const history = getHistory()
```

---

## 📋 Complete Example

### Redux Version

```ts
// Redux implementation
import { createStore, applyMiddleware } from "redux"
import { Provider, useDispatch, useSelector } from "react-redux"
import { useEffect } from "react"

const initialState = { user: null, posts: [] }

const UPDATE_USER = "UPDATE_USER"
const ADD_POST = "ADD_POST"
const LOAD_POSTS = "LOAD_POSTS"

function reducer(state = initialState, action) {
  switch (action.type) {
    case UPDATE_USER:
      return { ...state, user: action.payload }
    case ADD_POST:
      return { ...state, posts: [...state.posts, action.payload] }
    case LOAD_POSTS:
      return { ...state, posts: action.payload }
    default:
      return state
  }
}

function updateUser(user) {
  return { type: UPDATE_USER, payload: user }
}

function addPost(post) {
  return { type: ADD_POST, payload: post }
}

function loadPosts() {
  return async (dispatch) => {
    const posts = await fetch("/api/posts").then(r => r.json())
    dispatch({ type: LOAD_POSTS, payload: posts })
  }
}

const store = createStore(reducer, applyMiddleware(logger))

function App() {
  return (
    <Provider store={store}>
      <Content />
    </Provider>
  )
}

function Content() {
  const dispatch = useDispatch()
  const user = useSelector(state => state.user)
  const posts = useSelector(state => state.posts)

  useEffect(() => {
    dispatch(loadPosts())
  }, [])

  return (
    <>
      <button onClick={() => dispatch(updateUser({ name: "Alice" }))}>
        Set User
      </button>
      <h1>{user?.name}</h1>
      <ul>
        {posts.map(p => <li key={p.id}>{p.title}</li>)}
      </ul>
    </>
  )
}
```

### Stroid Version

```ts
// Stroid implementation
import { createStore, setStore } from "stroid"
import { useStore, useAsyncStore } from "stroid/react"
import { fetchStore } from "stroid/async"
import { useEffect } from "react"

// Create stores
createStore("user", null)
createStore("posts", [])

// No providers needed!

function App() {
  return <Content />
}

function Content() {
  const user = useStore("user")
  const { data: posts } = useAsyncStore(
    "posts",
    fetchStore("/api/posts")
  )

  return (
    <>
      <button
        onClick={() => setStore("user", { name: "Alice" })}
      >
        Set User
      </button>
      <h1>{user?.name}</h1>
      <ul>
        {posts?.map(p => <li key={p.id}>{p.title}</li>)}
      </ul>
    </>
  )
}
```

---

## 🔄 Migration Checklist

- [ ] Replace Redux store with `createStore()` calls
- [ ] Remove `<Provider>` wrapper
- [ ] Replace `dispatch()`  with direct `setStore()` calls
- [ ] Replace `useSelector` with Stroid's `useSelector`
- [ ] Replace Redux thunks with `fetchStore` for async
- [ ] Test SSR behavior (no provider changes needed)
- [ ] Try out `useAsyncStore` for cleaner async code
- [ ] Use `fetchStore` instead of manual fetch + dispatch

---

## 📚 Documentation

- [Core Concepts](../STROID_CORE/INDEX.md)
- [Async](../STROID_ASYNC/INDEX.md)
- [React](../STROID_REACT/INDEX.md)
- [Configuration](../STROID_CONFIG/INDEX.md)
