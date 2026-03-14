# Unit Seven: Persist of Stroid

Unit opener

Persistence is where state stops being a moment and starts becoming memory. That sounds comforting until you remember that memory can also preserve mistakes, outdated schemas, and truths you no longer want.

This unit explains Stroid persistence as it actually exists: a side-effect feature registration that keeps the store model stable while adding storage-backed survival.

## Unit Objectives

- Understand what `stroid/persist` really is.
- Learn how persistence attaches to stores without changing the core API.
- See how versioning, migrations, and failure strategies work.
- Use persistence with enough honesty to avoid treating storage like magic.

# Chapter 25: Introduction to Persist Stroid

Chapter opener

The wish behind persistence is simple: "do not make me lose this." The engineering question is harder: "what exactly should survive, in what shape, and under what repair strategy when the shape changes?"

## Learning Objectives

- Define the role of `stroid/persist`.
- Understand that the subpath registers behavior rather than exporting a callable API.
- Learn the `persist` option surface.
- Distinguish persistence from automatic correctness.

## Chapter Outline

- 25.1 What the Persist Subpath Actually Does
- 25.2 The Persist Option Group
- 25.3 Why Persistence Is Separate

## 25.1 What the Persist Subpath Actually Does

Import path:

```ts
import "stroid/persist";
```

This subpath registers the persistence runtime.
It does not export a helper function that wraps `createStore`.

That distinction matters because the Stroid model stays the same:

- create the store once
- attach behavior in the options object
- import the feature only when you actually want it

### Example 25.1: Minimal Persist Registration

```ts
import { createStore } from "stroid";
import "stroid/persist";

createStore("theme", { mode: "dark" }, {
  persist: true,
});
```

## 25.2 The Persist Option Group

Persistence works through the `persist` option group inside `createStore`.

Table 25.1: Persist Option Surface

| Option | Role |
|---|---|
| `key` | storage key |
| `driver` | storage-like backend |
| `version` | persisted schema version |
| `migrations` | version upgrade steps |
| `serialize` / `deserialize` | data encoding |
| `encrypt` / `decrypt` | payload wrapping |
| `onMigrationFail` | recovery strategy |
| `onStorageCleared` | external-clear detection |

`encrypt`/`decrypt` are synchronous hooks. If you need async crypto (e.g. WebCrypto), encrypt before persistence and store ciphertext in the state you persist.

### Example 25.2: Explicit Persist Shape

```ts
createStore("auth", {
  user: null,
  token: null,
}, {
  persist: {
    key: "app_auth",
    version: 2,
    serialize: JSON.stringify,
    deserialize: JSON.parse,
  },
});
```

## 25.3 Why Persistence Is Separate

Persistence is not part of lean core because:

- not every store should survive refresh
- persistence adds operational cost
- migration and storage behavior deserve explicit intent

### Figure 25.1: Same Store, Added Memory

```ts
import { createStore } from "stroid";
import "stroid/persist";

createStore("settings", initialSettings, {
  persist: { key: "settings" },
});
```

### Case Study 25.1: Why Storage Must Stay Optional

Teams often discover too late that "persist everything" is not a product feature.
It is a liability when:

- stale drafts resurrect old bugs
- outdated structures survive deploys
- sensitive values remain longer than intended

Persistence is useful precisely because it is optional.

## Chapter 25 Summary

- `stroid/persist` is a registration subpath, not a wrapper API.
- Persistence stays inside the normal `createStore(..., options)` contract.
- The `persist` option group defines storage, encoding, versioning, and recovery behavior.
- Persistence is strongest when used deliberately, not automatically.

## Chapter 25 Review Questions

1. Why does `stroid/persist` register behavior instead of exporting a new store factory?
2. Which `persist` options control encoding and migration?
3. Why is optional persistence healthier than default persistence?

## Chapter 25 Exercises/Activities

1. Write a minimal persisted `theme` store.
2. Explain why a draft form should not always be persisted by default.
3. List which stores in your app should survive refresh and which should not.

## Chapter 25 References/Further Reading

- [src/persist.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/persist.ts)
- [src/features/persist.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/persist.ts)
- [docs/14-persist.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs/14-persist.md)


## Navigation

- Previous: [Chapter 24: Real Use, Real Limits, Real Confidence](../THE_GLITCH_IN_MATRIX/REAL_USE.md)
- Jump to: [Unit Seven: Persist of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-seven-persist-of-stroid)
- Next: [Chapter 26: Storage Drivers, Versioning, and Migrations](STORAGE_AND_MIGRATIONS.md)
