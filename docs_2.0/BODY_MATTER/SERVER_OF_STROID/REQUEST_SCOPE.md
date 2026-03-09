# Chapter 42: Request Scope and Buffered Mutation

Chapter opener

Buffered mutation is a promise that work can happen safely before truth is published globally. The promise is only valuable if the buffer really belongs to one request.

## Learning Objectives

- Understand the buffered API inside `createStoreForRequest`.
- Learn how request-local `create`, `set`, and `get` behave.
- See why request buffering exists instead of direct global mutation.
- Use request scope with disciplined assumptions.

## Chapter Outline

- 42.1 Request-Local Create and Set
- 42.2 Snapshot Reads
- 42.3 Why Buffer First

## 42.1 Request-Local Create and Set

### Example 42.1: Create Then Set

```ts
const req = createStoreForRequest(({ create, set }) => {
  create("cart", { items: [] });
  set("cart", (draft: any) => {
    draft.items.push({ id: "a1" });
  });
});
```

## 42.2 Snapshot Reads

`snapshot()` returns the deep-cloned buffered record.

Table 42.1: Request Buffer API

| API | Purpose |
|---|---|
| `create` | create request-local state |
| `set` | update request-local state |
| `get` | read request-local state |
| `snapshot` | export the buffered record |
| `hydrate` | publish into real stores |

## 42.3 Why Buffer First

### Case Study 42.1: Why Publication Should Be a Separate Act

A buffer gives you a staging area.
That staging area matters because it separates:

- preparing truth
- publishing truth

That separation reduces accidental cross-request confusion.

## Chapter 42 Summary

- Request-local mutation happens in a buffer first.
- `snapshot` and `hydrate` make publication explicit.
- Buffering is useful because preparation and publication are not the same act.

## Chapter 42 Review Questions

1. Why must `set` follow `create` in the request buffer?
2. What does `snapshot` return?
3. Why is publication a separate operation?

## Chapter 42 Exercises/Activities

1. Write a request-local create/set flow for a profile and a cart.
2. Explain why a buffer is safer than immediate global creation.
3. Decide what data should never leave request scope.

## Chapter 42 References/Further Reading

- [src/server.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/server.ts)


## Navigation

- Previous: [Chapter 41: Introduction to Server Stroid](INTRODUCTION.md)
- Jump to: [Unit Eleven: Server of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-eleven-server-of-stroid)
- Next: [Chapter 43: Snapshot and Hydrate Flow](HYDRATE_FLOW.md)
