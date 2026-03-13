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

# If you feel Good and useful, Give it what it deserve.
- `QUICK EXPLORE`: https://github.com/Himesh-Bhattarai/STATUS_COMMIT 