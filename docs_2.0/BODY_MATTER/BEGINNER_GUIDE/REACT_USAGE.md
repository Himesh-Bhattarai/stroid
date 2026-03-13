# Chapter 71: Use Stroid in React

## First Rule

Create the store outside the component, or in app startup code.
Then read it inside components with hooks.

## Good Beginner Example

```tsx
import { createStore, setStore } from "stroid";
import { useStore } from "stroid/react";

createStore("theme", { mode: "dark" });

function ThemeToggle() {
  const mode = useStore("theme", "mode");

  return (
    <button
      onClick={() => setStore("theme", "mode", mode === "dark" ? "light" : "dark")}
    >
      Current mode: {mode}
    </button>
  );
}
```

## What Happened Here

- `createStore(...)` created the state
- `useStore("theme", "mode")` read one field inside React
- clicking the button called `setStore(...)`
- the component re-rendered because the subscribed value changed

## Reading In A Component

Read one field:

```tsx
import { useStore } from "stroid/react";

function ProfileName() {
  const name = useStore("user", "name");
  return <h1>{name}</h1>;
}
```

Read the whole store when you truly need the whole store:

```tsx
function ProfileCard() {
  const user = useStore("user");
  return <pre>{JSON.stringify(user, null, 2)}</pre>;
}
```

## Updating From UI

```tsx
import { setStore } from "stroid";

function LoginButton() {
  return (
    <button onClick={() => setStore("user", "isLoggedIn", true)}>
      Log in
    </button>
  );
}
```

## When To Use `useSelector`

Use `useSelector` when you want a derived value.

Example:

```tsx
import { useSelector } from "stroid/react";

function CompletedCount() {
  const count = useSelector("todos", (state) =>
    state.items.filter((item) => item.done).length
  );

  return <span>{count}</span>;
}
```

This is useful when the value you want does not exist directly in the store and must be calculated.

## No Provider Needed

Stroid does not require a Provider just to read stores in React.
That makes the first setup simpler.

## Tip

Prefer `useStore("storeName", "field")` for normal component reads.
It is easier to understand than reaching for selectors too early.

## Note

If the store does not exist yet, the component can update later when the store is created.
Still, beginners should prefer creating important stores early because it is easier to reason about.

## Warning

Do not call `createStore(...)` inside a component render body on every render.
Create stores in module scope, app setup, or another controlled place.


## Navigation

- Previous: [Chapter 70: Your First Store](FIRST_STORE.md)
- Jump to: [Unit Sixteen: Beginner Guide](../../FRONT_MATTER/CONTENTS.md#unit-sixteen-beginner-guide)
- Next: [Chapter 72: From Basic to Real Usage](FROM_BASIC_TO_REAL.md)
