# Chapter 50: Mock Stores and Time Control

Chapter opener

Tests fail emotionally before they fail technically. The moment a test feels nondeterministic, the developer stops trusting not only the test but also their own reading of the system.

## Learning Objectives

- Use `createMockStore`.
- Use `withMockedTime` for deterministic timing.
- Understand what these helpers simplify.
- Keep tests readable without inventing fake runtime semantics.

## Chapter Outline

- 50.1 `createMockStore`
- 50.2 `withMockedTime`
- 50.3 Trust Through Determinism

## 50.1 `createMockStore`

### Example 50.1: Mock Store

```ts
const mock = createMockStore("profile", { name: "Ari" });
mock.set({ name: "Nova" });
```

## 50.2 `withMockedTime`

### Example 50.2: Frozen Time

```ts
withMockedTime(1_700_000_000_000, () => {
  // run deterministic time-sensitive assertions
});
```

Table 50.1: Determinism Helpers

| Helper | Purpose |
|---|---|
| `createMockStore` | reduce setup noise |
| `withMockedTime` | stabilize time-based behavior |

## 50.3 Trust Through Determinism

### Case Study 50.1: Why Flaky Tests Damage More Than Speed

Flaky tests do not merely waste time.
They corrode the developer's willingness to believe evidence.

That is why deterministic time and simple mock setup matter.
They protect trust.

## Chapter 50 Summary

- `createMockStore` simplifies realistic setup.
- `withMockedTime` reduces time-based nondeterminism.
- Determinism improves both speed and trust.

## Chapter 50 Review Questions

1. What does `createMockStore` simplify?
2. Why is time control important in tests?
3. Why do flaky tests damage trust?

## Chapter 50 Exercises/Activities

1. Write a test setup using `createMockStore`.
2. Freeze time around one metrics or history assertion.
3. Explain why deterministic tests improve team confidence.

## Chapter 50 References/Further Reading

- [src/testing.ts](/src/testing.ts)


## Navigation

- Previous: [Chapter 49: Introduction to Testing Stroid](INTRODUCTION.md)
- Jump to: [Unit Thirteen: Testing of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-thirteen-testing-of-stroid)
- Next: [Chapter 51: Resets, Isolation, and Lightweight Benchmarks](RESETS_AND_BENCHMARKS.md)

