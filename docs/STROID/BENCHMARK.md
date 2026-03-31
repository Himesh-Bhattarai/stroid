# Benchmark Report

## Summary

This report is based on rerunning the benchmark scripts in this repository on `2026-03-30`.

Headline results:

- the guarantee suite passed end-to-end
- Stroid sustained `250,000` single-store subscribers at `2.459ms` median (`noop`) and `2.904ms` median (`compute`)
- Stroid sustained `250,000` concurrent subscribers across multi-store fanout at `1.593ms` to `1.806ms` median wave latency
- in the cross-library subscriber comparison, Stroid was slower on raw notify latency than Redux and Zustand in this script, but memory stayed close to Zustand and below Redux
- in a dedicated `stroid/core` small-range run (`100` to `10,000` subscribers), median single-write latency stayed under `1ms` up to `10,000` subscribers (`0.770ms` noop, `0.868ms` compute)

Important comparison note:

- Stroid numbers in the cross-library script are measured end-to-end until its async notification flush reaches the final marker subscriber
- Redux and Zustand numbers are measured synchronously inside `dispatch()` / `setState()`
- treat that table as a practical comparison, not a perfectly apples-to-apples scheduler comparison

## Environment

| Field | Value |
| --- | --- |
| Date | `2026-03-30` |
| Node | `v25.8.2` |
| Platform | `darwin` |
| Arch | `arm64` |

## Bundle-Closure Probe

Local esbuild bundle-closure probes were rerun against built `dist/` entrypoints on `2026-03-31` after the latest tree-shaking cleanup work.
These numbers are raw bundled output bytes for each isolated import probe, not gzip size claims.

| Import probe | Before | After | Read |
| --- | --- | --- | --- |
| `createStore` from `stroid` root | `69.9 KB` | `69.9 KB` | root compatibility surface is still materially heavier than the lean subpaths |
| `createStore` from `stroid/core` | `42.2 KB` | `42.2 KB` | minimal CRUD entry remains the leaner default |
| `listStores` from `stroid/runtime-tools` | `27.9 KB` | `27.9 KB` | internal regrouping alone does not help while the published build still shares runtime chunks |
| `installPersist` from `stroid/persist` | `42.5 KB` | `21.6 KB` | direct feature entry now avoids sibling installer retention |
| `installSync` from `stroid/sync` | `42.4 KB` | `42.4 KB` | no material change yet |
| `reactQueryKey` from `stroid/query` | `n/a` | `0.1 KB` | new dedicated key-only entrypoint |
| `queryIntegrations.reactQueryKey` from `stroid` root | `69.9 KB` | `70.0 KB` | compatibility namespace is still expensive |

Read note:

- prefer `stroid/core`, `stroid/query`, and direct feature entrypoints when you care about import closure size
- the root `stroid` namespace still needs harder wins around import-time retention and side-effect boundaries
- the published multi-entry build still needs shared chunks to preserve one runtime across `stroid`, `stroid/psr`, and sibling entrypoints; disabling splitting broke the built-package contract
- these probes used a local esbuild bundle with `bundle: true`, `format: "esm"`, `minify: true`, and `treeShaking: true`

## Cross-Library Comparison

### Single Write Average

All values are `singleAvgMs` from `scripts/compare-state-libraries.ts`.

| Subscribers | Stroid | Redux plain | Redux + Immer | Zustand |
| --- | --- | --- | --- | --- |
| `5,000` | `0.142ms` | `0.056ms` | `0.065ms` | `0.064ms` |
| `10,000` | `0.175ms` | `0.093ms` | `0.093ms` | `0.102ms` |
| `25,000` | `0.263ms` | `0.141ms` | `0.192ms` | `0.211ms` |
| `50,000` | `0.526ms` | `0.269ms` | `0.281ms` | `0.290ms` |
| `75,000` | `0.759ms` | `0.417ms` | `0.427ms` | `0.432ms` |

### 100 Write Batch Total

All values are `batch100Ms` from `scripts/compare-state-libraries.ts`.

| Subscribers | Stroid | Redux plain | Redux + Immer | Zustand |
| --- | --- | --- | --- | --- |
| `5,000` | `7.017ms` | `3.078ms` | `3.151ms` | `3.149ms` |
| `10,000` | `10.497ms` | `5.805ms` | `6.369ms` | `5.870ms` |
| `25,000` | `18.405ms` | `14.147ms` | `14.199ms` | `14.550ms` |
| `50,000` | `30.489ms` | `27.787ms` | `28.345ms` | `28.829ms` |
| `75,000` | `44.467ms` | `41.270ms` | `41.601ms` | `42.739ms` |

### Memory At 75K Subscribers

| Library | Heap Delta MB | Bytes / Subscriber |
| --- | --- | --- |
| Stroid | `6.514` | `91.074` |
| Redux plain | `7.532` | `105.307` |
| Redux + Immer | `7.523` | `105.184` |
| Zustand | `6.519` | `91.140` |

### Cross-Library Read

- fastest raw single-write result in this script: `redux-plain` at every measured subscriber count
- smallest memory footprint in this script: Stroid and Zustand were effectively tied; both stayed materially below Redux
- the gap is mostly about delivery model: the Stroid measurement waits for its async flush to finish, while Redux and Zustand do not

## Stroid Scale Results

### Single-Store Subscriber Fanout

Selected rows from `npm run benchmark:subscriber`.

| Subscribers | Noop Median | Noop Batch100 | Compute Median | Compute Batch100 |
| --- | --- | --- | --- | --- |
| `10,000` | `0.140ms` | `9.138ms` | `0.143ms` | `10.240ms` |
| `50,000` | `0.551ms` | `33.275ms` | `0.662ms` | `43.617ms` |
| `100,000` | `1.231ms` | `65.200ms` | `1.152ms` | `123.875ms` |
| `200,000` | `1.870ms` | `196.690ms` | `2.504ms` | `250.922ms` |
| `250,000` | `2.459ms` | `255.050ms` | `2.904ms` | `327.526ms` |

### Stroid/Core Small-Range (100 To 10K)

Results from `npm run benchmark:core-small` on `2026-03-30` (`node v22.14.0`, `win32`, `x64`).

| Subscribers | Core Noop Median | Core Noop Batch100 | Core Compute Median | Core Compute Batch100 |
| --- | --- | --- | --- | --- |
| `100` | `0.317ms` | `17.025ms` | `0.148ms` | `16.977ms` |
| `500` | `0.226ms` | `12.431ms` | `0.238ms` | `14.632ms` |
| `1,000` | `0.408ms` | `12.688ms` | `0.292ms` | `17.926ms` |
| `2,500` | `0.466ms` | `23.248ms` | `0.475ms` | `25.168ms` |
| `5,000` | `0.620ms` | `45.653ms` | `0.740ms` | `44.389ms` |
| `7,500` | `1.055ms` | `40.460ms` | `0.875ms` | `41.936ms` |
| `10,000` | `0.770ms` | `54.591ms` | `0.868ms` | `82.363ms` |

Read note:

- this range intentionally focuses on small subscriber counts for `stroid/core`
- values can be non-monotonic at this scale due to scheduler jitter and GC timing

### 250K Concurrent Fanout

Results from `npm run benchmark:subscriber:concurrent`.

| Scenario | Mode | Stores | Total Subscribers | Median | P95 | Peak Heap Delta MB |
| --- | --- | --- | --- | --- | --- | --- |
| `realtime-dashboard-concurrent` | `concurrent` | `5` | `250,000` | `1.593ms` | `2.348ms` | `12.868` |
| `ops-dashboard-atomic-batch` | `batch` | `10` | `250,000` | `1.806ms` | `2.941ms` | `15.877` |

### Selector Benchmark

Selected rows from `npm run benchmark:selector`.

| Subscribers | Raw Ms | Simple Selector Ms | Complex Selector Ms | Raw Heap MB | Simple Heap MB | Complex Heap MB |
| --- | --- | --- | --- | --- | --- | --- |
| `50,000` | `0.887` | `37.457` | `90.230` | `3.945` | `54.076` | `57.363` |
| `200,000` | `1.825` | `154.645` | `377.481` | `15.443` | `229.316` | `229.319` |
| `800,000` | `7.224` | `627.527` | `1492.579` | `62.733` | `917.228` | `916.079` |

### Additional Script Outputs

| Script | Key Numeric Result |
| --- | --- |
| `npm run benchmark:deep-update` | deep path update at `250,000` subscribers: `1.664ms`; at `800,000`: `18.273ms` |
| `npm run benchmark:lifecycle` | at `100,000` subscribers: base `1.559ms`, hook `2.562ms`, middleware `1.044ms`, async helper `3.360ms` |

## Guarantee Results

Results from `npm run benchmark:guarantees`.

| Benchmark | Numeric Result | Status |
| --- | --- | --- |
| SSR isolation | `64` requests, `6.370ms` median, `10.996ms` p95, `foreignReadCount = 0` | Pass |
| Atomic rollback | `48` iterations, `36` forced rollbacks, `partialCommitCount = 0` | Pass |
| Race resistance | `24` waves x `80` ops, `1.030ms` median, `invariantViolations = 0` | Pass |
| Determinism replay | `20` replays, `uniqueOutputCount = 1` | Pass |
| Memory leak detection | `240` measured cycles, retained growth `2.496MB` | Pass |
| Governance lifecycle | `5` proposals, `1` rejected, `previewCommitMismatchCount = 0` | Pass |

## Commands Used

| Purpose | Command |
| --- | --- |
| Cross-library compare | `npm run benchmark:compare` |
| Core small-range | `npm run benchmark:core-small` |
| Single-store fanout | `npm run benchmark:subscriber` |
| Concurrent fanout | `npm run benchmark:subscriber:concurrent` |
| Selector cost | `npm run benchmark:selector` |
| Deep path updates | `npm run benchmark:deep-update` |
| Lifecycle overhead | `npm run benchmark:lifecycle` |
| Guarantee suite | `npm run benchmark:guarantees` |
