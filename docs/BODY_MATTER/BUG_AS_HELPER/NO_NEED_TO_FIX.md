# Chapter 75: No Need to Fix, Low Drama, and Edge-Case Humility

Chapter opener

Not every reported problem deserves a wrench.
Sometimes the correct engineering response is:

"Yes, that edge exists. No, we are not building a cathedral around it."

This chapter catalogs the current reports marked `No Need to Fix`.

## Learning Objectives

- Learn which current bug reports do not justify immediate work.
- Understand why some issues remain low priority or false positive.
- Avoid confusing edge awareness with release panic.
- Practice technical humility instead of theatrical urgency.

## Chapter Outline

- 75.1 Already Guarded or Already Fixed
- 75.2 Real but Low-Value Edge Cases
- 75.3 False Positives and Category Mistakes

## 75.1 Already Guarded or Already Fixed

Table 75.1: Reports That Are Already Handled Enough

| Bug | Current verdict | Why it stays unfixed |
|---|---|---|
| 5 | No Need to Fix | misspelled path writes are already blocked by path validation |
| 9 | No Need to Fix | legacy warning reset is already covered in test reset paths |
| 21 | No Need to Fix | checksum is for payload integrity, not proving migration correctness |
| 31 | No Need to Fix | cached selector behavior described in the report is already correct |
| 35 | No Need to Fix | sync snapshot request already exits quietly when resources are gone |
| 37 | No Need to Fix | aborted inflight async entries are cleared in `finally` |
| 43 | No Need to Fix | deferred persistence coalescing is behaving as designed |
| 45 | No Need to Fix | `mergeStore(...)` already runs `onSet` |
| 48 | No Need to Fix | unsubscribe during flush does not skip later subscribers in the same pass |
| 106 | No Need to Fix | subscriber added during flush does not run in that same pass |

## 75.2 Real but Low-Value Edge Cases

Table 75.2: Small Edges That Do Not Deserve a Parade

| Bug | Current verdict | Why it stays low priority |
|---|---|---|
| 3 | No Need to Fix | deep clone recursion fallback is pathological edge hardening, not release-critical |
| 4 | No Need to Fix | async metadata clears on store delete; unlimited live stores are a bigger runtime choice |
| 17 | No Need to Fix | warning-suppression set growth is tiny in practical terms |
| 18 | No Need to Fix | `target()` is type-guarded enough for its ergonomic role |
| 19 | No Need to Fix | `chain(...)` never promised to create missing parents magically |
| 20 | No Need to Fix | default migration reset behavior is consistent with configured recovery policy |
| 25 | No Need to Fix | `refetchStore(...)` intentionally reuses the latest remembered fetch definition |
| 26 | No Need to Fix | async cache pruning is bounded by current slot caps |
| 28 | No Need to Fix | checksum cost is opt-in work from persistence and sync |
| 33 | No Need to Fix | nullish hook read posture is current contract |
| 34 | No Need to Fix | devtools diff is shallow on purpose |
| 36 | No Need to Fix | possible late sync broadcast during delete timing is harmless noise |
| 38 | No Need to Fix | abort resolving to `null` is current async contract |
| 39 | No Need to Fix | expired cache is treated as expired, not sentimental stale treasure |
| 40 | No Need to Fix | bounded caches are allowed to evict valid entries under slot pressure |
| 41 | No Need to Fix | inflight cap is deliberate backpressure |
| 47 | No Need to Fix | nested synchronous batch depth accounting is already coherent |
| 52 / 53 / 55 | No Need to Fix | these are duplicates of earlier issues, not new bug classes |
| 109 | No Need to Fix | dynamic `useStore(...)` tearing claim is speculative, not evidenced strongly enough |

## 75.3 False Positives and Category Mistakes

Table 75.3: Reports That Mostly Collapse Under Inspection

| Bug or report | Current verdict | Why it is not promoted |
|---|---|---|
| 12 | No Need to Fix | hostile schema function injection is already a larger host-app compromise |
| 14 | No Need to Fix | `fetchStore(...)` resolves `null` on failure; the claimed reject inconsistency is wrong |
| 24 | No Need to Fix | merge action routing is already coherent in current design |
| 49 / 54 snapshot claim | No Need to Fix | stale snapshot argument depends on in-place mutation outside normal public write paths |
| 105 | No Need to Fix | in-place migration mutations still persist even when a migration returns `undefined` |
| Sync channel name collisions between store names | No Need to Fix | message name gating prevents cross-store corruption |
| Devtools unlimited-history growth claim | No Need to Fix | history is capped by `historyLimit` and can be disabled |
| Cyclic state silently reaching persistence or sync | No Need to Fix | `sanitize(...)` blocks circular state before commit |
| Warning-suppression sets as a major test-isolation threat | No Need to Fix | remaining sets are tiny and mostly cleanup polish |

### Example 75.1: Humility as an Engineering Skill

It is emotionally satisfying to call every edge a crisis.
It is also expensive.

The calmer question is:

"If we fix this, what meaningful class of user pain disappears?"

If the answer is:

"almost none, but my pride will feel moisturized,"

then the bug probably belongs in this chapter.

## Chapter 75 Summary

- Some reports are already handled, already bounded, or already duplicates.
- Some edge cases are real but too low-value to justify urgent work.
- Some claims collapse because their premise is wrong.
- Good engineering includes the discipline to leave minor weirdness alone.

## Chapter 75 Review Questions

1. What is the difference between an edge case and a release blocker?
2. Why is "technically true" not enough by itself to justify a fix?
3. How do false positives distort maintenance work?

## Chapter 75 Exercises/Activities

1. Pick five `No Need to Fix` bugs and explain what would make them worth escalating later.
2. Write a one-paragraph argument against panic-driven bug triage.
3. Explain why bounded cache eviction is not automatically a defect.

## Chapter 75 References/Further Reading

- [BUG_REPORT.md](/c:/Users/Himesh/Desktop/SM_STROID/stroid/BUG_REPORT.md)
- [store.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/store.ts)
- [async.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/async.ts)
- [features/persist.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/persist.ts)
- [features/devtools.ts](/c:/Users/Himesh/Desktop/SM_STROID/stroid/src/features/devtools.ts)

## Navigation

- Previous: [Chapter 74: Intentional Bugs, Guardrails, and Productive Friction](INTENTIONAL_BUGS.md)
- Jump to: [Unit Seventeen: Bug as Helper](../../FRONT_MATTER/CONTENTS.md#unit-seventeen-bug-as-helper)
- Next: [Chapter 76: Real Use of Bug as Helper](REAL_USE.md)
