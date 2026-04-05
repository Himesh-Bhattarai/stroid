# Stroid Final Benchmark Report (Median of 3 Runs)

**Date of runs:** 2026-04-05  
**Node version:** v22.14.0  
**Platform:** Microsoft Windows 10 Pro (x64)  
**Methodology:** Each benchmark script executed 3 times; reported values are medians.

## Executive Summary
- Overall status: All stress tests pass (63/63); regression-gate simulation on median metrics shows 14 tracked metrics below 80% baseline.
- Key movement vs baseline: median Stroid ops/sec shows pressure on raw throughput paths (createStore=49.84%, set primitive=51.21%, selector irrelevant=65.75%).
- Recommendation: Investigate CI-reproducible regressions first; keep CI as merge gate. Local variance on Windows/Node 22 remains material.
- Context (not apples-to-apples): Stroid carries deterministic guarantees (queue replay, isolation, invariant safety, lifecycle controls), so cross-library throughput numbers reflect additional correctness work, not only raw setter speed.

## Environment
| Field | Value |
|-------|-------|
| Date | 2026-04-05 |
| Node | v22.14.0 |
| Platform | Microsoft Windows 10 Pro x64 |
| Benchmark iterations | 3 |

## Core Throughput: Stroid vs Zustand vs Jotai (`bench:stress`)
| Operation | Library | Ops/sec (median) | p50 (ms) | p95 (ms) | Memory delta |
|---|---|---:|---:|---:|---:|
| createStore x10,000 | stroid | 6,718.01 | 0.079 | 0.225 | 43,769,928 B |
| createStore x10,000 | zustand | 327,137.35 | 0.001 | 0.002 | 112,616 B |
| createStore x10,000 | jotai | 22,922.84 | 0.011 | 0.022 | 411,496 B |
| set primitive x100,000 | stroid | 13,033.51 | 0.043 | 0.109 | 1,264,376 B |
| set primitive x100,000 | zustand | 824,293.58 | 0.001 | 0.001 | 827,072 B |
| set primitive x100,000 | jotai | 128,069.70 | 0.004 | 0.007 | 911,320 B |
| set deep x10,000 | stroid | 7,218.62 | 0.076 | 0.203 | 272,448 B |
| set deep x10,000 | zustand | 154,999.59 | 0.001 | 0.002 | 108,144 B |
| set deep x10,000 | jotai | 81,063.36 | 0.006 | 0.012 | 169,576 B |
| selector irrelevant x10,000 | stroid | 12,946.59 | 0.048 | 0.122 | 252,064 B |
| selector irrelevant x10,000 | zustand | 473,157.76 | 0.001 | 0.002 | 93,344 B |
| selector irrelevant x10,000 | jotai | 43,467.13 | 0.010 | 0.022 | 165,384 B |
| serialize + persist x1,000 | stroid | 86.61 | 10.527 | 21.299 | 47,040 B |
| broadcast receive x10,000 | stroid | 15,405.04 | 0.035 | 0.085 | 265,064 B |
| async ttl 100x100 | stroid | 3,022.83 | 0.277 | 0.598 | 286,392 B |

## Subscriber Fanout (Stroid only)
| Subscribers | Noop median (ms) | Noop batch100 (ms) | Compute median (ms) | Compute batch100 (ms) |
|---:|---:|---:|---:|---:|
| 10,000 | 1.209 | 104.944 | 1.452 | 119.923 |
| 50,000 | 2.502 | 279.128 | 6.007 | 561.888 |
| 100,000 | 4.391 | 476.427 | 7.425 | 1,001.810 |
| 250,000 | 9.860 | 1,180.980 | 21.530 | 2,393.053 |

## Selector Cost Curve (Stroid only)
| Subscribers | Raw (ms) | Simple selector (ms) | Complex selector (ms) |
|---:|---:|---:|---:|
| 50,000 | 6.008 | 9.000 | 14.368 |
| 100,000 | 5.254 | 28.531 | 21.355 |
| 200,000 | 9.521 | 36.006 | 46.712 |
| 800,000 | 39.558 | 232.097 | 220.632 |

## Deep Path Updates (Stroid only)
| Subscribers | Single update avg (ms) |
|---:|---:|
| 50,000 | 7.336 |
| 100,000 | 4.317 |
| 150,000 | 6.227 |
| 200,000 | 6.592 |
| 250,000 | 12.725 |
| 800,000 | 93.221 |

## Lifecycle Overhead (Stroid only, 100k subscribers)
| Base (ms) | Hook (ms) | Middleware (ms) | Async helper (ms) |
|---:|---:|---:|---:|
| 6.004 | 4.472 | 5.027 | 29.251 |

## Cross-Library Fanout (5k, 50k, 75k subscribers)

Single update latencies (ms)
| Subscribers | Stroid | Redux | Redux+Immer | Zustand |
|---:|---:|---:|---:|---:|
| 5,000 | 1.219 | 0.351 | 0.382 | 0.638 |
| 50,000 | 2.632 | 1.858 | 1.911 | 1.961 |
| 75,000 | 3.605 | 2.833 | 2.733 | 3.280 |

Batch100 latencies (ms)
| Subscribers | Stroid | Redux | Redux+Immer | Zustand |
|---:|---:|---:|---:|---:|
| 5,000 | 66.643 | 17.445 | 22.033 | 15.986 |
| 50,000 | 244.293 | 209.345 | 221.301 | 192.569 |
| 75,000 | 325.314 | 333.631 | 245.370 | 281.737 |

## SSR + Hydration Certification
### SSR Isolation
| Metric | Median/Mode Value |
|---|---|
| Chaos campaigns | 2 campaigns x 1024 requests |
| Sustained pressure req/s | 380.40 |
| Memory stability cycles | 50000 |
| Memory retained growth (MB) | 0.100 |
| Invariants | foreignRead=0, contextMismatch=0, registryResidual=0, subscriberResidual=0 |

### Hydration Large Payload
| Payload | Clone median (ms) | Immediate median (ms) | Queued median (ms) | Retained growth (MB) | Mismatches |
|---|---:|---:|---:|---:|---:|
| 256 KB | 4.840 | 994.824 | 720.763 | 7.350 | 0 |
| 1,024 KB | 18.258 | 10,286.352 | 9,561.553 | 16.360 | 0 |
| 2,048 KB | 31.286 | 39,950.619 | 40,254.600 | 20.403 | 0 |

### SSR Fair Compare (Streaming HTTP)
| Mode | Median (ms) | P95 (ms) | Req/s | Heap delta MB | Violations |
|---|---:|---:|---:|---:|---:|
| Baseline | 1,960.793 | 3,213.054 | 244.15 | 6.814 | n/a |
| Redux | 1,419.775 | 2,646.699 | 338.61 | 2.530 | 0 |
| Zustand | 1,491.316 | 2,196.544 | 408.72 | 1.789 | 0 |
| Stroid | 2,865.095 | 5,096.164 | 176.87 | -1.114 | 0 |

### Hydration Divergence & WebSocket Stream
- Hydration divergence certified runs: 68 (unexpectedOutcomes=0, invariantViolations=0).
- Hydration randomized total runs: 36; policy mismatches are all 0 across client_wins/server_wins/merge in all runs.
- WebSocket hydration stream: mismatchCount=0, queuedWrites=6, replayedWrites=6.

## Production Trust Matrix
| Scenario | Batched write ops/sec | Churn ops/sec | Invariant violations | Delete leaks |
|---|---:|---:|---:|---:|
| request-deep-default | 6,854.20 | 2,726.51 | 0 | 0 |
| request-shallow-mid-10 | 4,801.41 | 2,507.54 | 0 | 0 |
| global-ref-mid-4 | 6,329.54 | 3,665.92 | 0 | 0 |
| temp-deep-mid-2 | 6,830.68 | 2,670.87 | 0 | 0 |

## Guarantee Micro-benchmarks
| Benchmark | Key Output (median/mode across 3 runs) |
|---|---|
| Atomic failure injection | iterations=48, rollbacks=36, partialCommitCount=0, median=0.657ms |
| Race stress | waves=24 x ops=80, invariantViolations=0, stateMismatchCount=0, median=14.533ms |
| Determinism replay | replays=20, uniqueOutputCount=1, median=193.856ms |
| Memory leak detection | warmup=40, measured=240, retainedGrowth=1.886 MB, peakDelta=1.887 MB |
| Governance lifecycle | proposals=5, rejectedMutationCount=1, previewCommitMismatchCount=0, commitMedian=0.340ms |

## Stress Test Suite
| Folder | Files | Tests | Passed | Failed |
|--------|-------|-------|--------|--------|
| tests/unit | 4 | 22 | 22 | 0 |
| tests/concurrency | 2 | 7 | 7 | 0 |
| tests/persistence | 2 | 10 | 10 | 0 |
| tests/sync | 2 | 9 | 9 | 0 |
| tests/hooks | 2 | 10 | 10 | 0 |
| tests/fuzz | 1 | 1 | 1 | 0 |
| tests/regression | 1 | 4 | 4 | 0 |
| **Total** | **14** | **63** | **63** | **0** |

## Regression Gate Status (vs Baseline)
| Metric | Baseline ops/sec | Median ops/sec (3 runs) | Ratio | Status |
|---|---:|---:|---:|---|
| create_store_10000 (stroid) | 13,478.31 | 6,718.01 | 49.84% | REGRESSION |
| create_store_10000 (zustand) | 425,056.21 | 327,137.35 | 76.96% | REGRESSION |
| create_store_10000 (jotai) | 39,576.72 | 22,922.84 | 57.92% | REGRESSION |
| set_primitive_100000 (stroid) | 25,453.41 | 13,033.51 | 51.21% | REGRESSION |
| set_primitive_100000 (zustand) | 1,274,003.82 | 824,293.58 | 64.70% | REGRESSION |
| set_primitive_100000 (jotai) | 175,043.61 | 128,069.70 | 73.16% | REGRESSION |
| set_deep_10000 (stroid) | 15,858.01 | 7,218.62 | 45.52% | REGRESSION |
| set_deep_10000 (zustand) | 593,376.73 | 154,999.59 | 26.12% | REGRESSION |
| set_deep_10000 (jotai) | 132,427.35 | 81,063.36 | 61.21% | REGRESSION |
| selector_irrelevant_update_10000 (stroid) | 19,691.76 | 12,946.59 | 65.75% | REGRESSION |
| selector_irrelevant_update_10000 (zustand) | 927,721.24 | 473,157.76 | 51.00% | REGRESSION |
| selector_irrelevant_update_10000 (jotai) | 62,625.72 | 43,467.13 | 69.41% | REGRESSION |
| persist_cycle_1000 (stroid) | 82.46 | 86.61 | 105.03% | PASS |
| broadcast_dispatch_receive_10000 (stroid) | 29,667.18 | 15,405.04 | 51.93% | REGRESSION |
| async_ttl_100_concurrent_x_100_rounds (stroid) | 5,823.70 | 3,022.83 | 51.91% | REGRESSION |

Median-gate summary: 14 / 15 tracked metrics are below the 80% threshold. Several regressions are cross-library in the same run window, which indicates environment variance; confirm on CI before actioning local-only failures.

## Notes & Reproducibility
- Reproduce (run): `npm run benchmark:all` (3 times, median taken), plus `npm run test:stress` and `npm run bench:stress` each iteration.
- Baseline update policy: only after explicit performance review (do not update from volatile local runs).
- Known variance: subscriber fanout and selector-irrelevant paths fluctuate on Windows / Node 22 under mixed system load.
- Absolute ops/sec are hardware-sensitive; CI regression gate is the merge decision source.
- Cross-library compare is standard directional context, but not strict apples-to-apples: Stroid includes additional deterministic and safety guarantees in the measured path.

## Appendix: Median Calculation Details
- For every numeric metric: median of run1/run2/run3.
- For non-numeric metrics and invariants: mode when all runs agree; otherwise marked `inconsistent`.
- No run was discarded; all three full iterations were included.
- Artifacts root: `scripts/benchmark-results/median-3runs-20260405-133116` (contains run1/run2/run3 logs and JSON snapshots).
