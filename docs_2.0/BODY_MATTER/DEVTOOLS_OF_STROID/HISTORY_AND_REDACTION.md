# Chapter 30: History, Diffs, and Redaction

Chapter opener

A history log feels objective until you remember that every log is a choice about what deserves memory and what deserves privacy.

## Learning Objectives

- Understand history entries and diffs.
- Learn how `historyLimit` shapes cost.
- Use redaction to avoid leaking sensitive values.
- Treat history as a debugging lens, not a truth oracle.

## Chapter Outline

- 30.1 History Entries
- 30.2 Limits and Diffing
- 30.3 Redaction as Discipline

## 30.1 History Entries

Devtools history records:

- timestamp
- action
- previous state
- next state
- shallow diff

### Example 30.1: Reading History

```ts
const entries = getHistory("profile", 10);
```

## 30.2 Limits and Diffing

History is bounded by `historyLimit`.

Table 30.1: History Controls

| Control | Effect |
|---|---|
| `enabled` | allow devtools behavior |
| `historyLimit` | bound stored history |
| shallow diff | summarize changed keys |

Large history is not free.
It buys insight with memory and cloning cost.

## 30.3 Redaction as Discipline

Redaction exists because debugging and exposure are close cousins.

### Example 30.2: Redacted History

```ts
createStore("auth", initialAuth, {
  devtools: {
    enabled: true,
    redactor: (state) => ({ ...state, token: "***" }),
  },
});
```

### Case Study 30.1: Why Visibility Without Restraint Is a Security Habit

Teams often say they only need raw data "for debugging."
Then logs, history entries, or devtools snapshots become a second storage system for secrets.

Redaction is not paranoia.
It is the refusal to confuse access with entitlement.

## Chapter 30 Summary

- History entries capture action, before/after state, and a shallow diff.
- `historyLimit` bounds cost and should be chosen deliberately.
- Redaction is part of mature debugging, not optional polish.

## Chapter 30 Review Questions

1. What does a history entry contain?
2. Why should `historyLimit` stay explicit?
3. Why is redaction a design discipline?

## Chapter 30 Exercises/Activities

1. Add a redactor for an auth store.
2. Choose a history limit for a small admin panel and justify it.
3. Explain why a debug log can become a privacy surface.

## Chapter 30 References/Further Reading

- [src/features/devtools.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/devtools.ts)
- [tests/store.test.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/tests/store.test.ts)
