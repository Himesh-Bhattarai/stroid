# Contributing to Stroid

Thanks for helping make Stroid better. Before opening a PR, please skim this page.

## How we work
- **Branching:** `main` is release-only and stays locked between releases. For the current development cycle, fork or clone `dev`, then create your feature/fix branch from `dev`. Keep PRs small and focused.
- **Status commits:** use the STATUS format, e.g. `status(601): fix schema validation`. Pick a code that reflects quality/risk; prefer 601 for bug fixes, 201/204 for stable improvements, and 203 for docs.
- **Testing:** run `npm test --silent` and `npm run build` before pushing. Add or adjust tests for every bug fix or new behavior.
   # Commands
   - `npm test`: Run the full test suite.
   - `npm run build`: Verify the build and bundle size.
   - `npm run lint`: Check for code style consistency.
   - `npm run type-check`: Validate TypeScript declarations.
   # Rules
   - Before making changes, run tests. If they fail, open an issue; otherwise, proceed.
   - Cover your changes with tests (or provide proof of manual verification).
   - An 85% global test coverage threshold is compulsory; PRs below this will be rejected.
- **Style:** keep changes minimal, dependency-free, and under the bundle-size goal. Favor clarity over cleverness; add comments only when intent is not obvious.
  - For large or multi-file changes, ensure all tests pass. PRs are tested in isolated environments to ensure no regressions or edge-case bugs.
- **Docs:** update `README.md` and `CHANGELOG.md` when user-visible behavior changes.
  - Mention fixes, additions, or behavior changes in the PR summary, including migration steps if applicable.
- **Release artifacts:** `dist/` is release-managed. During `dev` development, it may be absent in the repo or still reflect the last released `released` build while source and docs move ahead.

## Pull requests
- Describe the problem, the fix, and any trade-offs.
- List the tests you executed.
- Note any user-facing changes or migration steps.
- Keep new APIs typed and documented.

## Bug reports
- Include repro steps, expected vs actual behavior, environment, and minimal code samples.
- If applicable, note whether schema, validator, persistence, or sync was involved.

## Release expectations
- Until v1, we prioritize stability, bug and edge-case fixes, and keeping the ESM bundle under 8 KB gzip while remaining dependency-free.
- `main` only moves at release time. Day-to-day development continues on `v0.0.5` until the next release branch decision is announced.

# Note: The fix is never a Fix, until that fix become your power

Thanks for contributing!
