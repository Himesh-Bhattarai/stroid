# Unit Thirteen: Testing of Stroid

Unit opener

Testing changes the emotional contract between the developer and the code. It replaces vague hope with repeatable evidence. A library that wants trust should make that transition easy.

This unit explains Stroid's testing surface as a real part of the package, not a hidden internal convenience.

## Unit Objectives

- Understand the `stroid/testing` subpath.
- Learn how mock stores, time helpers, resets, and benchmarks work.
- Use testing helpers without confusing them for production runtime APIs.
- Connect testing convenience back to trust and repeatability.

# Chapter 49: Introduction to Testing Stroid

Chapter opener

The strongest test helpers do not invent a second world. They simply make the real world easier to set up, reset, and measure.

## Learning Objectives

- Define the role of `stroid/testing`.
- Learn what the testing subpath exports.
- Understand why these APIs remain separate from the main runtime.
- Treat testing helpers as controlled scaffolding.

## Chapter Outline

- 49.1 The Testing Subpath
- 49.2 Public Testing APIs
- 49.3 Why Testing Stays Separate

## 49.1 The Testing Subpath

Import path:

```ts
import { createMockStore, withMockedTime, resetAllStoresForTest, benchmarkStoreSet } from "stroid/testing";
```

## 49.2 Public Testing APIs

Table 49.1: Testing Surface

| API | Purpose |
|---|---|
| `createMockStore` | quick test store |
| `withMockedTime` | deterministic time |
| `resetAllStoresForTest` | test reset |
| `benchmarkStoreSet` | lightweight benchmark helper |

## 49.3 Why Testing Stays Separate

### Case Study 49.1: Why Test Convenience Should Not Leak Into Runtime Habit

A test helper is useful because it compresses setup and cleanup.
If the same helper becomes normal product code, the codebase begins solving the wrong problem.

## Chapter 49 Summary

- `stroid/testing` is a dedicated public testing surface.
- It exists to reduce setup friction while preserving the real runtime model.
- Testing helpers should stay in testing contexts.

## Chapter 49 Review Questions

1. What does `stroid/testing` export?
2. Why is it separated from the main runtime?
3. What is the risk of using test helpers as product abstractions?

## Chapter 49 Exercises/Activities

1. Create a simple mock store for a test.
2. Explain why testing helpers should remain scoped to tests.
3. Decide which helper would be most useful in your current test suite.

## Chapter 49 References/Further Reading

- [src/testing.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/testing.ts)
