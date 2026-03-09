# Chapter 27: Failure, Storage Clearing, and Recovery

Chapter opener

The real persistence problem is not "how do I save?" It is "what do I do when what I saved stops deserving trust?"

## Learning Objectives

- Understand storage clearing detection.
- Learn the difference between migration failure and storage disappearance.
- See how Stroid reacts to corrupted or missing persistence.
- Use persistence with realistic recovery expectations.

## Chapter Outline

- 27.1 Storage Clearing
- 27.2 Corruption and Schema Failure
- 27.3 Recovery Without Illusion

## 27.1 Storage Clearing

Persistence can observe external storage clearing when supported by the environment.

### Example 27.1: Storage Cleared Callback

```ts
createStore("auth", initialAuth, {
  persist: {
    key: "auth",
    onStorageCleared: ({ name, key, reason }) => {
      console.log(name, key, reason);
    },
  },
});
```

This matters because missing storage is not the same problem as failed migration.

## 27.2 Corruption and Schema Failure

Persisted data can fail because:

- checksum mismatched
- schema no longer accepts the value
- migration step threw
- decrypt/deserialize failed

Table 27.1: Persist Failure Modes

| Failure | Typical Result |
|---|---|
| checksum mismatch | reset or recover |
| schema failure | reset or recover |
| migration throw | `onMigrationFail` strategy |
| cleared storage | callback, then current runtime decides next state |

## 27.3 Recovery Without Illusion

### Case Study 27.1: Why Persistence Needs Psychological Honesty

Users call it "my data."
Engineers call it "a stored payload."

Both views matter.
The psychological mistake is to assume every old payload deserves resurrection.
Sometimes the kindest thing a system can do is refuse to keep lying about broken memory.

## Chapter 27 Summary

- Persistence failure comes in different forms and should not be treated as one event.
- Storage clearing is observable separately from migration failure.
- Corrupted or invalid data must not be trusted automatically.
- Recovery should preserve trust, not just bytes.

## Chapter 27 Review Questions

1. Why is storage-cleared detection a different concern from migration failure?
2. Which failure modes can happen before schema validation?
3. Why is recovery partly a product decision, not only a technical one?

## Chapter 27 Exercises/Activities

1. Decide what should happen when a persisted session fails schema validation.
2. Describe a store where "keep" is correct and one where "reset" is safer.
3. Write a short recovery policy for your app's persisted state.

## Chapter 27 References/Further Reading

- [src/features/persist.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/persist.ts)
- [tests/persist.test.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/tests/persist.test.ts)
