# Chapter 22: Tradeoffs, Costs, and Weaker Fits

Chapter opener

The dangerous phase in library adoption is not confusion. It is premature certainty. That is when teams stop asking what the tool costs and start assuming the tool is neutral.

## Learning Objectives

- Identify the real tradeoffs in Stroid's model.
- Understand where Stroid is weaker than alternative approaches.
- See how split features change both clarity and responsibility.
- Decide when Stroid is a poor fit on purpose.

## Chapter Outline

- 22.1 Core Tradeoffs
- 22.2 Where Stroid Is Weaker
- 22.3 Choosing the Wrong Tool Early

## 22.1 Core Tradeoffs

Stroid gives you a unified named-store model, but that model is not free.

It trades for:

- explicit store naming instead of local anonymous ownership
- split imports instead of one giant default entry
- safety and validation layers instead of the thinnest possible hot path
- one options object instead of many disconnected setup calls

### Example 22.1: Convenience Versus Clarity

```ts
createStore("profile", initialState, {
  validate,
  lifecycle,
  persist: { key: "profile" },
});
```

This is readable because behavior is centralized.
It is also denser than a bare mutable store with no rules.

## 22.2 Where Stroid Is Weaker

Honest fit matters more than brand loyalty.

Table 22.1: Where Stroid Is Not the Strongest Tool

| Situation | Why Stroid Is Weaker |
|---|---|
| selector-heavy React architecture | selector precision exists, but this is not the library's strongest ergonomic/performance story |
| ultra-minimal state with no policy needs | Stroid may feel heavier than needed |
| teams that want zero named global surface | named stores are a deliberate model, not an optional afterthought |
| teams that want hidden magic for temp lifetimes | Stroid does not auto-manage that lifecycle magically |

This does not mean the library fails there every time.
It means the user should not pretend the fit is naturally optimal.

## 22.3 Choosing the Wrong Tool Early

Most bad state decisions happen for emotional reasons before they happen for technical reasons.

People often choose tools because they:

- want immediate convenience
- want fewer visible decisions
- want abstraction to remove discomfort

### Case Study 22.1: Why "It Felt Easier" Is Often a Warning

A team chooses a tool because the first demo is shorter.
Months later they discover:

- no clear split between core and optional behavior
- unclear debugging boundaries
- silent widening of component subscriptions
- difficult migration from small app habits to larger app realities

The lesson is not that convenience is bad.
It is that convenience without explicit structure often delays cost instead of removing it.

## Chapter 22 Summary

- Stroid's gains come with real costs in explicitness and structure.
- It is weaker in some architectures, especially selector-heavy React designs.
- Split features increase clarity but also require user intention.
- Wrong tool choice often begins as emotional avoidance of visible tradeoffs.

## Chapter 22 Review Questions

1. Which parts of Stroid's model trade simplicity for structure?
2. In what kinds of apps is Stroid a weaker fit?
3. Why can emotional convenience distort technical decisions?

## Chapter 22 Exercises/Activities

1. Describe one project where Stroid would be a strong fit and one where it would be a weak fit.
2. List the explicit decisions Stroid asks you to make that another library might hide.
3. Explain whether your team benefits more from visible rules or invisible convenience.

## Chapter 22 References/Further Reading

- [docs_2.0/BODY_MATTER/CORE_OF_STROID/REAL_USE.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs_2.0/BODY_MATTER/CORE_OF_STROID/REAL_USE.md)
- [docs_2.0/BODY_MATTER/REACT_OF_STROID/REAL_USE.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs_2.0/BODY_MATTER/REACT_OF_STROID/REAL_USE.md)
- [docs_2.0/BODY_MATTER/OPT_IN_FEATURES_OF_STROID/POWER_TOOLS.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/docs_2.0/BODY_MATTER/OPT_IN_FEATURES_OF_STROID/POWER_TOOLS.md)
