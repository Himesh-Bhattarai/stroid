# Chapter 8: Power Tools and Utility Subpaths

Chapter opener

The strongest libraries are not only about state mutation. They are about operational leverage. Utility subpaths exist for the moments when you need fluency, helpers, testing support, request buffering, or inspection beyond everyday app code.

## Learning Objectives

- Understand the purpose of Stroid's utility and admin subpaths.
- Learn when to use helper factories, request buffering, runtime inspection, and testing utilities (and the planned `chain` API).
- Distinguish read-only tools from destructive admin tools.
- Build a clean import strategy for operational concerns.

## Chapter Outline

- 8.1 Fluent and Helper APIs
- 8.2 Server and Runtime Operations
- 8.3 Testing and Controlled Reset

## 8.1 Fluent and Helper APIs

Import paths:

```ts
import { createCounterStore, createListStore, createEntityStore } from "stroid/helpers";
```

These APIs are convenience layers over core behavior.

Note:
`stroid/chain` is not exported in the current build. The chain API described elsewhere in this book is a forward-looking placeholder.

### Example 8.1: Factory Helpers

```ts
import { createCounterStore, createListStore } from "stroid/helpers";

const counter = createCounterStore("views", 0);
counter.inc();

const todos = createListStore("todos", []);
todos.push({ id: 1, text: "Write docs" });
```

### Example 8.2: Entity Helper

```ts
import { createEntityStore } from "stroid/helpers";

const users = createEntityStore<{ id: string; name: string }>("users");
users.upsert({ id: "u1", name: "Ari" });
```

These helpers are useful, but they are intentionally not part of lean core because they are convenience, not identity.

## 8.2 Server and Runtime Operations

Import paths:

```ts
import { createStoreForRequest } from "stroid/server";
import {
  listStores,
  getStoreMeta,
  getInitialState,
  getMetrics,
  getSubscriberCount,
  getAsyncInflightCount,
  getPersistQueueDepth,
  getComputedGraph,
  getComputedDeps,
} from "stroid/runtime-tools";
import { clearAllStores, clearStores } from "stroid/runtime-admin";
```

The distinction between `runtime-tools` and `runtime-admin` matters.

Table 8.1: Runtime Operation Boundaries

| Import | Role | Safe for inspection? | Destructive? |
|---|---|---|---|
| `stroid/runtime-tools` | inspect registry state | Yes | No |
| `stroid/runtime-admin` | global cleanup | No | Yes |

### Example 8.3: Request Buffering

```ts
import { createStoreForRequest } from "stroid/server";

const requestState = createStoreForRequest((api) => {
  api.create("bootstrap", { user: null, locale: "en" }, {
    validate: (next: any) => typeof next?.locale === "string",
  });
  api.set("bootstrap", (draft: any) => {
    draft.locale = "ne";
  });
});

const snapshot = requestState.snapshot();
const html = requestState.hydrate(() => renderApp());
```

Note:
`hydrate(renderFn, options?)` runs the render function inside the request registry context.
Options passed to `api.create(name, data, options)` are buffered and applied later when `hydrate()` creates the real store.

If you also pass options into `hydrate(...)`, those explicit hydrate-time options override the buffered per-store options.

### Example 8.4: Runtime Inspection

```ts
import {
  listStores,
  getStoreMeta,
  getInitialState,
  getMetrics,
  getSubscriberCount,
  getAsyncInflightCount,
  getPersistQueueDepth,
  getComputedGraph,
  getComputedDeps,
} from "stroid/runtime-tools";

console.log(listStores());
console.log(getStoreMeta("theme"));
console.log(getInitialState());
console.log(getMetrics("theme"));
console.log(getSubscriberCount("theme"));
console.log(getAsyncInflightCount("theme"));
console.log(getPersistQueueDepth("theme"));
console.log(getComputedGraph());
console.log(getComputedDeps("theme"));
```

### Example 8.5: Runtime Admin

```ts
import { clearAllStores, clearStores } from "stroid/runtime-admin";

clearAllStores();
clearStores("temp-*");
```

Admin power deserves a separate path because destructive operations should never hide inside harmless-looking utility imports.

## 8.3 Testing and Controlled Reset

Import path:

```ts
import { createMockStore, withMockedTime, resetAllStoresForTest, benchmarkStoreSet } from "stroid/testing";
```

Testing utilities exist to make verification explicit and repeatable.

### Example 8.6: Mock Store

```ts
import { createMockStore } from "stroid/testing";

const mock = createMockStore("demo", { value: 1 });
mock.set({ value: 2 });
mock.reset();
```

### Example 8.7: Controlled Time and Benchmarks

```ts
import { benchmarkStoreSet, withMockedTime } from "stroid/testing";

withMockedTime(123456, () => {
  console.log(Date.now());
});

console.log(benchmarkStoreSet("counter", 1000));
```

### Figure 8.1: Utility Imports by Intent

```ts
import { createStoreForRequest } from "stroid/server";
import { clearAllStores } from "stroid/runtime-admin";
import { resetAllStoresForTest } from "stroid/testing";
```

These imports tell a story immediately:

- helper factories
- server request preparation
- admin cleanup
- test-only reset

That kind of explicitness is healthy architecture.

### Case Study 8.1: Why Power Tools Stay Separate

When operational utilities live in the same import surface as everyday state code, teams stop feeling the difference between normal behavior and privileged behavior.

That is dangerous.

Stroid keeps these tools explicit so that:

- convenience remains optional
- inspection remains lightweight
- destructive operations remain visible
- test-only behavior does not leak into ordinary runtime thinking

## Chapter 8 Summary

- Helper factories are convenience layers.
- `server`, `runtime-tools`, and `runtime-admin` support operational and environment-specific work.
- `testing` provides controlled helpers for verification and benchmarking.
- Keeping these paths separate improves clarity and protects core from accidental sprawl.

## Chapter 8 Review Questions

1. Why is `clearAllStores` better placed in `stroid/runtime-admin` than in core?
2. What is the difference between `runtime-tools` and `testing`?
3. Why are helper factories useful but still not part of lean core?

## Chapter 8 Exercises/Activities

1. Create one example that uses `createListStore`.
2. Write a request-buffering example with `createStoreForRequest`, `snapshot`, and `hydrate`.
3. Describe which subpath you would use for inspection, destructive cleanup, and benchmarks.

## Chapter 8 References/Further Reading

- [src/helpers.ts](/src/helpers.ts)
- [src/server.ts](/src/server.ts)
- [src/runtime-tools.ts](/src/runtime-tools.ts)
- [src/runtime-admin.ts](/src/runtime-admin.ts)
- [src/testing.ts](/src/testing.ts)


## Navigation

- Previous: [Chapter 7: Runtime Layers](RUNTIME_LAYERS.md)
- Jump to: [Unit Two: Opt-In Features of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-two-opt-in-features-of-stroid)
- Next: [Chapter 9: Introduction to Async Stroid](../ASYNC_OF_STROID/INTRODUCTION.md)

