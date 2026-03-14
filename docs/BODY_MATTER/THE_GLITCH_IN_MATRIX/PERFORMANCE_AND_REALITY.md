# Chapter 23: Performance, Scaling, and Reality

Chapter opener

Benchmarks are useful only when they interrupt fantasy instead of feeding it. Performance numbers should tell you where the design bends, where it holds, and where it should not be forced to impersonate another model.

## Learning Objectives

- Read Stroid's benchmark numbers in architectural context.
- Understand the difference between raw subscription strength and selector cost.
- Learn where performance pressure actually appears.
- Use performance data as a guide to design, not just bragging rights.

## Chapter Outline

- 23.1 What the Numbers Actually Say
- 23.2 Where the Cost Really Lives
- 23.3 Performance as Architectural Feedback

## 23.1 What the Numbers Actually Say

The current measured story is strong, but not magical.

Table 23.1: Practical Performance Read

| Surface | Honest Read |
|---|---|
| core / lean default | under 10 KB gzip |
| core subscriber fanout | strong for raw subscribers |
| selectors | materially heavier than raw subscriptions |
| React layer | acceptable for what it includes, but not tiny |
| async layer | heavier than core because it carries real orchestration |

These numbers matter because they show where the system is actually efficient and where the convenience layers add real cost.

### Example 23.1: The Wrong Performance Conclusion

The wrong conclusion is:

```text
"Everything is fast, so design does not matter."
```

The correct conclusion is:

```text
"Some paths are strong, and some paths become expensive sooner. Design still matters."
```

## 23.2 Where the Cost Really Lives

Stroid's current performance story is not uniform.

The main reality points are:

- raw subscriber fanout is strong
- selectors cost more in CPU and memory
- React inherits selector and subscription discipline problems
- async and sync add real orchestration overhead because they do real work

### Figure 23.1: Performance Pressure Is Not Evenly Distributed

```text
core writes -> strong
selectors -> heavier
react precision mistakes -> multiply cost
async/sync -> pay for orchestration
```

### Case Study 23.1: Why the Fast Path Can Still Produce a Slow App

A system can have excellent raw update speed and still create a sluggish UI when:

- components subscribe too broadly
- selectors are overused carelessly
- async reads are treated as free
- sync is enabled where it is not needed

The runtime is only one part of performance.
Subscription discipline is the other part.

## 23.3 Performance as Architectural Feedback

Performance numbers are most useful when they change how you structure code.

That means:

- keeping core reads clear
- choosing selectors intentionally
- using async and sync where they add real value
- not pretending every convenience layer belongs in every screen

The philosophical mistake is to think a limitation humiliates the tool.
The wiser reading is that the limit teaches the correct use pattern.

## Chapter 23 Summary

- Stroid is strong on raw core behavior and weaker on selector-heavy paths.
- Performance cost is concentrated, not evenly distributed.
- React, async, and sync are acceptable costs when used intentionally.
- Performance numbers should change architecture decisions, not just marketing copy.

## Chapter 23 Review Questions

1. Where is Stroid strongest in performance terms?
2. Why do selectors change the scaling story?
3. How can good benchmark data still lead to bad architectural decisions?

## Chapter 23 Exercises/Activities

1. Describe a screen where a raw field read is better than a selector.
2. List which parts of your application truly need async orchestration or sync.
3. Rewrite one performance claim into a more honest design guideline.

## Chapter 23 References/Further Reading

- [test_report/3-8-2026.md](/test_report/3-8-2026.md)
- [selector-benchmark.json](/selector-benchmark.json)
- [deep-update-benchmark.json](/deep-update-benchmark.json)
- [bench-advanced.json](/bench-advanced.json)


## Navigation

- Previous: [Chapter 22: Tradeoffs, Costs, and Weaker Fits](TRADEOFFS_AND_LIMITS.md)
- Jump to: [Unit Six: The Glitch in Matrix](../../FRONT_MATTER/CONTENTS.md#unit-six-the-glitch-in-matrix)
- Next: [Chapter 24: Real Use, Real Limits, Real Confidence](REAL_USE.md)

