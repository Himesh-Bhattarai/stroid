# Chapter 14: Sync Options and Ordering

Chapter opener

The hardest part of sync is not sending messages. It is deciding which message has earned the right to matter.

## Learning Objectives

- Understand the sync option surface.
- Learn how Stroid orders incoming and local state.
- Understand payload limits and environment failures.
- See how schema validation protects incoming state.

## Chapter Outline

- 14.1 Sync Options
- 14.2 Ordering Rules
- 14.3 Validation and Safety

## 14.1 Sync Options

Sync options include:

- `channel`
- `maxPayloadBytes`
- `conflictResolver`

### Example 14.1: Full Sync Configuration

```ts
createStore("document", { content: "" }, {
  sync: {
    channel: "docs-room",
    maxPayloadBytes: 32 * 1024,
    conflictResolver: ({ local, incoming, localUpdated, incomingUpdated }) => {
      return incomingUpdated >= localUpdated ? incoming : local;
    },
  },
});
```

Table 14.1: Sync Option Roles

| Option | Role |
|---|---|
| `channel` | choose the peer room |
| `maxPayloadBytes` | prevent oversized sync messages |
| `conflictResolver` | custom decision when local and incoming disagree |

## 14.2 Ordering Rules

Stroid's sync layer orders state using a combination of:

- clock
- source identifier

`updatedAt` still exists as metadata and as input for `conflictResolver(...)`.
But the built-in accept/reject rule is driven by logical clocks first, then a deterministic source identifier tie-break.

That means incoming state is not accepted just because it arrived later.

### Example 14.2: Competing Writes

```ts
createStore("draft", { value: "" }, {
  sync: true,
});
```

Now imagine two peers write different values near the same time.

The sync system does not ask only:

"Which packet reached me last?"

It asks:

"Which update is newer according to the ordering contract?"

That is the difference between synchronization and message echo.

## 14.3 Validation and Safety

Incoming sync state still passes through sanitize, schema, and validator checks before commit.

That means malformed or invalid incoming state should not silently corrupt the target store.

### Example 14.3: Sync With Schema Gate

```ts
createStore("profile", {
  name: "",
}, {
  schema: {
    safeParse(value: any) {
      return typeof value?.name === "string"
        ? { success: true, data: value }
        : { success: false, error: "Invalid profile" };
    },
  },
  sync: true,
});
```

If the environment does not support `BroadcastChannel`, Stroid reports that through `onError` rather than pretending sync exists.

If a peer sends an incompatible sync protocol message, Stroid ignores it and reports the mismatch instead of guessing.

### Case Study 14.1: Why Ordering Is a Philosophy Problem Too

Most synchronization problems are hidden arguments about authority.

What should win?

- the highest clock?
- the local user?
- the remote writer?
- the custom domain rule?

This is philosophical before it is technical.
The runtime needs an answer because humans disagree about truth faster than code does.

## Chapter 14 Summary

- Sync options define channel, payload safety, and conflict handling.
- Ordering is based on a real contract, not on arrival order alone.
- Incoming state still passes through validation.
- Environment failure is surfaced, not hidden.

## Chapter 14 Review Questions

1. Why is `maxPayloadBytes` part of sync correctness and not just optimization?
2. Why is arrival time not enough for ordering?
3. How does schema validation protect synced stores?

## Chapter 14 Exercises/Activities

1. Write a synced store with a custom channel and payload limit.
2. Describe a case where two writes arrive close together and explain why explicit ordering is required.
3. Add a schema to a synced store and explain what should happen on invalid incoming data.

## Chapter 14 References/Further Reading

- [src/features/sync.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/sync.ts)
- [tests/sync.test.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/tests/sync.test.ts)


## Navigation

- Previous: [Chapter 13: Introduction to Sync Stroid](INTRODUCTION.md)
- Jump to: [Unit Four: Sync of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-four-sync-of-stroid)
- Next: [Chapter 15: Conflicts, Catch-Up, and Cleanup](CONFLICTS_AND_RECOVERY.md)
