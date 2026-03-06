# Contributing to Stroid

Thanks for helping make Stroid better. Before opening a PR, please skim this page.

## How we work
- **Branching:** create a feature/fix branch off `main`. Keep PRs small and focused.
- **Status commits:** use the STATUS format, e.g. `status(601): fix schema validation`. Pick a code that reflects quality/risk; prefer 601 for bug fixes, 201/204 for stable improvements, 203 for docs.
- **Testing:** run `npm test --silent` and `npm run build` before pushing. Add/adjust tests for every bug fix or new behavior.
- **Style:** keep changes minimal, dependency-free, and under the bundle-size goal. Favor clarity over cleverness; add comments only when intent isn’t obvious.
- **Docs:** update `README.md`/`CHANGELOG.md` when user-visible behavior changes.

## Pull requests
- Describe the problem, the fix, and any trade-offs.
- List tests executed.
- Note any user-facing changes or migration steps.
- Keep new APIs typed and documented.

## Bug reports
- Include repro steps, expected vs actual, environment, and minimal code samples.
- If applicable, note whether schema, validator, or persistence was involved.

## Release expectations
- Until v1 we prioritize stability, bug/edge-case fixes, and keeping the ESM bundle under 8 KB gzip while remaining dependency-free.

Thanks for contributing!
