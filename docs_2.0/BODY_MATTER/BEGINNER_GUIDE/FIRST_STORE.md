# Chapter 70: Your First Store

## Step 1: Create A Store

```ts
import { createStore } from "stroid";

createStore("user", {
  name: "Eli",
  theme: "dark",
  isLoggedIn: false,
});
```

What each part means:

- `"user"` is the store name
- the object is the starting data
- each key inside the object is a field you can read or update later

## Step 2: Read The Store

Read the whole store:

```ts
import { getStore } from "stroid";

const user = getStore("user");
```

Read one field:

```ts
const theme = getStore("user", "theme");
```

Read a nested field:

```ts
const city = getStore("user", "profile.city");
```

## Step 3: Update The Store

Stroid gives you three common update styles.

### 1. Merge Part Of An Object Store

```ts
import { setStore } from "stroid";

setStore("user", { theme: "light" });
```

This updates only the fields you pass.
Other object fields stay as they were.

### 2. Update One Exact Field

```ts
setStore("user", "name", "Jo");
setStore("user", "profile.city", "Kathmandu");
```

This is useful when you know the exact path you want to change.

### 3. Use A Draft Function For Bigger Changes

```ts
setStore("user", (draft) => {
  draft.isLoggedIn = true;
  draft.theme = "light";
});
```

This style is helpful when you want to update more than one thing in one place.

## Step 4: Batch Multiple Updates

If you need several updates together, batch them:

```ts
import { setStore, setStoreBatch } from "stroid";

setStoreBatch(() => {
  setStore("user", "theme", "light");
  setStore("user", "isLoggedIn", true);
});
```

This keeps grouped changes together.

## Step 5: Reset Back To The Beginning

```ts
import { resetStore } from "stroid";

resetStore("user");
```

This brings the store back to its original initial value.

## Full Beginner Example

```ts
import { createStore, getStore, resetStore, setStore, setStoreBatch } from "stroid";

createStore("user", {
  name: "Eli",
  theme: "dark",
  isLoggedIn: false,
  profile: {
    city: "Pokhara",
  },
});

console.log(getStore("user", "name"));

setStore("user", { theme: "light" });
setStore("user", "profile.city", "Kathmandu");

setStoreBatch(() => {
  setStore("user", "name", "Jo");
  setStore("user", "isLoggedIn", true);
});

resetStore("user");
```

## Tip

Use object stores for most beginner cases.
They are easier to grow than a single primitive value.

## Note

`getStore("user")` returns the whole store.
`getStore("user", "theme")` returns only one field.

## Warning

Do not create the same store name again to update it.
Use `setStore(...)` after the first `createStore(...)`.


## Navigation

- Previous: [Chapter 69: Install and Imports](INSTALL_AND_IMPORTS.md)
- Jump to: [Unit Sixteen: Beginner Guide](../../FRONT_MATTER/CONTENTS.md#unit-sixteen-beginner-guide)
- Next: [Chapter 71: Use Stroid in React](REACT_USAGE.md)
