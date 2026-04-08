# GitHub Actions Guide

**Purpose**
This document explains every workflow in `.github/workflows`, what each one does, when to use it, how it triggers, and what to check when it fails.

**Audience**
- Maintainers handling releases, security, and governance checks.
- Contributors opening PRs and reading CI/stress/security signals.
- Anyone running manual workflows (`workflow_dispatch`).

---

## Quick Workflow Map

| Workflow File | Workflow Name | Main Purpose | Trigger |
|---|---|---|---|
| `.github/workflows/ci.yml` | `CI` | Fast quality gate (tests, types, layered type boundaries, build) | push/PR to `main` or `dev`, manual |
| `.github/workflows/test.yml` | `Stress Test Pipeline` | Heavy validation: stress, fuzz, benchmarks, coverage PR comment | push/PR (`main`,`dev`) |
| `.github/workflows/publish.yml` | `Publish` | Verify package and publish to npm (manual on `main`) | PR to `main`, manual |
| `.github/workflows/release-please.yml` | `release-please` | Automated release PR and tag/release management | push to `main`, manual |
| `.github/workflows/codeql.yml` | `CodeQL Advanced` | Security/code scanning (Actions + TS/JS) | push/PR (`main`,`dev`), weekly cron |
| `.github/workflows/scorecard.yml` | `OpenSSF Scorecard` | Supply-chain security score scan + SARIF upload | push `main`, branch protection changes, weekly cron, manual |
| `.github/workflows/dependency-review.yml` | `Dependency Review` | Blocks risky dependency changes in PRs | PR to `main` or `dev` |
| `.github/workflows/dependabot-status-guard.yml` | `Dependabot STATUS Guard` | Enforces STATUS-style title/commit format for Dependabot PRs | PR open/edit/sync/reopen |
| `.github/workflows/status-commit.yml` | `status-commit` | Enforces commit message format on pushes | push (except `release-please--**`) |
| `.github/workflows/discussion-bot.yml` | `AI Discussion Bot (Gemini)` | Auto-replies in Discussions when owner is mentioned | discussion created/comment created |

---

## Which Workflow Should I Use?

1. I opened a PR and want standard checks:
- `CI` and `Stress Test Pipeline` are the core signals.

2. I changed dependencies:
- `Dependency Review` is the key policy check.

3. I need release/version automation:
- `release-please` prepares release PRs/tags from conventional commit history.

4. I am ready to publish to npm:
- `Publish` (manual dispatch on `main` only) runs verify + publish.

5. I need security posture visibility:
- `CodeQL Advanced` + `OpenSSF Scorecard`.

6. I am handling bot/governance formatting:
- `status-commit` and `Dependabot STATUS Guard`.

7. I want help in Discussions:
- Mention `@<repo-owner>` in a Discussion body/comment to trigger `AI Discussion Bot (Gemini)`.

---

## Workflow-by-Workflow Details

## 1) `ci.yml` (`CI`)

**What it does**
- Runs a fast baseline quality gate:
  - `npm ci`
  - `npm test`
  - `npm run test:types`
  - `npm run typecheck`
  - `npm run typecheck:layers`
  - `npm run build`

**Trigger**
- Push to `main` or `dev`
- Pull request targeting `main` or `dev`
- Manual dispatch

**When to use**
- Always relevant for normal code changes.
- Use as the "quick confidence" gate before deeper stress/security jobs.

**Outputs**
- No artifact upload in this workflow.
- Pass/fail is the signal.

**Common failures**
- Type drift (`test:types`, `typecheck`, `typecheck:layers`)
- Build output breaks (`npm run build`)
- Runtime test regressions (`npm test`)

---

## 2) `test.yml` (`Stress Test Pipeline`)

**What it does**
- Multi-job heavyweight pipeline:
  - `unit-integration`: Node matrix (`18`, `20`) + `npm test` + `npm run test:stress`
  - `fuzz`: fixed-seed fuzz run (`STROID_FUZZ_SEED=20260403`)
  - `benchmarks`: full CI gate for types + benchmark regressions:
    - `npm run typecheck`
    - `npm run typecheck:layers`
    - `npm run test:types`
    - `npm run bench:stress:ci`
    - `npm run benchmark:ssr-als-audit` (fixed seed in workflow env, artifacted)
    - `npm run benchmark:ssr-gaps` (fixed seed/sizes in workflow env, artifacted)
  - `coverage` (PR only): stress coverage + PR comment update via marker `<!-- stroid-stress-coverage -->`

**Trigger**
- Pull request
- Push to `main` or `dev`

**Important behavior**
- `fuzz` and `benchmarks` use `if: always()` with `needs: unit-integration`, so they still run and report even if core tests fail.
- `coverage` runs only for PR events.
- The `benchmarks` job is the push-time source-of-truth gate for benchmark and advanced type checks.

**Artifacts**
- `benchmark-results` from `scripts/benchmark-results/`
- `benchmark-results/ssr/ssr-als-audit-ci.json` and `benchmark-results/ssr/ssr-gap-ci.json` are included in that artifact when the benchmark job runs
- `coverage-summary` from `coverage/stress/coverage-summary.json` (if generated)

**When to use**
- Authoritative performance/stress confidence before merge.
- Required when touching async/sync/persist/computed/SSR critical paths.

**Common failures**
- Type/declaration regressions in `typecheck`, `typecheck:layers`, or `test:types`.
- Benchmark regression gate (`bench:stress:ci`) dropping below threshold.
- SSR isolation gate failures (ALS ladder or SSR gap benchmark) reporting non-zero isolation failures.
- Fuzz edge-case breakage from nondeterministic behavior.
- Coverage comment missing due to upstream test failure.

---

## 3) `publish.yml` (`Publish`)

**What it does**
- `verify` job (always for this workflow): installs, tests, types, layered type boundaries, build.
- `publish` job:
  - Runs only when:
    - Event is `workflow_dispatch`
    - Ref is `refs/heads/main`
  - Reads package version from `package.json`.
  - Checks npm registry for existing version.
  - Publishes only if version does not already exist.

**Trigger**
- PR targeting `main` (verify only)
- Manual dispatch (verify + conditional publish)

**When to use**
- For real npm releases from `main`.
- PR-to-main serves as "release readiness verification".

**Permissions & auth**
- Uses `id-token: write` for trusted npm publish flow.
- Uses npm registry setup through `actions/setup-node`.

**Common failures**
- Version already published (publish step skipped by design).
- Missing npm publish permissions or registry auth issues.
- Verify gate failing before publish starts.

---

## 4) `release-please.yml` (`release-please`)

**What it does**
- Runs `googleapis/release-please-action`.
- Uses:
  - `release-please-config.json`
  - `.release-please-manifest.json`
- Automates release PR/tag/release process based on commit history.

**Trigger**
- Push to `main`
- Manual dispatch

**When to use**
- Continuous release management from merged commits on `main`.
- Manual trigger if you need to re-run release planning.

**Token behavior**
- Uses `secrets.RELEASE_PLEASE_TOKEN` if present, otherwise `github.token`.
- PAT is useful when you need downstream workflows to trigger from release PR/tag actions.

**Common failures**
- Commit history format not compatible with expected release parsing.
- Permission/token issues for writing PRs/tags/releases.

---

## 5) `codeql.yml` (`CodeQL Advanced`)

**What it does**
- Security/code scanning for:
  - `actions`
  - `javascript-typescript`
- Uses project config file: `./.github/codeql/codeql-config.yml`.
- Uploads results to GitHub code scanning.

**Trigger**
- Push to `dev` or `main`
- PR to `dev` or `main`
- Scheduled weekly scan (`cron: "28 17 * * 5"`)

**When to use**
- Continuous security static analysis.
- Weekly baseline drift detection even without active PRs.

**Common failures**
- Query/config incompatibility after major dependency/platform changes.
- Code scanning permission issues (rare with current permissions block).

---

## 6) `scorecard.yml` (`OpenSSF Scorecard`)

**What it does**
- Runs OpenSSF Scorecard analysis.
- Publishes SARIF to code scanning.
- Uploads artifact `scorecard-results` (retention: 5 days).

**Trigger**
- Push to `main`
- `branch_protection_rule` changes
- Weekly schedule (`cron: "12 18 * * 5"`)
- Manual dispatch

**When to use**
- Track repository hardening posture (supply-chain/security best practices).
- Verify changes to branch protection/security governance.

**Common failures**
- Missing permissions or temporary GitHub API/service hiccups.
- Policy/config mismatches affecting score checks.

---

## 7) `dependency-review.yml` (`Dependency Review`)

**What it does**
- Runs `actions/dependency-review-action`.
- Fails PR if dependency risk severity is `moderate` or higher.

**Trigger**
- PR targeting `main` or `dev`

**When to use**
- Every dependency bump/change PR.
- Especially important for transitive dependency surface changes.

**Common failures**
- New vulnerable package versions entering lockfile.
- Unexpected transitive upgrades during package updates.

---

## 8) `dependabot-status-guard.yml` (`Dependabot STATUS Guard`)

**What it does**
- For Dependabot-authored PRs only (`if: github.actor == 'dependabot[bot]'`):
  - Validates PR title format.
  - Validates every commit subject format.
- Enforces STATUS style:
  - `status(201): message`
  - `status(infinity)(deps): message`
  - Case-insensitive.

**Trigger**
- PR opened/edited/synchronized/reopened

**When to use**
- Governance consistency for automated dependency updates.

**Common failures**
- Dependabot commit/title not matching STATUS pattern.
- Manual edits to bot PR title that break format.

---

## 9) `status-commit.yml` (`status-commit`)

**What it does**
- Enforces commit message format on push.
- Accepts:
  - `STATUS(###): message`
  - `status(infinity): message`
  - Optional `(deps|deps-dev)` marker.
- Skips merge/revert/fixup/squash commits.
- Excludes branches matching `release-please--**`.

**Trigger**
- Push (except release-please generated branch pattern)

**When to use**
- Always-on governance validation for commit hygiene.

**Common failures**
- Local commit subject not in required STATUS format.

**Fast fix**
- Amend message to matching format, then push again.

---

## 10) `discussion-bot.yml` (`AI Discussion Bot (Gemini)`)

**What it does**
- Watches Discussion creation/comments.
- Detects mention of repo owner username in the text.
- Collects trimmed codebase context from repository files.
- Calls Gemini API to generate response.
- Posts response as a Discussion comment via GraphQL mutation.

**Trigger**
- `discussion` created
- `discussion_comment` created

**Respond condition**
- Only responds when body contains `@<repo-owner>` mention.

**Required secret**
- `GEMINI_API_KEY`

**When to use**
- Community support in Discussions where quick first response helps.

**Common failures**
- Missing/invalid `GEMINI_API_KEY`
- Empty model response fallback message
- Mention not detected (no response expected)

---

## CI Gate Coverage Snapshot

This section documents which scripts are explicitly used by push/PR gates so workflow steps and npm scripts stay aligned.

**Primary push/PR gates**
- `CI` (`ci.yml`):
  - `npm test`
  - `npm run test:types`
  - `npm run typecheck`
  - `npm run typecheck:layers`
  - `npm run build`
- `Stress Test Pipeline` (`test.yml`):
  - `npm test`
  - `npm run test:stress`
  - `npm run test:stress:fuzz`
  - `npm run typecheck`
  - `npm run typecheck:layers`
  - `npm run test:types`
  - `npm run bench:stress:ci`
  - `npm run benchmark:ssr-als-audit`
  - `npm run benchmark:ssr-gaps`
  - `npm run test:stress:coverage` (PR only)

**Scripts intentionally outside default push gate**
- Manual/local or dedicated release workflows:
  - `benchmark:all`, `benchmark:guarantees`, `benchmark:compare`, `benchmark:trust-matrix`
  - `benchmark:*` deep scenario scripts used for profiling/certification runs
  - `bench:stress:update-baseline`
  - `test:performance`, `test:full`, `test:all`
- These are intentionally omitted from every push to keep CI duration bounded and deterministic.

---

## Operational Playbook

## PR Validation Path (recommended)
1. Open PR to `dev` or `main`.
2. Check `CI` for baseline correctness.
3. Check `Stress Test Pipeline`:
   - Unit/integration + stress
   - Type/declaration gates
   - Benchmark regression gate
   - Fuzz
4. If dependencies changed, ensure `Dependency Review` passes.
5. If security-sensitive area changed, confirm `CodeQL` has no new critical findings.

## Release Path (recommended)
1. Merge release-ready changes into `main`.
2. Let `release-please` create/update release PR/tag.
3. Confirm `Publish` verify checks on `main` context.
4. Manually run `Publish` on `main` (`workflow_dispatch`).
5. Confirm npm version check and publish result.

## Security Monitoring Path
1. Weekly scheduled `CodeQL` and `Scorecard` runs provide background monitoring.
2. Review SARIF/code scanning findings regularly.
3. Treat new high/critical findings as merge blockers until triaged.

---

## Permissions and Secrets Reference

| Workflow | Notable Permissions | Secrets |
|---|---|---|
| `CI` | `contents: read` | none |
| `Stress Test Pipeline` | `contents: read`, PR comment write in coverage job | none |
| `Publish` | `id-token: write` for publish job | npm publish trust chain via repo/package setup |
| `release-please` | contents/issues/pull-requests write | `RELEASE_PLEASE_TOKEN` (optional but recommended) |
| `CodeQL Advanced` | `security-events: write` and read scopes | none |
| `OpenSSF Scorecard` | `security-events: write`, `id-token: write` | none |
| `Dependency Review` | `contents: read` | none |
| `Dependabot STATUS Guard` | `contents: read`, `pull-requests: read` | none |
| `status-commit` | `contents: read` | none |
| `AI Discussion Bot (Gemini)` | `discussions: write` | `GEMINI_API_KEY` |

---

## Manual Run Notes (`workflow_dispatch`)

Manually runnable workflows:
- `CI`
- `Publish`
- `release-please`
- `OpenSSF Scorecard`

Use manual runs when:
- You need a recheck without new commits.
- You want controlled publish timing (`Publish` on `main` only).
- You need immediate security scan refresh (`Scorecard`).

---

## Maintenance Notes

1. Keep action SHAs pinned (already done) for supply-chain stability.
2. Revisit Node versions intentionally before major runtime/tooling upgrades.
3. Keep benchmark gate thresholds realistic and tied to CI runner baselines.
4. If workflow behavior changes, update this file in the same PR.
