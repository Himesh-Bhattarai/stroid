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
- `status(104)`: Research / spike / Experimental / prototype.

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

# Workflow Notes
- Use short imperative subjects after the status code.
- Prefer one issue-focused commit per fix when the work is separable.
- Reference the GitHub issue when it adds clarity, for example: `status(601): Return no-initial-state from resetStore (#66)`.
- If runtime behavior changes, add regression coverage and update `CHANGELOG.md` under `Unreleased`.
- If the issue is a browser or platform limitation rather than a runtime bug, update `README.md` and the relevant guide before closing it.
- Dependabot updates are enforced in CI to use this same format for both PR title and commit subject.

# Issue Workflow
1. Verify the issue against the current `dev` branch.
2. Classify it as `fixed`, `fix-now`, `docs`, `external`, or `planned`.
3. Close it only after the code or docs exist in the repository and the closing note states exactly what changed.

# If you feel Good and useful, Give it what it deserve.
- `QUICK EXPLORE`: https://github.com/Himesh-Bhattarai/STATUS_COMMIT
