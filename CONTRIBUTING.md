# Contributing to Stroid

Thanks for helping make Stroid better. Before opening a PR, please skim this page.

## How we work
- **Branching:** `main` is release-only and stays locked between releases. For the current development cycle, fork or clone `v0.0.5`, then create your feature/fix branch from `v0.0.5`. Keep PRs small and focused.
- **Status commits:** use the STATUS format, e.g. `status(601): fix schema validation`. Pick a code that reflects quality/risk; prefer 601 for bug fixes, 201/204 for stable improvements, and 203 for docs.
- **Testing:** run `npm test --silent` and `npm run build` before pushing. Add or adjust tests for every bug fix or new behavior.
- **Style:** keep changes minimal, dependency-free, and under the bundle-size goal. Favor clarity over cleverness; add comments only when intent is not obvious.
- **Docs:** update `README.md` and `CHANGELOG.md` when user-visible behavior changes.

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

Thanks for contributing!
