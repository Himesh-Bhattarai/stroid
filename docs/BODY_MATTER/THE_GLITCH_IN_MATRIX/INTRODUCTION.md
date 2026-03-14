# Unit Six: The Glitch in Matrix

Unit opener

Every runtime has a place where the fantasy breaks. Not because the library failed, but because reality arrived. Limits appear. Tradeoffs appear. Performance stops being an idea and becomes a bill.

This unit exists because mature documentation should not hide that moment. Stroid has strengths, but it also has costs, weaker fits, and boundaries that matter. A limitation is not automatically a weakness. Sometimes it is the shape of the tool protecting itself from becoming dishonest.

## Unit Objectives

- Understand where Stroid is intentionally strong and where it is intentionally narrower.
- Learn the practical tradeoffs behind named stores, split features, and the React layer.
- Read performance numbers as design consequences, not just benchmark trophies.
- Use limitations as decision-making tools instead of treating them as embarrassment.

# Chapter 21: Limitations as Design Boundaries

Chapter opener

Developers often treat limitations as defects because software culture trains us to equate more surface area with more power. In reality, a boundary can be the thing that keeps a tool usable.

## Learning Objectives

- Distinguish between a missing feature and an intentional boundary.
- Understand which Stroid constraints are structural, not accidental.
- Learn why some tradeoffs protect clarity.
- Reframe limitation as selection pressure instead of weakness.

## Chapter Outline

- 21.1 What Stroid Refuses to Pretend
- 21.2 Real Boundaries in the Current Runtime
- 21.3 Why a Limit Can Become a Weapon

## 21.1 What Stroid Refuses to Pretend

Stroid does not try to be every state model at once.

It does not claim:

- provider-free state should solve every UI architecture cleanly
- selector-heavy React usage is its strongest zone
- built-in sync should be assumed harmless in every environment
- one import path should contain everything without tradeoff

That matters because technical trust is usually lost when a project smooths over its own edges.

### Example 21.1: Honest Package Shape

```ts
import { createStore } from "stroid";
import "stroid/persist";
import "stroid/sync";
```

This is slightly more explicit than a one-import fantasy.
That explicitness is a cost.
It is also part of the reason the package stays legible.

## 21.2 Real Boundaries in the Current Runtime

Stroid currently has real boundaries that should be documented plainly.

Table 21.1: Current Boundaries That Matter

| Area | Honest Boundary |
|---|---|
| lean core | under 10 KB, but not ultra-minimal |
| React layer | useful, but not the strongest fit for extremely selector-heavy apps |
| sync | built-in and real, but still a domain that needs deliberate conflict design |
| temp scope | lighter defaults, not magical auto-destruction |
| async | ergonomic, but still explicit about cache and retry behavior |

These are not defects in the same category.
Some are package-shape consequences.
Some are runtime discipline choices.
Some are simply the cost of trying to keep one coherent mental model.

## 21.3 Why a Limit Can Become a Weapon

A weak boundary makes a tool feel easier at first and more expensive later.

A strong boundary does the opposite:

- it asks more honesty upfront
- it reduces confusion later
- it makes architecture visible earlier

### Figure 21.1: Boundary as Pressure, Not Punishment

```text
less magic -> more explicit choice -> clearer mental model -> fewer hidden surprises
```

### Case Study 21.1: Why Smaller Promise Can Create Larger Trust

If a library says, "we are best at everything," the user eventually finds the lie themselves.

If a library says, "we are strong here, weaker here, and deliberate here," the user can choose intelligently.

That changes the psychological contract.
The reader stops expecting perfection and starts expecting coherence.

## Chapter 21 Summary

- Stroid has real limits, and documenting them directly improves trust.
- Some boundaries are intentional design choices, not accidental omissions.
- Explicit package shape and narrower claims can become strengths.
- A limit becomes useful when it helps the user choose better architecture.

## Chapter 21 Review Questions

1. Why is "not pretending" a technical advantage in documentation?
2. Which current Stroid boundaries are design decisions rather than missing implementation?
3. How can a boundary become a weapon instead of a weakness?

## Chapter 21 Exercises/Activities

1. List three things your current project actually needs from a state library and three things it does not.
2. Explain why an explicit split import can improve architecture discipline.
3. Rewrite one vague library promise into an honest engineering statement.

## Chapter 21 References/Further Reading

- [Architecture Overview](../../ARCHITECTURE/ARCHITECTURE.md)
- [Performance and Reality](PERFORMANCE_AND_REALITY.md)
- [Optional Complexity and Comparison](../PHILOSOPHY_OF_STROID/OPTIONAL_COMPLEXITY_AND_COMPARISON.md)


## Navigation

- Previous: [Chapter 20: Real Use of React Stroid](../REACT_OF_STROID/REAL_USE.md)
- Jump to: [Unit Six: The Glitch in Matrix](../../FRONT_MATTER/CONTENTS.md#unit-six-the-glitch-in-matrix)
- Next: [Chapter 22: Tradeoffs, Costs, and Weaker Fits](TRADEOFFS_AND_LIMITS.md)

