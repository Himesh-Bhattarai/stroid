# Chapter 26: Storage Drivers, Versioning, and Migrations

Chapter opener

Storage is not just where data goes. It is the border where yesterday's assumptions meet today's code.

## Learning Objectives

- Understand driver expectations.
- Learn how persisted envelopes are versioned.
- See how migrations are applied.
- Know what recovery paths exist when persisted state no longer fits.

## Chapter Outline

- 26.1 Drivers and Payload Shape
- 26.2 Versioning and Migrations
- 26.3 Failure Strategies

## 26.1 Drivers and Payload Shape

Stroid persistence expects a driver with storage-like methods such as `getItem`, `setItem`, and `removeItem`.

### Example 26.1: Custom Driver Shape

```ts
const memoryDriver = {
  getItem(key: string) {
    return store[key] ?? null;
  },
  setItem(key: string, value: string) {
    store[key] = value;
  },
  removeItem(key: string) {
    delete store[key];
  },
};
```

Persisted data is wrapped in an envelope with:

- version
- checksum
- serialized data

That makes accidental corruption detection and migration decisions possible.
The checksum is not a cryptographic signature and does not prevent malicious tampering.

If you are persisting very large stores and want to avoid the checksum cost,
you can opt out:

```ts
createStore("bigCache", initialState, {
  persist: {
    checksum: "none",
  },
});
```

Disabling checksum removes the integrity check on load; use it only when you
accept that tradeoff.

## 26.2 Versioning and Migrations

When the persisted version differs from the target version, Stroid walks migration steps in order.

### Example 26.2: Versioned Migration

```ts
createStore("profile", initialProfile, {
  persist: {
    key: "profile",
    version: 3,
    migrations: {
      2: (oldState) => ({ ...oldState, theme: "light" }),
      3: (oldState) => ({ ...oldState, locale: "en" }),
    },
  },
});
```

Table 26.1: Migration Outcomes

| Situation | Result |
|---|---|
| matching version | load directly |
| valid migration path | apply migrations |
| no path | use `onMigrationFail` strategy |
| migrated but schema-invalid | recover or reset |

## 26.3 Failure Strategies

Persistence is mature only if recovery behavior is explicit.

### Figure 26.1: Persist Failure Is a Decision Tree

```text
load -> checksum/schema/version check -> migrate or recover -> set state or reset
```

### Case Study 26.1: Why "Keep the Old Data" Is Not Always Mercy

Keeping broken persisted data can feel user-friendly in the short term.
But if the structure is no longer trustworthy, preserving it may simply prolong confusion.

The correct strategy depends on the domain:

- reset for disposable UI state
- keep for salvageable user drafts
- custom recover for critical business state

## Chapter 26 Summary

- Drivers give Stroid the storage boundary.
- Persistence uses versioned envelopes instead of naive raw dumps.
- Migration steps are ordered and explicit.
- Recovery strategy is part of the contract, not an afterthought.

## Chapter 26 Review Questions

1. Why is a checksum useful in persisted state?
2. What happens when there is no migration path?
3. Why should recovery strategy depend on domain value?

## Chapter 26 Exercises/Activities

1. Design a migration path from version 1 to version 3.
2. Choose an `onMigrationFail` strategy for a draft form and justify it.
3. Write a minimal custom storage driver.

## Chapter 26 References/Further Reading

- [src/features/persist.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/persist.ts)
- [tests/persist.test.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/tests/persist.test.ts)


## Navigation

- Previous: [Chapter 25: Introduction to Persist Stroid](INTRODUCTION.md)
- Jump to: [Unit Seven: Persist of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-seven-persist-of-stroid)
- Next: [Chapter 27: Failure, Storage Clearing, and Recovery](FAILURE_AND_RECOVERY.md)
