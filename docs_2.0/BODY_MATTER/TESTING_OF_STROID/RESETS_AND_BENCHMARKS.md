# Chapter 51: Resets, Isolation, and Lightweight Benchmarks

Chapter opener

Isolation is what makes a test mean only what it claims to mean. Without reset, tests begin inheriting ghosts from one another.

## Learning Objectives

- Understand `resetAllStoresForTest`.
- Learn why isolation matters for registry-based systems.
- Use `benchmarkStoreSet` carefully.
- Keep performance measurement honest and lightweight.

## Chapter Outline

- 51.1 Reset Semantics
- 51.2 Async/Test Isolation
- 51.3 Lightweight Benchmarks

## 51.1 Reset Semantics

`resetAllStoresForTest()` is the public test reset path.

### Example 51.1: Test Reset

```ts
resetAllStoresForTest();
```

## 51.2 Async/Test Isolation

Reset matters because Stroid state is more than just visible stores.
It also includes internal async and registry state.

Table 51.1: Why Reset Exists

| Reset Target | Reason |
|---|---|
| stores | remove state carryover |
| subscribers | prevent cross-test listeners |
| async metadata | prevent cross-test inflight/cache leakage |

## 51.3 Lightweight Benchmarks

`benchmarkStoreSet` is useful for rough measurement, not for replacing serious benchmarking.

### Example 51.2: Benchmark Helper

```ts
const result = benchmarkStoreSet("counter", 1000);
```

### Case Study 51.1: Why Rough Measurement Still Helps

Not every performance question deserves a laboratory.
Sometimes a rough measurement is enough to reveal that a path is clearly cheap or clearly expensive.

The danger is only when rough measurement starts pretending to be final truth.

## Chapter 51 Summary

- Test reset is essential for isolation in a registry-based runtime.
- Reset must clear more than visible store objects.
- `benchmarkStoreSet` is useful as a rough signal, not a final benchmark methodology.

## Chapter 51 Review Questions

1. Why is reset important in a registry-based library?
2. What kinds of state must be cleared for real test isolation?
3. Why should `benchmarkStoreSet` remain a lightweight helper?

## Chapter 51 Exercises/Activities

1. Add `resetAllStoresForTest` to a test setup and explain why it belongs there.
2. Use `benchmarkStoreSet` to compare two small update patterns.
3. Describe the difference between smoke benchmarking and serious benchmarking.

## Chapter 51 References/Further Reading

- [src/testing.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/testing.ts)
- [tests/testing.test.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/tests/testing.test.ts)


## Navigation

- Previous: [Chapter 50: Mock Stores and Time Control](MOCKS_AND_TIME.md)
- Jump to: [Unit Thirteen: Testing of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-thirteen-testing-of-stroid)
- Next: [Chapter 52: Real Use of Testing Stroid](REAL_USE.md)
