# Benchmark Report — Stroid (Median of 3 Runs)

> Status values: `Good` · `Warning` · `Problematic` · `Informational`
> Fields without data from the source report are marked **`[MISSING]`**.

---

## Environment & Run Metadata

| Field | Value |
|---|---|
| Report date | 2026-04-05 |
| Node / Runtime version | v22.14.0 (local) · v20.20.2 (CI — authoritative) |
| Platform / OS | Microsoft Windows 10 Pro x64 |
| CPU | **`[MISSING]`** — not recorded in source report |
| Memory | **`[MISSING]`** — not recorded in source report |
| Benchmark iterations | 3 |
| Aggregation method | Median of 3 runs; no run discarded |
| Baseline source | CI run `24000828199` · 2026-04-05 · Node v20.20.2 |
| CI run URL | https://github.com/Himesh-Bhattarai/stroid/actions/runs/24000828199 |
| Artifacts root | `scripts/benchmark-results/median-3runs-20260405-133116` |

---

## Executive Summary

- **Overall gate status:** `Green`
- **Key movements vs baseline:** Every tracked ops/sec metric on CI (Node v20.20.2) is above the 80% threshold; all 15 regression metrics marked `PASS`.
- **Merge recommendation:** CI is merge-ready. Keep local Windows median gate deltas as variance signals only.
- **Context note:** Stroid carries deterministic guarantees (queue replay, isolation, invariant safety, lifecycle controls). Cross-library throughput numbers reflect additional correctness work, not only raw setter speed — not apples-to-apples with Zustand or Jotai.


## Core Throughput — Stroid vs Zustand vs Jotai

### Operations per Second (Median)

| Operation | Stroid ops/sec | Zustand ops/sec | Jotai ops/sec |
|---|---:|---:|---:|
| createStore × 10,000 | 6,718.01 | 327,137.35 | 22,922.84 |
| set primitive × 100,000 | 13,033.51 | 824,293.58 | 128,069.70 |
| set deep × 10,000 | 7,218.62 | 154,999.59 | 81,063.36 |
| selector irrelevant × 10,000 | 12,946.59 | 473,157.76 | 43,467.13 |
| serialize + persist × 1,000 | 86.61 | **`[MISSING]`** | **`[MISSING]`** |
| broadcast receive × 10,000 | 15,405.04 | **`[MISSING]`** | **`[MISSING]`** |
| async ttl 100×100 | 3,022.83 | **`[MISSING]`** | **`[MISSING]`** |

> **`[MISSING]`** — persist, broadcast, and async TTL benchmarks are Stroid-only in this report. Zustand and Jotai equivalents are not measured; add these in the next cycle for complete cross-library comparison.

### Latency — p50 / p95 (ms) and Memory Delta

| Operation | Library | p50 (ms) | p95 (ms) | Memory delta |
|---|---|---:|---:|---:|
| createStore × 10,000 | stroid | 0.079 | 0.225 | 43,769,928 B |
| createStore × 10,000 | zustand | 0.001 | 0.002 | 112,616 B |
| createStore × 10,000 | jotai | 0.011 | 0.022 | 411,496 B |
| set primitive × 100,000 | stroid | 0.043 | 0.109 | 1,264,376 B |
| set primitive × 100,000 | zustand | 0.001 | 0.001 | 827,072 B |
| set primitive × 100,000 | jotai | 0.004 | 0.007 | 911,320 B |
| set deep × 10,000 | stroid | 0.076 | 0.203 | 272,448 B |
| set deep × 10,000 | zustand | 0.001 | 0.002 | 108,144 B |
| set deep × 10,000 | jotai | 0.006 | 0.012 | 169,576 B |
| selector irrelevant × 10,000 | stroid | 0.048 | 0.122 | 252,064 B |
| selector irrelevant × 10,000 | zustand | 0.001 | 0.002 | 93,344 B |
| selector irrelevant × 10,000 | jotai | 0.010 | 0.022 | 165,384 B |
| serialize + persist × 1,000 | stroid | 10.527 | 21.299 | 47,040 B |
| broadcast receive × 10,000 | stroid | 0.035 | 0.085 | 265,064 B |
| async ttl 100×100 | stroid | 0.277 | 0.598 | 286,392 B |

> **`[MISSING]`** — p99 and max latency columns are absent from all operations. Add these to expose tail behaviour.

---

## Subscriber Fanout (Stroid only)

| Subscribers | Noop median (ms) | Noop batch100 (ms) | Compute median (ms) | Compute batch100 (ms) |
|---:|---:|---:|---:|---:|
| 10,000 | 1.209 | 104.944 | 1.452 | 119.923 |
| 50,000 | 2.502 | 279.128 | 6.007 | 561.888 |
| 100,000 | 4.391 | 476.427 | 7.425 | 1,001.810 |
| 250,000 | 9.860 | 1,180.980 | 21.530 | 2,393.053 |

> **`[MISSING]`** — 500k and 1M subscriber tiers are not tested; the curve's behaviour beyond 250k is unknown.
> **`[MISSING]`** — p95 / p99 fanout latency is not reported; median alone hides spike behaviour.

---

## Selector Cost Curve (Stroid only)

| Subscribers | Raw (ms) | Simple selector (ms) | Complex selector (ms) |
|---:|---:|---:|---:|
| 50,000 | 6.008 | 9.000 | 14.368 |
| 100,000 | 5.254 | 28.531 | 21.355 |
| 200,000 | 9.521 | 36.006 | 46.712 |
| 800,000 | 39.558 | 232.097 | 220.632 |

> **`[MISSING]`** — selector cache hit rate under realistic update churn is not tracked.
> **`[MISSING]`** — computed chain depth (depth 3/5/10) recompute latency is not measured (flagged as a coverage gap).

---

## Deep Path Updates (Stroid only)

| Subscribers | Single update avg (ms) |
|---:|---:|
| 50,000 | 7.336 |
| 100,000 | 4.317 |
| 150,000 | 6.227 |
| 200,000 | 6.592 |
| 250,000 | 12.725 |
| 800,000 | 93.221 |

> **`[MISSING]`** — nesting depth sensitivity (depth 2/5/10) is not broken out.
> **`[MISSING]`** — concurrent writer behaviour at high subscriber counts is not measured.

---

## Lifecycle Overhead (Stroid only, 100k subscribers)

| Base (ms) | Hook (ms) | Middleware (ms) | Async helper (ms) |
|---:|---:|---:|---:|
| 6.004 | 4.472 | 5.027 | 29.251 |

> **`[MISSING]`** — lifecycle overhead at other subscriber tiers (10k, 250k) is not reported; 100k-only is a single data point.
> **`[MISSING]`** — middleware chain depth sensitivity (1 / 3 / 5 middlewares stacked) is not measured.

---

## Cross-Library Fanout

### Single Update Latencies (ms)

| Subscribers | Stroid | Redux | Redux+Immer | Zustand |
|---:|---:|---:|---:|---:|
| 5,000 | 1.219 | 0.351 | 0.382 | 0.638 |
| 50,000 | 2.632 | 1.858 | 1.911 | 1.961 |
| 75,000 | 3.605 | 2.833 | 2.733 | 3.280 |

### Batch100 Latencies (ms)

| Subscribers | Stroid | Redux | Redux+Immer | Zustand |
|---:|---:|---:|---:|---:|
| 5,000 | 66.643 | 17.445 | 22.033 | 15.986 |
| 50,000 | 244.293 | 209.345 | 221.301 | 192.569 |
| 75,000 | 325.314 | 333.631 | 245.370 | 281.737 |

> **`[MISSING]`** — 100k and 250k subscriber tiers are missing from the cross-library fanout table; single and batch curves are truncated at 75k.
> **`[MISSING]`** — Jotai is absent from cross-library fanout; it is present in core throughput but not here.
> **`[MISSING]`** — memory delta per library at each subscriber tier is not reported for cross-library fanout.

---

## SSR + Hydration Certification

### SSR Isolation

| Metric | Value |
|---|---|
| Chaos campaigns | 2 × 1,024 requests |
| Sustained pressure req/s | 380.40 |
| Memory stability cycles | 50,000 |
| Memory retained growth (MB) | 0.100 |
| foreignRead | 0 |
| contextMismatch | 0 |
| registryResidual | 0 |
| subscriberResidual | 0 |

### SSR Deployment Models

| Certification | Value |
|---|---|
| Warm container | 1,024 requests · 2,048 detached probes · detachedLeakCount=0 · globalResidualCount=0 |
| Provider model | 288 invocations (`aws_lambda`, `vercel`, `cloudflare_workers`) · all leak counts 0 |
| Next.js server actions boundary | 48 render/action pairs · stateMismatchCount=0 · crossCaptureBleedCount=0 |
| React 18 concurrency | `useTransition` + `useDeferredValue` · invariantViolations=0 |

> **`[MISSING]`** — Deno and Bun runtime SSR certification is not included.
> **`[MISSING]`** — Edge runtime (V8 isolates without Node ALS) is not explicitly certified.

### SSR ALS Ladder Summary

| Stage | Checks | Failures |
|---|---:|---:|
| Native ALS Baseline | 160 | 0 |
| Stroid In-Scope Boundary Matrix | 160 | 0 |
| Stroid Pre-Bound Callback Matrix | 64 | 0 |
| Stroid Post-Scope Leak Check | 96 | 0 |
| Stroid Concurrent Cross-Request Check | 128 | 0 |
| **Total** | **608** | **0** |

### SSR Gap Coverage Summary

| Suite | Sizes | Isolation failures | Notes |
|---|---|---:|---|
| Pre-bound ALS | 16, 32, 64, 128 | 0 | Includes per-emission probe token diagnostics |
| Pre-bound Portable | 16, 32, 64, 128 | 0 | Allows null context; blocks cross-request bleed |
| Mid-stream Action Overlap | 16, 24, 24, 24 | 0 | Streaming/action overlap with chaos and backpressure |
| Worker Post-lifecycle | 32, 64, 96, 96 | 0 | Late cleanup after jitter and injected errors |

Heap guardrails: `heapDeltaMb = 3.141 MB` · `heapSpikeMb = 3.414 MB` · `retainedReleaseMb = 0.273 MB` (all within 12 MB limit)

### Hydration Large Payload

| Payload | Clone median (ms) | Immediate median (ms) | Queued median (ms) | Retained growth (MB) | Mismatches |
|---|---:|---:|---:|---:|---:|
| 256 KB | 4.840 | 994.824 | 720.763 | 7.350 | 0 |
| 1,024 KB | 18.258 | 10,286.352 | 9,561.553 | 16.360 | 0 |
| 2,048 KB | 31.286 | 39,950.619 | 40,254.600 | 20.403 | 0 |

> **`[MISSING]`** — 128 KB and 4,096 KB payload tiers would complete the curve and identify the exact threshold where immediate hydration becomes unacceptable.
> **`[MISSING]`** — time-to-interactive / visual stability window is not measured.
> **`[MISSING]`** — hydration under network throttle (slow 3G) is not tested.

### SSR Fair Compare (Streaming HTTP)

| Mode | Median (ms) | P95 (ms) | Req/s | Heap delta MB | Violations |
|---|---:|---:|---:|---:|---:|
| Baseline | 1,960.793 | 3,213.054 | 244.15 | 6.814 | n/a |
| Redux | 1,419.775 | 2,646.699 | 338.61 | 2.530 | 0 |
| Zustand | 1,491.316 | 2,196.544 | 408.72 | 1.789 | 0 |
| Stroid | 2,865.095 | 5,096.164 | 176.87 | −1.114 | 0 |

> **`[MISSING]`** — CPU utilisation per req/s is not tracked for any mode.
> **`[MISSING]`** — sustained soak throughput (5-minute run) is absent; single-run values may not reflect steady-state behaviour.

### Hydration Divergence & WebSocket Stream

| Metric | Value |
|---|---|
| Hydration divergence certified runs | 68 (unexpectedOutcomes=0, invariantViolations=0) |
| Hydration randomized total runs | 36 · mismatches=0 across client_wins / server_wins / merge |
| WebSocket hydration stream | mismatchCount=0 · queuedWrites=6 · replayedWrites=6 |

> **`[MISSING]`** — WebSocket stream tested with only 6 queued writes; high-volume WebSocket replay under backpressure is not certified.

---

## Production Trust Matrix

| Scenario | Batched write ops/sec | Churn ops/sec | Invariant violations | Delete leaks |
|---|---:|---:|---:|---:|
| request-deep-default | 6,854.20 | 2,726.51 | 0 | 0 |
| request-shallow-mid-10 | 4,801.41 | 2,507.54 | 0 | 0 |
| global-ref-mid-4 | 6,329.54 | 3,665.92 | 0 | 0 |
| temp-deep-mid-2 | 6,830.68 | 2,670.87 | 0 | 0 |

> **`[MISSING]`** — p95 / p99 latency per scenario is not reported; ops/sec median alone does not capture tail behaviour.
> **`[MISSING]`** — scenarios under memory pressure (near-quota storage, low-RAM environment) are not included.

---

## Guarantee Micro-benchmarks

| Benchmark | Key output (median/mode, 3 runs) |
|---|---|
| Atomic failure injection | iterations=48 · rollbacks=36 · partialCommitCount=0 · median=0.657 ms |
| Race stress | waves=24 × ops=80 · invariantViolations=0 · stateMismatchCount=0 · median=14.533 ms |
| Determinism replay | replays=20 · uniqueOutputCount=1 · median=193.856 ms |
| Memory leak detection | warmup=40 · measured=240 · retainedGrowth=1.886 MB · peakDelta=1.887 MB |
| Governance lifecycle | proposals=5 · rejectedMutationCount=1 · previewCommitMismatchCount=0 · commitMedian=0.340 ms |

> **`[MISSING]`** — determinism replay count of 20 is low; increase to 100+ for higher confidence, especially under concurrent load.
> **`[MISSING]`** — memory leak detection uses only 240 measured cycles; a long-session simulation (multi-hour equivalent) is absent.
> **`[MISSING]`** — race stress wave/ops parameters (24×80) are not justified against a production concurrency model.

---

## Regression Gate Status

### CI Gate (Authoritative)

Source: CI run `24000828199` (2026-04-05) · Node v20.20.2 · workflow `completed/success`

| Metric | Baseline ops/sec | CI latest ops/sec | Ratio | Status |
|---|---:|---:|---:|---|
| create_store_10000 (stroid) | 13,478.31 | 51,737.83 | 383.86% | PASS |
| create_store_10000 (zustand) | 425,056.21 | 837,632.34 | 197.06% | PASS |
| create_store_10000 (jotai) | 39,576.72 | 90,338.55 | 228.26% | PASS |
| set_primitive_100000 (stroid) | 25,453.41 | 60,034.52 | 235.86% | PASS |
| set_primitive_100000 (zustand) | 1,274,003.82 | 2,801,942.90 | 219.93% | PASS |
| set_primitive_100000 (jotai) | 175,043.61 | 519,386.07 | 296.72% | PASS |
| set_deep_10000 (stroid) | 15,858.01 | 33,418.65 | 210.74% | PASS |
| set_deep_10000 (zustand) | 593,376.73 | 609,370.37 | 102.70% | PASS |
| set_deep_10000 (jotai) | 132,427.35 | 171,177.00 | 129.26% | PASS |
| selector_irrelevant_update_10000 (stroid) | 19,691.76 | 50,416.96 | 256.03% | PASS |
| selector_irrelevant_update_10000 (zustand) | 927,721.24 | 1,921,438.16 | 207.11% | PASS |
| selector_irrelevant_update_10000 (jotai) | 62,625.72 | 149,871.06 | 239.31% | PASS |
| persist_cycle_1000 (stroid) | 82.46 | 708.59 | 859.29% | PASS |
| broadcast_dispatch_receive_10000 (stroid) | 29,667.18 | 82,659.15 | 278.62% | PASS |
| async_ttl_100_concurrent_x_100_rounds (stroid) | 5,823.70 | 21,262.59 | 365.10% | PASS |

**CI-gate summary:** 0 regressions out of 15 tracked metrics.

> **`[MISSING]`** — baseline CPU model and load at capture time are not embedded; required for ratio interpretation to be reliable.
> **`[MISSING]`** — latency regression gate (p95 / p99) does not exist; only ops/sec is gated.

### Local Median Gate (Informational, Non-blocking)

- Local Windows / Node 22 previously showed 14/15 below threshold.
- Cross-library local drops occurred simultaneously — consistent with environment variance, not a Stroid-specific regression.
- Local benchmark variance is non-authoritative; CI artifacts are the merge decision source.

---

## Red Signal Watchlist (Non-gating)

| Signal | Value | Recommended action |
|---|---|---|
| Subscriber fanout — compute batch100 @ 250k | 2,393.053 ms | Stress-test before any extreme fanout usage; partition stores |
| Subscriber fanout — noop batch100 @ 250k | 1,180.980 ms | Monitor; dispatch path optimisation candidate |
| Selector cost — simple @ 800k | 232.097 ms | Avoid huge shared selector graphs without partitioning |
| Selector cost — complex @ 800k | 220.632 ms | Same as above |
| Deep-path update @ 800k | 93.221 ms | Split stores or isolate write-hot paths for large workloads |
| Hydration — 1 MB immediate | 10,286.352 ms | Avoid; use chunked or queued hydration |
| Hydration — 2 MB immediate | 39,950.619 ms | Blocked for production use; prefer streaming/chunking |
| Hydration — 2 MB queued | 40,254.600 ms | No advantage over immediate at this size; investigate root cause |
| SSR fair compare — Stroid req/s | 176.87 req/s vs 408.72 (Zustand) | Directional signal only; optimise without removing invariant safety |

---

## Coverage Gaps (Next Benchmark Cycle)

- [ ] **Baseline provenance** — embed runner CPU model, OS, load, and Node version in every baseline snapshot JSON.
- [ ] **Browser-runtime tracks** — React-thread contention, selector work, notification fanout, snapshot cloning under render load.
- [ ] **Fuzz breadth** — expand from 1 file / 1 test to multiple targets covering async, persist, hydration, sync streams, selector churn.
- [ ] **Devtools overhead isolation** — benchmark devtools off vs history-50 vs history-500 at high write volume.
- [ ] **Computed chain depth** — depth 1/3/5/10 recompute propagation and flush ordering overhead.
- [ ] **Long-session memory** — multi-hour equivalent navigation/store churn simulation (current max: 240 measured cycles).
- [ ] **Persist failure modes** — BFCache, storage races, Safari ITP eviction, quota pressure scenarios.
- [ ] **Real-stack coexistence** — Stroid alongside TanStack Query style workloads to capture practical production contention.
- [ ] **User-perceived metrics** — frame-time impact, long-task counts, hydration visual stability windows, interaction latency.
- [ ] **p99 / max latency gates** — current regression gate covers ops/sec only; add tail latency gating.
- [ ] **Cross-library fanout completeness** — add 100k and 250k tiers; add Jotai; add memory delta per library.
- [ ] **Bundle-size trend tracking** — intentionally deferred; start next cycle.
- [ ] **Cross-version longitudinal trends** — forward-only history starts from 2026-04-05; report in next cycle.
- [ ] **Deno / Bun SSR certification** — ALS behaviour differs from Node; certify separately.
- [ ] **WebSocket high-volume replay** — current certification covers only 6 queued writes.

---

## Advanced Reality Suite (Tracked from 2026-04-05)

Command: `npm run benchmark:production-reality`
Output: `scripts/production-reality-benchmark-output.json`
Included by: `npm run benchmark:all` and `npm run benchmark:guarantees`

| Dimension | Coverage status |
|---|---|
| Devtools overhead (history off / 50 / 500) | Tracked |
| Computed chain depth (depth 1/3/5/10) | Tracked |
| Long-session memory trends | Tracked |
| Persist failure-mode stress | Tracked |
| Query-cache co-load pressure | Tracked |
| User-perceived signals (frame-budget misses, event-loop p95/p99) | Tracked |
| Bundle-size trend | **`[MISSING]`** — deferred to next cycle |
| Cross-version longitudinal trend | **`[MISSING]`** — deferred to next cycle |

---

## Reproducibility

- **Reproduce:** `npm run benchmark:all` (3×, median taken) + `npm run test:stress` + `npm run bench:stress` each iteration.
- **Baseline update policy:** Only after explicit performance review. Never update from volatile local runs.
- **Known variance:** Subscriber fanout and selector-irrelevant paths fluctuate on Windows / Node 22 under mixed system load.
- **Absolute ops/sec caveat:** Hardware-sensitive. Use ratio-to-baseline for gating, not raw values.
- **Cross-library caveat:** Comparisons are directional only; Stroid carries additional deterministic and safety guarantees in the measured path.

---

## Appendix: Median Calculation Details

| Run | Status | Artifact path |
|---|---|---|
| Run 1 | Completed | `scripts/benchmark-results/median-3runs-20260405-133116/run1/` |
| Run 2 | Completed | `scripts/benchmark-results/median-3runs-20260405-133116/run2/` |
| Run 3 | Completed | `scripts/benchmark-results/median-3runs-20260405-133116/run3/` |
| **Median** | **Reported** | `scripts/benchmark-results/median-3runs-20260405-133116/` |

- Numeric metrics: median of all 3 runs. No run discarded.
- Non-numeric / invariants: mode when all runs agree; otherwise marked `inconsistent`.

---

## Quick Reference: Status Definitions

| Status | Meaning | Typical action |
|---|---|---|
| **Good** | Within acceptable bounds or above target threshold | Monitor; no action required |
| **Warning** | Marginal — acceptable now, likely problematic at higher scale | Document limit; add watchlist entry; plan optimisation |
| **Problematic** | Exceeds acceptable bounds; affects production viability | Block merge or add explicit waiver with mitigation plan |
| **Informational** | Tracked for trend purposes; not yet gating | Review each cycle; promote to gating once baseline is stable |

---

*Report filled: 2026-04-07. Source: Stroid benchmark run 2026-04-05, CI run `24000828199`. All `[MISSING]` tags indicate data absent from the source report and recommended for the next benchmark cycle.*