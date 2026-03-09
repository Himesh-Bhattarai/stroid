# Unit Eleven: Server of Stroid

Unit opener

Server state is where isolation becomes moral, not just technical. A mistake here does not merely cause a bug. It can cause one request to inherit another request's reality.

This unit documents the supported server story in Stroid as it actually exists.

## Unit Objectives

- Understand `stroid/server`.
- Learn the role of `createStoreForRequest`.
- See how snapshot and hydrate flow work together.
- Understand the limits of the current SSR contract.

# Chapter 41: Introduction to Server Stroid

Chapter opener

The real question in SSR is not whether state can exist on the server. It is whether that state knows who it belongs to.

## Learning Objectives

- Define the role of `stroid/server`.
- Learn the supported request-scoped pattern.
- Distinguish server buffering from global server stores.
- Understand why request isolation matters.

## Chapter Outline

- 41.1 The Server Subpath
- 41.2 `createStoreForRequest`
- 41.3 Why Request Scope Matters

## 41.1 The Server Subpath

Import path:

```ts
import { createStoreForRequest } from "stroid/server";
```

This subpath is intentionally narrow.

## 41.2 `createStoreForRequest`

`createStoreForRequest` builds a request-local buffer with:

- `create`
- `set`
- `get`
- `snapshot`
- `hydrate`

### Example 41.1: Request Buffer

```ts
const requestState = createStoreForRequest(({ create, set }) => {
  create("session", { user: null });
  set("session", (draft: any) => {
    draft.user = { id: "u1" };
  });
});
```

## 41.3 Why Request Scope Matters

### Case Study 41.1: Why Shared Server Truth Is a Dangerous Shortcut

The temptation on the server is to reuse state because reuse feels efficient.
But request data is not communal property.
Isolation is the cost of correctness.

## Chapter 41 Summary

- `stroid/server` intentionally exposes a narrow SSR/request API.
- `createStoreForRequest` is the supported request-local pattern.
- Request scope matters because server truth must not bleed across users.

## Chapter 41 Review Questions

1. What does `stroid/server` export?
2. Why is `createStoreForRequest` narrow by design?
3. Why is request isolation a correctness issue?

## Chapter 41 Exercises/Activities

1. Sketch a request buffer for session and settings state.
2. Explain why global server state is risky.
3. Describe what kind of state should exist only per request.

## Chapter 41 References/Further Reading

- [src/server.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/server.ts)


## Navigation

- Previous: [Chapter 40: Real Use of Runtime Operations](../RUNTIME_OPERATIONS_OF_STROID/REAL_USE.md)
- Jump to: [Unit Eleven: Server of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-eleven-server-of-stroid)
- Next: [Chapter 42: Request Scope and Buffered Mutation](REQUEST_SCOPE.md)
