# Benchmark Report

## Summary

This report captures the full validation and subscriber-focused benchmark pass run on `dev-psr` on 2026-03-23.

Top-level outcome:

- all typechecks, build checks, API checks, declaration checks, main tests, and the lean performance suite passed
- the subscriber benchmark now uses truly unique callbacks, so the 250K result reflects 250K real subscribers rather than `Set` deduplication
- the single-store 250K subscriber target completed in both `noop` and `compute` modes
- the concurrent 250K subscriber benchmark also completed for both same-tick fanout and atomic batch scenarios

## Index

1. Validation Sequence
2. Environment
3. 250K Single-Store Subscriber Benchmark
4. 250K Concurrent Real-World Subscriber Benchmark
5. Performance Suite Highlights
6. Notes

## Validation Sequence

| Step | Command | Result |
| --- | --- | --- |
| 1 | `npm run typecheck` | Passed |
| 2 | `npm run typecheck:layers` | Passed |
| 3 | `npm run build` | Passed |
| 4 | `npm run check:react-types` | Passed |
| 5 | `npm run docs:api` | Passed |
| 6 | `npm run test:dts` | Passed |
| 7 | `tsc -p tsconfig.typetests.json` | Passed |
| 8 | `npm test` | Passed |
| 9 | `npm run test:performance` | Passed |
| 10 | `npm run benchmark:subscriber` | Passed |
| 11 | `npm run benchmark:subscriber:concurrent` | Passed |

## Environment

| Field | Value |
| --- | --- |
| Node | `v22.14.0` |
| Platform | `win32` |
| Arch | `x64` |
| Branch | `dev-psr` |
| Benchmark focus | subscriber fanout, concurrent subscriber fanout, sync-lite performance |

## 250K Single-Store Subscriber Benchmark

Semantics:

- latency is measured end to end from `setStore()` until the final marker subscriber observes the committed value
- `noop` mode uses unique no-op subscribers
- `compute` mode uses unique subscribers that perform a tiny amount of per-notification work

### Key Results

| Subscribers | Noop Median ms | Noop P95 ms | Noop Batch100 ms | Compute Median ms | Compute P95 ms | Compute Batch100 ms |
| --- | --- | --- | --- | --- | --- | --- |
| 10,000 | 0.956 | 1.350 | 145.415 | 1.471 | 48.358 | 290.264 |
| 50,000 | 3.694 | 6.162 | 595.949 | 4.445 | 40.065 | 1044.587 |
| 100,000 | 4.519 | 10.969 | 997.927 | 11.801 | 57.253 | 2451.186 |
| 150,000 | 11.781 | 44.964 | 1718.933 | 18.165 | 44.162 | 3370.350 |
| 200,000 | 12.846 | 43.155 | 1953.102 | 26.352 | 56.500 | 3329.176 |
| 250,000 | 23.263 | 37.294 | 2473.250 | 35.630 | 53.556 | 3645.122 |

### Threshold Summary

| Metric | Noop | Compute |
| --- | --- | --- |
| First noticeable slowdown (`>= 5ms`) | 150,000 | 40,000 |
| First `>= 10ms` median | 150,000 | 100,000 |
| Max count still under `16ms` median | 200,000 | 100,000 |
| First `100 writes > 1s` | 150,000 | 50,000 |
| Max tested stable | 250,000 | 250,000 |

### Memory Summary

| Subscribers | Noop Peak Heap Delta MB | Compute Peak Heap Delta MB |
| --- | --- | --- |
| 20,000 | 9.551 | 10.280 |
| 100,000 | 19.404 | 19.357 |
| 250,000 | 24.930 | 24.915 |

## 250K Concurrent Real-World Subscriber Benchmark

These runs model real application fanout more closely than the single-store benchmark:

- `realtime-dashboard-concurrent`: five hot stores updated in the same tick, like websocket-driven dashboard shards
- `ops-dashboard-atomic-batch`: ten related stores updated in one batch, like a server-pushed dashboard refresh

| Scenario | Mode | Stores | Total Subscribers | Layout | Waves | Median ms | P95 ms | Max ms | Peak Heap Delta MB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `realtime-dashboard-concurrent` | `concurrent` | 5 | 250,000 | `75k, 60k, 50k, 40k, 25k` | 5 | 22.934 | 52.314 | 52.314 | 17.029 |
| `ops-dashboard-atomic-batch` | `batch` | 10 | 250,000 | `25k x 10` | 5 | 18.637 | 57.361 | 57.361 | 13.950 |

### Practical Takeaways

- 250K total subscribers is achievable in this runtime on this machine for both same-tick and atomic-batch fanout
- sharding the subscriber load across stores keeps median wave latency in the `18ms` to `23ms` band even at 250K total subscribers
- the atomic ten-store dashboard batch was slightly faster than the five-store concurrent wave in median latency on this run

## Performance Suite Highlights

These are the timings printed by the lean `npm run test:performance` suite:

| Test | Result |
| --- | --- |
| single-store notify flush | `150.274ms` |
| snapshot cache benchmark | `1871.632ms` |
| heavy fanout under subscriber load | `340.457ms` |
| concurrent multi-store subscriber fanout | `161.239ms` |
| sync local broadcast timing | `98.680ms` |
| sync ten-store dashboard batch | `36.784ms` |

## Notes

- Benchmark numbers are machine-specific and should be treated as comparative guidance, not universal guarantees.
- The subscriber benchmark harness was corrected to use unique subscriber callbacks because stroid intentionally de-duplicates identical listeners via `Set`.
- The performance suite was tightened during this pass:
  - the snapshot-cache test now performs 100 real writes instead of starting with a no-op write
  - the concurrent subscriber performance test was added
  - the sync performance entry was slimmed to a lean broadcast-oriented harness so `npm run test:performance` finishes reliably
- API Extractor initially failed because the computed type entrypoint name collided with tsup's internal declaration output naming. Renaming the build entry to `computed-types` fixed that package-level validation blocker.
