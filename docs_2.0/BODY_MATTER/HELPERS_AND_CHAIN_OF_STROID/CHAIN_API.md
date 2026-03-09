# Chapter 47: The Chain API

Chapter opener

Fluent APIs are appealing because they feel like thought without friction. The real test is whether the fluency still leaves the underlying data path obvious.

## Learning Objectives

- Understand `chain`, `nested`, `target`, `value`, and `set`.
- Learn where chain access is useful.
- See the boundary between fluency and obscurity.
- Use the chain API without forgetting the underlying store path.

## Chapter Outline

- 47.1 Building a Path with `chain`
- 47.2 Reading and Writing
- 47.3 When Chain Helps

## 47.1 Building a Path with `chain`

### Example 47.1: Nested Chain

```ts
const themeNode = chain("settings").nested("appearance").target("theme");
```

## 47.2 Reading and Writing

`value` reads.
`set(...)` writes.

### Example 47.2: Chain Read and Write

```ts
const themeNode = chain("settings").nested("appearance").target("theme");
const current = themeNode.value;
themeNode.set("dark");
```

Table 47.1: Chain API Surface

| API | Purpose |
|---|---|
| `chain(name)` | start chain |
| `.nested(key)` | go deeper |
| `.target(key)` | point at final property |
| `.value` | read |
| `.set(value)` | write |

## 47.3 When Chain Helps

### Case Study 47.1: Why Fluency Can Be Good When It Still Tells the Truth

A fluent API is useful when it reduces syntax while preserving the same mental path.
It becomes harmful when the chain is more memorable than the state shape.

The reader should still know what path is being read or written.
If the API feels elegant but obscures that, the elegance is counterfeit.

## Chapter 47 Summary

- `chain` gives a fluent nested path API.
- It reads through `.value` and writes through `.set(...)`.
- Fluency helps only while the underlying store path stays understandable.

## Chapter 47 Review Questions

1. What is the difference between `nested` and `target`?
2. How do you read and write through the chain API?
3. When can fluent syntax become obscuring instead of helpful?

## Chapter 47 Exercises/Activities

1. Read and write a nested setting using `chain`.
2. Compare a chain-based write with a path-based `setStore`.
3. Decide whether your team would benefit from the chain style.

## Chapter 47 References/Further Reading

- [src/chain.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/chain.ts)
