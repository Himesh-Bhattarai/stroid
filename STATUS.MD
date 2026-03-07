# STATUS Commit Cheat Sheet
Use these STATUS codes in commit messages: `status(###): short summary`.

## Stable / Working
- `status(201)`: Working as expected (fix/feature).
- `status(202)`: Verified with real usage.
- `status(203)`: Documentation-only update (README, docs, comments).
- `status(204)`: Production-ready / release quality.

## In Progress
- `status(101)`: Draft or scaffolding.
- `status(102)`: Partial implementation.
- `status(103)`: Blocked / waiting on dependency.
- `status(104)`: Research / spike.

## Change / Improvement
- `status(300)`: Refactor (no behavior change).
- `status(301)`: New capability added.
- `status(302)`: Enhancement to existing behavior.

## Issues / Risks
- `status(401)`: Incorrect flow/usage.
- `status(403)`: Scope/responsibility issue.
- `status(408)`: Performance concern identified.
- `status(409)`: Works but risky / fragile (needs review/tests).

## Broken / Recovery
- `status(500)`: Broken / failing.
- `status(502)`: Interface/contract mismatch.
- `status(503)`: Security / auth failure.
- `status(601)`: Bug/failure fixed.
- `status(603)`: Structure/state corrected.

## Special
- `status(infinity)`: Gold master / fully trusted.
- `status(404)`: Human chaos/debugging note (does not imply code quality).

## Description Guideline
- Pair the code with a message that states the quality/intent (e.g., for fixes use `status(601)` with a summary like “fix async cleanup to avoid leak”).
- Bug fixes can use `status(601)` (preferred) or `status(201)`; the message must still reflect the quality outcome (stability, safety, perf, etc.).

## Patch0 P0 Fix Log
- `status(601)` `getstore-live-reference-leak`
  Description: `getStore()` returned shallow or live references, so nested mutations could bypass validation, history, persistence, and subscriber notifications.
  Resolution: whole-store and path reads now return deep-cloned snapshots, with tests locking that behavior.
- `status(601)` `react-hooks-live-snapshot-leak`
  Description: React-facing snapshots reused live store objects, which broke external-store safety and allowed mutation through hook snapshots.
  Resolution: `_getSnapshot()` now serves stable deep-cloned snapshots from an internal cache so React consumers only receive immutable external views.
- `status(601)` `history-production-reference-mutation`
  Description: production history entries and returned history arrays leaked mutable references to stored state.
  Resolution: history snapshots are deep-cloned on write and deep-cloned again on read, preventing mutation of state or audit history through history APIs.
- `status(601)` `validator-throw-crashes-core-ops`
  Description: validator exceptions escaped `createStore`, `setStore`, and `mergeStore`, crashing callers instead of flowing through store error handling.
  Resolution: validator execution now runs through guarded handling that reports failures via `onError` and warnings without aborting core store APIs.
- `status(601)` `lifecycle-hooks-throw-partial-commit`
  Description: lifecycle hooks could throw after state mutation started, leaving state, history, cleanup, and notifications partially applied.
  Resolution: `onCreate`, `onSet`, `onReset`, and `onDelete` now run through guarded hook execution so hook failures are reported without corrupting the store pipeline.
- `status(601)` `delete-store-subscriber-throw-aborts-cleanup`
  Description: `deleteStore()` notified subscribers without guarding exceptions, so one bad subscriber could abort teardown and leave the store half-deleted.
  Resolution: delete-time subscriber notifications now isolate throws and always continue cleanup, with regression coverage locking full teardown.
- `status(601)` `delete-store-persist-timer-resurrection`
  Description: queued persist timers survived store deletion, so a `setTimeout(0)` write could run after `deleteStore()` and recreate stale storage.
  Resolution: delete now cancels pending persist timers, and persist callbacks verify the store and config are still current before writing.
- `status(601)` `reset-store-does-not-persist`
  Description: `resetStore()` restored in-memory state but never rewrote persisted storage, so reloads could bring back stale pre-reset data.
  Resolution: reset now schedules persistence for persisted stores, and coverage verifies the saved envelope contains the reset state.
