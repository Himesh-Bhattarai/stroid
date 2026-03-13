# Unit Eighteen: Roadmap of Stroid

Unit opener

A roadmap is where software becomes philosophical.

Not because it becomes vague, but because it reveals character.
What a project plans next tells you what it fears, what it values, and what kind of lies it is refusing to tell.

This chapter is intentionally serious.
Roadmaps are where projects often become accidentally romantic.
Romance is fine for poetry.
It is less reliable for release planning.

# Chapter 77: Roadmap of Stroid

Chapter opener

The dangerous thing about a roadmap is not ambition.
It is self-hypnosis.
Once a team writes down a future, the team begins to feel that the future already exists.
Good roadmap writing must resist that emotional fraud.

## Learning Objectives

- Understand what is already stable versus what is still moving.
- See the current development direction without confusing direction for delivery.
- Distinguish roadmap thinking from changelog thinking.
- Understand why migration deserves separate treatment instead of being rushed into a promise chapter.

## Chapter Outline

- 77.1 What Exists Now
- 77.2 What the Near Future Is Trying to Finish
- 77.3 What 1.0 Actually Means
- 77.4 Why Migration Will Be Handled Later

## 77.1 What Exists Now

The current reality is not nothing.
Stroid already has a real body:

- named stores
- object and path writes
- reset and delete operations
- persistence with recovery hooks
- sync with payload limits and catch-up behavior
- async orchestration with caching and retry controls
- React hooks
- testing helpers
- devtools and runtime tooling

That matters because a roadmap should begin with gratitude for the present instead of contempt for it.

Software teams often insult the current version in order to flatter the next one.
That habit is spiritually cheap and technically confusing.

## 77.2 What the Near Future Is Trying to Finish

The near-term direction, taken seriously, looks like this:

1. keep hardening correctness before decorating new surfaces
2. continue clarifying the split package story and explicit subpaths
3. tighten docs until the documented contract matches the runtime without fantasy
4. reduce surprise around warnings, boundaries, and lifecycle behavior
5. approach `1.0` as a trust event, not a version-number costume

Table 77.1: Current Roadmap Posture

| Area | Current posture |
|---|---|
| core safety | keep tightening behavior and reducing ambiguous contracts |
| package shape | continue making subpaths explicit and legible |
| docs | align docs with real code, not intended mythology |
| testing | keep expanding hardening coverage before more promises |
| release confidence | treat `1.0` as an earned state, not a motivational poster |

### Example 77.1: The Difference Between a Healthy Roadmap and a Delusional One

Healthy roadmap:

- "we are still hardening"
- "we know what is shipped"
- "we know what is still unstable"

Delusional roadmap:

- "AI-powered cosmic state harmony by Tuesday"

Only one of those deserves version control.

## 77.3 What 1.0 Actually Means

`1.0` should not mean:

- every idea is finished
- every edge case is extinct
- every user is emotionally satisfied

`1.0` should mean:

- the core contract is trusted
- the package boundaries are honest
- documentation and runtime agree
- breakage is no longer casual
- future change becomes more additive than chaotic

That is a psychological threshold as much as a semantic version threshold.

Before `1.0`, the project is still proving its memory.
After `1.0`, the project is promising the user that memory will matter.

That is not just a release.
That is a moral upgrade in how the library treats its readers.

## 77.4 Why Migration Will Be Handled Later

Migration should not be improvised inside a roadmap chapter.

Roadmap asks:

- where are we trying to go?

Changelog asks:

- what actually changed?

Migration asks:

- what pain will a real user feel while crossing the bridge?

Those are different questions.

The current changelog is useful because it preserves factual movement.
The older roadmap material is useful because it preserves intention.
But migration deserves its own focused work later, with calmer comparison, clearer before/after examples, and less hand-waving.

In other words:

- roadmap is desire under discipline
- changelog is memory under evidence
- migration is empathy under pressure

If those are mixed carelessly, the user gets motivational noise instead of operational help.

### Case Study 77.1: Why Teams Get Roadmaps Wrong

Teams often use a roadmap as emotional anesthesia.
It feels good to talk about tomorrow because tomorrow has not filed bugs yet.

But a good roadmap should slightly unsettle the team.
It should ask:

- which promises are safe to make?
- which promises are still vanity?
- which unfinished parts are structural, not cosmetic?

If a roadmap does not create that discomfort, it is probably marketing wearing a fake engineer beard.

## Chapter 77 Summary

- The roadmap should begin with what already exists, not with contempt for the present.
- Near-term work should prioritize correctness, explicit package shape, documentation alignment, and testing depth.
- `1.0` is a trust threshold, not a fireworks display.
- Migration deserves its own later treatment because roadmap, changelog, and migration solve different reader problems.

## Chapter 77 Review Questions

1. Why is confusing roadmap with delivery psychologically dangerous?
2. What makes `1.0` a trust event instead of a vanity milestone?
3. Why should migration stay separate from roadmap prose?

## Chapter 77 Exercises/Activities

1. Write a one-paragraph definition of what `1.0` should mean for this project without using hype language.
2. List three promises the roadmap can safely make now and three it should avoid.
3. Explain the difference between roadmap, changelog, and migration using one sentence for each.

## Navigation

- Previous: [Chapter 76: Real Use of Bug as Helper](../BUG_AS_HELPER/REAL_USE.md)
- Jump to: [Unit Eighteen: Roadmap of Stroid](../../FRONT_MATTER/CONTENTS.md#unit-eighteen-roadmap-of-stroid)
- Next: [Appendices](../../BACK_MATTER/APPENDICES.md)
