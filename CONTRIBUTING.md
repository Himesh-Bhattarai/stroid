# Contributing to Stroid

Thank you for your interest in contributing. This document covers how to set up the project, run tests, and submit changes.

---

## Branch Model

- `main` — locked between releases; reflects the last published version.
- `dev` — active development branch; **all PRs and forks target `dev`**.

Do not open PRs targeting `main`.

---

## Setup

```bash
git clone https://github.com/Himesh-Bhattarai/stroid.git
cd stroid
git checkout dev
npm install
```

**Requirements:** Node `>=18`.

---

## Build

```bash
npm run build
```

This runs `tsup` and normalizes `.d.ts` output with `scripts/normalize-dts.mjs`.

---

## Tests

```bash
# Run all integration, regression, SSR, and unit tests
npm test

# Run with coverage (must pass 80% on all axes)
npm run test:coverage

# Run performance benchmarks
npm run test:performance

# Run type tests (requires a build)
npm run test:types

# Package surface checks (also run as part of test:types)
npm run check:publint
npm run check:attw

# Run everything
npm run test:full
```

Tests use Node's built-in test runner via `tsx`. No test framework install required.

---

## Type Checking

```bash
npm run typecheck           # full type check
npm run typecheck:layers    # layer-boundary checks (tsconfig.layers.json)
npm run test:dts            # DTS smoke test
```

---

## Test Isolation

Every test file should call `resetAllStoresForTest()` (from `stroid/testing`) in `beforeEach`. This ensures stores, async state, config, and internal warning caches are clean between tests.

---

## Code Style

- TypeScript strict mode.
- ESLint with `eslint-config-standard-with-typescript`.
- Layer guards are enforced via ESLint rules — do not import `store-notify` or async-cache internals from layers that are not supposed to depend on them.

```bash
npx eslint src/
```

---

## Commit Messages

Follow [STATUS.MD](./STATUS.MD) conventions. Short, descriptive imperative sentences. Reference issue numbers where applicable.

---

## Documentation

- Documentation lives in `docs/`.
- The README is intentionally concise — no deep internals.
- When you add or change an API, update `docs/api/stroid.api.md` and any affected guide under `docs/STROID_*/`.
- Mark any documentation that cannot be confirmed from source code with: `> Derived from documentation, not verified in code`.

---

## Publishing

Publishing is automated via `.github/workflows/publish.yml`. Only maintainers push release tags. The version in `package.json` is the single source of truth.

Version bumps, CHANGELOG updates, and GitHub releases are automated via Release Please (`.github/workflows/release-please.yml`).

- Maintainers should set the `RELEASE_PLEASE_TOKEN` secret (PAT) so Release Please PRs/tags can trigger CI workflows.
- The release PR title pattern is `status(204): release ${version}` so squash-merging the release PR keeps the STATUS commit convention.

---

## Issues and Discussions

- Bug reports: use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml).
- Feature requests: use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml).
- Questions and discussion: use GitHub Discussions.

---

## Code of Conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
