# Chapter 39: Admin Operations and Global Cleanup

Chapter opener

Global cleanup sounds simple until you realize it is the software equivalent of sweeping a building while people are still inside it.

## Learning Objectives

- Understand `clearAllStores`.
- Learn why it lives in `runtime-admin`.
- See what kinds of workflows justify global cleanup.
- Respect destructive operations as explicit administrative acts.

## Chapter Outline

- 39.1 `clearAllStores`
- 39.2 Legitimate Uses
- 39.3 Why Destructive APIs Need Distance

## 39.1 `clearAllStores`

Import path:

```ts
import { clearAllStores } from "stroid/runtime-admin";
```

This is the only public API in that subpath.

### Example 39.1: Global Reset

```ts
clearAllStores();
```

## 39.2 Legitimate Uses

Legitimate uses include:

- logout/full reset workflows
- embedded tooling
- test environments
- administrative reset screens

Table 39.1: Good and Bad `clearAllStores` Use

| Use | Read |
|---|---|
| logout reset | good |
| test cleanup | good |
| normal feature interaction | bad |
| casual UI convenience | bad |

## 39.3 Why Destructive APIs Need Distance

### Figure 39.1: Danger Deserves Friction

```text
more destructive power -> more explicit import boundary
```

### Case Study 39.1: Why "Easy to Call" Is Not Always a Good Property

Teams sometimes confuse accessibility with good design.
But a destructive global API should feel slightly heavier to reach.
That weight reminds the caller that a decision is being made, not just a helper being used.

## Chapter 39 Summary

- `clearAllStores` is a real operational API, but it is destructive.
- It belongs in `runtime-admin`, not lean core.
- Good uses are deliberate and limited.

## Chapter 39 Review Questions

1. Why is `clearAllStores` isolated from `runtime-tools`?
2. Which workflows justify using it?
3. Why is friction healthy for destructive APIs?

## Chapter 39 Exercises/Activities

1. Decide whether your app needs a true global reset.
2. Write a short guideline for when `clearAllStores` is allowed.
3. Explain why destructive convenience can become dangerous.

## Chapter 39 References/Further Reading

- [src/runtime-admin.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/runtime-admin.ts)
- [src/internals/store-admin.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/internals/store-admin.ts)
