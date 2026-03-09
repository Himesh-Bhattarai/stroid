# Unit Sixteen: Beginner Guide

Unit opener

This unit is for someone who is new to Stroid and does not want theory first.

You do not need to understand the whole library.
You only need to learn this order:

1. install the package
2. create one store
3. read from the store
4. update the store
5. use it in React if you need UI
6. add advanced features only when a real problem appears

# Chapter 68: Start Here

## What Stroid Is

Stroid is a state-management library.

In normal words, it gives your app a named place to keep data such as:

- logged-in user
- theme mode
- cart items
- form data
- API results

## The Only Three Things To Remember First

Start with these three functions:

- `createStore(...)` creates the state
- `getStore(...)` reads the state
- `setStore(...)` changes the state

If you understand those three, you can understand the rest later.

## Fast Mental Model

Think like this:

1. What data does my app need?
2. What should I call that data?
3. What should the initial value be?
4. Where will I read it?
5. Where will I update it?

## Smallest Working Example

```ts
import { createStore, getStore, setStore } from "stroid";

createStore("counter", { count: 0 });

setStore("counter", "count", 1);

console.log(getStore("counter"));
```

What happened here:

- `"counter"` is the store name
- `{ count: 0 }` is the starting state
- `setStore(...)` changes the value
- `getStore(...)` reads the latest value

## What A Store Name Should Look Like

Pick names that match real app meaning:

- `"user"`
- `"theme"`
- `"cart"`
- `"checkoutForm"`

Avoid vague names like:

- `"data"`
- `"thing"`
- `"globalStuff"`

## Beginner Rule

Start with one small store.
Do not design ten stores before you need them.

## Tip

If you are confused, forget every advanced feature for a moment and ask:
"Can I create it, read it, and update it?"

## Note

You do not need React to use Stroid.
React is just one way to read and update stores in UI.

## Warning

Do not jump into `persist`, `sync`, `devtools`, or `async` on day one.
Learn plain stores first.


## Navigation

- Previous: [Chapter 67: Production Patterns](../BINARY_TO_BEING/PRODUCTION_PATTERNS.md)
- Jump to: [Unit Sixteen: Beginner Guide](../../FRONT_MATTER/CONTENTS.md#unit-sixteen-beginner-guide)
- Next: [Chapter 69: Install and Imports](INSTALL_AND_IMPORTS.md)
