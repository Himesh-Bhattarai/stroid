# Chapter 69: Install and Imports

## Step 1: Install Stroid

Use one package manager command, not all of them.

```bash
npm install stroid
```

```bash
pnpm add stroid
```

```bash
yarn add stroid
```

```bash
bun add stroid
```

## Requirements

- Node `>=18`
- React `>=18` only if you plan to use `stroid/react`

## Step 2: Start With The Core Import

For most beginners, this is enough:

```ts
import { createStore, getStore, setStore } from "stroid";
```

You can also import the core path directly:

```ts
import { createStore, getStore, setStore } from "stroid/core";
```

Use the root package if you want the simple start.
Use `stroid/core` if you want to be very explicit that you are only using the core API.

## Step 3: Learn The Extra Entry Points

You do not need all of these on the first day.

- `stroid/react`: read stores inside React components
- `stroid/selectors`: watch a smaller or derived piece of state
- `stroid/async`: fetch and cache API data
- `stroid/persist`: keep store data after page refresh
- `stroid/sync`: share store updates across browser tabs
- `stroid/devtools`: inspect history and debug changes
- `stroid/runtime-tools`: inspect stores at runtime
- `stroid/runtime-admin`: clear or manage stores globally
- `stroid/testing`: helpers for tests

Example: list store names at runtime

```ts
import { listStores } from "stroid/runtime-tools";

console.log(listStores());
```

## The Most Important Import Rule

`stroid/persist`, `stroid/sync`, and `stroid/devtools` are side-effect imports.

That means they turn on feature runtimes.
Import them once before expecting those store options to work.

```ts
import "stroid/persist";
import "stroid/sync";
import "stroid/devtools";
```

Then you can use matching store options such as:

- `persist: ...`
- `sync: ...`
- `devtools: ...`

By default, missing feature imports throw to avoid silent production failures.
If you want warn-only behavior (not recommended), add this once at startup:

```ts
import { configureStroid } from "stroid";

configureStroid({ strictFeatures: false });
```

## Where To Put Those Imports

A safe beginner choice is to place them near app startup.

Example:

```ts
// src/state/setup.ts
import "stroid/persist";
import "stroid/devtools";
```

Then import that setup file early in your app.

## Tip

Start with `stroid` only.
Add extra entry points one by one when you understand why you need them.

## Note

`stroid/async` is different from `persist`, `sync`, and `devtools`.
It exports functions like `fetchStore(...)`.
It is not a side-effect import that you turn on with a bare import line.

## Warning

If you write `persist: true`, `sync: true`, or `devtools: true` in a store but forget the matching import, Stroid throws by default.
Import the feature first, or explicitly opt out via `configureStroid({ strictFeatures: false })`.


## Navigation

- Previous: [Chapter 68: Start Here](START_HERE.md)
- Jump to: [Unit Sixteen: Beginner Guide](../../FRONT_MATTER/CONTENTS.md#unit-sixteen-beginner-guide)
- Next: [Chapter 70: Your First Store](FIRST_STORE.md)
