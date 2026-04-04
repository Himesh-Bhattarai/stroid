# Benchmark Report

Latest rerun: `2026-04-04`

This report is generated from the current benchmark artifacts:
- `scripts/benchmark-results/run-all-benchmarks-summary.json`
- `scripts/benchmark-results/latest.json`
- `scripts/benchmark-results/production-trust-matrix-output.json`

## Certification Snapshot

| Area | Result |
| --- | --- |
| Stress test suite | `63/63` tests passed (`14` files) |
| Benchmark script run | `25/25` scripts passed |
| Benchmark wall time | `13m 11.757s` |
| Trust matrix invariants | `4/4` scenarios passed (`0` violations, `0` delete leaks) |
| Regression gate (local) | `fail` (`6` metrics below baseline by >20%) |
| Regression gate command | `npm run bench:stress:check` (CI enforcement; separate from `benchmark:all`) |

## Environment

| Field | Value |
| --- | --- |
| Date | `2026-04-04` |
| Node | `v22.14.0` |
| Platform | `win32` |
| Arch | `x64` |

## SSR + Hydration Overview

This section summarizes the dedicated certification artifacts:
- `scripts/guarantee-benchmark-suite-output.json`
- `scripts/ssr-fair-compare-output.json`
- `scripts/hydration-large-payload-benchmark-output.json`

Note: these dedicated certification outputs were generated on `v24.14.1` (`darwin`, `arm64`) and are reported separately from the `benchmark:all` (`v22.14.0`, `win32`, `x64`) run above.

### SSR Isolation + Lifecycle

| Area | Value |
| --- | --- |
| Chaos campaigns | `2 x 1,024` requests (`60` aborts each), `0` correctness failures |
| Sustained pressure | `8,192` requests, `5,555.721 req/s` |
| Async boundary matrix | `256` requests |
| React streaming HTTP | `256` requests |
| React streaming abort | `64` requests |
| React readable stream | `192` requests |
| Memory stability | `50,000` cycles |
| Isolation invariants | `foreignRead=0`, `contextMismatch=0`, `registryResidual=0`, `subscriberResidual=0` |

### SSR Deployment Models

| Certification | Value |
| --- | --- |
| Warm container | `1,024` requests, `2,048` detached probes, `detachedLeakCount=0`, `globalResidualCount=0` |
| Provider model | `288` total invocations (`aws_lambda`, `vercel`, `cloudflare_workers`), no leaks/residuals reported |
| Next.js server actions | `48` render/action pairs, `stateMismatchCount=0`, `crossCaptureBleedCount=0` |
| React 18 concurrency | `useTransition` + `useDeferredValue`, both `invariantViolations=0` |

### Hydration + Stream Guarantees

| Certification | Value |
| --- | --- |
| WebSocket hydration stream | `24` runs, `mismatchCount=0`, queued/replayed writes `6/6` |
| Hydration divergence suite | `68` certified runs, `1,136` queued writes, `unexpectedOutcomes=0`, `invariantViolations=0` |
| Hydration randomized | `36` runs across `client_wins`, `server_wins`, `merge`, mismatches `0` |

### Large Payload Hydration

| Payload | Clone Median | Immediate Median | Queued Median | Retained Growth | Mismatches |
| --- | ---: | ---: | ---: | ---: | ---: |
| `256 KB` | `0.376ms` | `90.228ms` | `81.826ms` | `7.375 MB` | `0` |
| `1,024 KB` | `1.371ms` | `822.616ms` | `836.635ms` | `15.492 MB` | `0` |
| `2,048 KB` | `2.566ms` | `3,108.530ms` | `3,069.392ms` | `19.229 MB` | `0` |

### SSR Fair Compare (Streaming HTTP)

| Mode | Median (ms) | P95 (ms) | Req/s | Heap Delta MB | Violations |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | `65.291` | `139.065` | `5,366.624` | `9.267` | `n/a` |
| Redux | `45.891` | `113.108` | `7,341.032` | `2.679` | `0` |
| Zustand | `58.261` | `83.139` | `10,335.583` | `0.555` | `0` |
| Stroid | `102.838` | `161.060` | `5,780.932` | `1.505` | `0` |

## Stress Test Count (By Folder)

| Folder | Files | Tests | Passed | Failed |
| --- | ---: | ---: | ---: | ---: |
| `tests/unit` | `4` | `22` | `22` | `0` |
| `tests/concurrency` | `2` | `7` | `7` | `0` |
| `tests/persistence` | `2` | `10` | `10` | `0` |
| `tests/sync` | `2` | `9` | `9` | `0` |
| `tests/hooks` | `2` | `10` | `10` | `0` |
| `tests/fuzz` | `1` | `1` | `1` | `0` |
| `tests/regression` | `1` | `4` | `4` | `0` |
| **Total** | **14** | **63** | **63** | **0** |

## Core Stress Benchmark (`bench:stress`)

All values below are from `scripts/benchmark-results/latest.json`.

| Operation | Library | Ops/sec | p50 (ms) | p95 (ms) | p99 (ms) | Memory Delta |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `createStore x10,000` | Stroid | `10,446.92` | `0.0633` | `0.1445` | `0.4684` | `40,668,080 B` |
| `createStore x10,000` | Zustand | `548,808.26` | `0.0009` | `0.0020` | `0.0025` | `95,904 B` |
| `createStore x10,000` | Jotai | `29,307.06` | `0.0120` | `0.0214` | `0.0869` | `387,872 B` |
| `set primitive x100,000` | Stroid | `16,809.02` | `0.0339` | `0.0881` | `0.2052` | `1,283,624 B` |
| `set primitive x100,000` | Zustand | `1,151,564.28` | `0.0004` | `0.0008` | `0.0018` | `810,016 B` |
| `set primitive x100,000` | Jotai | `203,456.27` | `0.0023` | `0.0049` | `0.0116` | `898,528 B` |
| `set deep x10,000` | Stroid | `12,504.78` | `0.0520` | `0.1377` | `0.2895` | `287,144 B` |
| `set deep x10,000` | Zustand | `566,588.29` | `0.0011` | `0.0019` | `0.0021` | `77,600 B` |
| `set deep x10,000` | Jotai | `122,705.56` | `0.0049` | `0.0117` | `0.0176` | `190,616 B` |
| `selector irrelevant x10,000` | Stroid | `17,308.84` | `0.0393` | `0.0789` | `0.1787` | `241,992 B` |
| `selector irrelevant x10,000` | Zustand | `981,229.09` | `0.0006` | `0.0013` | `0.0017` | `80,808 B` |
| `selector irrelevant x10,000` | Jotai | `55,271.22` | `0.0101` | `0.0244` | `0.0545` | `178,848 B` |
| `serialize + persist x1,000` | Stroid | `67.07` | `15.4972` | `22.4962` | `38.8569` | `76,832 B` |
| `broadcast receive x10,000` | Stroid | `22,745.88` | `0.0340` | `0.0619` | `0.1496` | `232,744 B` |
| `async ttl 100x100` | Stroid | `4,081.58` | `0.2142` | `0.4132` | `0.7182` | `196,376 B` |

## Production Trust Matrix (`benchmark:trust-matrix`)

| Scenario | Scope | Snapshot | Middleware | Batched Write Ops/sec | Churn Ops/sec | Invariant Violations | Delete Leaks |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| `request-deep-default` | `request` | `deep` | `0` | `6,495.85` | `2,513.37` | `0` | `0` |
| `request-shallow-mid-10` | `request` | `shallow` | `10` | `7,709.90` | `3,940.90` | `0` | `0` |
| `global-ref-mid-4` | `global` | `ref` | `4` | `8,502.37` | `4,416.97` | `0` | `0` |
| `temp-deep-mid-2` | `temp` | `deep` | `2` | `9,351.72` | `4,578.88` | `0` | `0` |

## Benchmark Script Inventory

`benchmark:all` executed these scripts in one pass:

- `benchmark:atomic-failure`
- `benchmark:compare`
- `benchmark:core-small`
- `benchmark:deep-update`
- `benchmark:determinism`
- `benchmark:governance`
- `benchmark:guarantees`
- `benchmark:hydration-divergence`
- `benchmark:hydration-large-payload`
- `benchmark:hydration-randomized`
- `benchmark:lifecycle`
- `benchmark:memory-leak`
- `benchmark:next-server-actions`
- `benchmark:race`
- `benchmark:react-concurrency`
- `benchmark:selector`
- `benchmark:serverless-provider`
- `benchmark:ssr-fair-compare`
- `benchmark:ssr-isolation`
- `benchmark:ssr-warm`
- `benchmark:subscriber`
- `benchmark:subscriber:concurrent`
- `benchmark:trust-matrix`
- `benchmark:websocket-stream`
- `bench:stress`

## Run Completion Matrix

Per-script completion status from `scripts/benchmark-results/run-all-benchmarks-summary.json`.

| Script | Duration (s) | Status |
| --- | ---: | --- |
| `benchmark:atomic-failure` | `4.97` | `pass` |
| `benchmark:compare` | `6.78` | `pass` |
| `benchmark:core-small` | `5.64` | `pass` |
| `benchmark:deep-update` | `5.19` | `pass` |
| `benchmark:determinism` | `9.33` | `pass` |
| `benchmark:governance` | `2.84` | `pass` |
| `benchmark:guarantees` | `231.49` | `pass` |
| `benchmark:hydration-divergence` | `15.89` | `pass` |
| `benchmark:hydration-large-payload` | `171.81` | `pass` |
| `benchmark:hydration-randomized` | `7.24` | `pass` |
| `benchmark:lifecycle` | `2.56` | `pass` |
| `benchmark:memory-leak` | `34.53` | `pass` |
| `benchmark:next-server-actions` | `2.03` | `pass` |
| `benchmark:race` | `3.34` | `pass` |
| `benchmark:react-concurrency` | `6.59` | `pass` |
| `benchmark:selector` | `34.57` | `pass` |
| `benchmark:serverless-provider` | `5.44` | `pass` |
| `benchmark:ssr-fair-compare` | `16.81` | `pass` |
| `benchmark:ssr-isolation` | `128.25` | `pass` |
| `benchmark:ssr-warm` | `22.63` | `pass` |
| `benchmark:subscriber` | `17.93` | `pass` |
| `benchmark:subscriber:concurrent` | `2.53` | `pass` |
| `benchmark:trust-matrix` | `17.12` | `pass` |
| `benchmark:websocket-stream` | `4.27` | `pass` |
| `bench:stress` | `31.95` | `pass` |

## Additional Benchmark Families

These snapshots come from dedicated output files (`scripts/*-output.json`) and represent broader benchmark coverage beyond the `bench:stress` table.

### Subscriber Fanout Scale

Source: `scripts/subscriber-benchmark-output.json`

| Subscribers | Noop Median (ms) | Noop Batch100 (ms) | Compute Median (ms) | Compute Batch100 (ms) |
| --- | ---: | ---: | ---: | ---: |
| `10,000` | `0.121` | `7.797` | `0.296` | `10.433` |
| `50,000` | `0.496` | `32.365` | `0.650` | `43.792` |
| `100,000` | `0.997` | `65.921` | `1.207` | `127.531` |
| `250,000` | `2.374` | `253.380` | `3.339` | `318.448` |

### Core Small-Range

Source: `scripts/core-small-benchmark-output.json`

| Subscribers | Noop Median (ms) | Noop Batch100 (ms) | Compute Median (ms) | Compute Batch100 (ms) |
| --- | ---: | ---: | ---: | ---: |
| `100` | `0.066` | `2.317` | `0.015` | `1.296` |
| `1,000` | `0.048` | `2.636` | `0.043` | `2.355` |
| `10,000` | `0.118` | `7.372` | `0.140` | `9.235` |

### Concurrent Fanout Scenarios

Source: `scripts/subscriber-concurrent-benchmark-output.json`

| Scenario | Mode | Wave Median (ms) | Wave P95 (ms) | Peak Heap Delta (MB) |
| --- | --- | ---: | ---: | ---: |
| `realtime-dashboard-concurrent` | `concurrent` | `1.557` | `3.062` | `19.527` |
| `ops-dashboard-atomic-batch` | `batch` | `1.666` | `2.742` | `15.924` |

### Selector Cost Curve

Source: `scripts/selector-benchmark-output.json`

| Subscribers | Raw (ms) | Simple Selector (ms) | Complex Selector (ms) |
| --- | ---: | ---: | ---: |
| `50,000` | `0.603` | `3.687` | `3.398` |
| `100,000` | `0.872` | `11.523` | `12.121` |
| `200,000` | `1.612` | `27.774` | `27.357` |
| `800,000` | `6.471` | `116.042` | `114.025` |

### Deep Path Updates

Source: `scripts/deep-update-benchmark-output.json`

| Subscribers | Single Avg (ms) |
| --- | ---: |
| `50,000` | `1.159` |
| `100,000` | `0.756` |
| `150,000` | `0.853` |
| `200,000` | `1.132` |
| `250,000` | `1.425` |
| `800,000` | `8.667` |

### Lifecycle Overhead

Source: `scripts/lifecycle-benchmark-output.json`

| Subscribers | Base (ms) | Hook (ms) | Middleware (ms) | Async Helper (ms) |
| --- | ---: | ---: | ---: | ---: |
| `100,000` | `1.053` | `1.064` | `0.841` | `2.937` |

### Cross-Library Fanout

Source: `scripts/compare-state-libraries-output.json`

| Subscribers | Stroid Avg (ms) | Redux Avg (ms) | Redux+Immer Avg (ms) | Zustand Avg (ms) |
| --- | ---: | ---: | ---: | ---: |
| `5,000` | `0.125` | `0.056` | `0.062` | `0.063` |
| `50,000` | `0.528` | `0.272` | `0.274` | `0.285` |
| `75,000` | `0.712` | `0.418` | `0.431` | `0.426` |

| Subscribers | Stroid Batch100 (ms) | Redux Batch100 (ms) | Redux+Immer Batch100 (ms) | Zustand Batch100 (ms) |
| --- | ---: | ---: | ---: | ---: |
| `5,000` | `5.254` | `2.915` | `3.307` | `3.043` |
| `50,000` | `29.394` | `27.022` | `27.383` | `28.714` |
| `75,000` | `43.649` | `40.806` | `55.109` | `42.756` |

## Guarantee Micro-Benchmarks

From `scripts/guarantee-benchmark-suite-output.json`:

| Benchmark | Key Output |
| --- | --- |
| Atomic failure injection | `48` iterations, `36` rollbacks, `partialCommitCount=0`, median `0.120ms` |
| Race stress | `24` waves x `80` ops, `invariantViolations=0`, `stateMismatchCount=0`, median `1.039ms` |
| Determinism replay | `20` replays, `uniqueOutputCount=1`, median `24.185ms` |
| Memory leak detection | warmup `40`, measured `240`, retained growth `2.471 MB`, peak delta `2.473 MB` |
| Governance lifecycle | `5` proposals, `1` rejected mutation, `previewCommitMismatchCount=0`, commit median `0.065ms` |

## Notes

- `benchmark:all` is now a workload runner. It does not include the regression gate command.
- CI still enforces regression guardrails with `npm run bench:stress:check` and fails when ops/sec drops more than `20%` against baseline.
- Current local run fails regression check in `6` metrics; baseline update (`npm run bench:stress:update-baseline`) should only be done after explicit performance review.
- The SSR fair compare benchmark now retries transient localhost fetch failures (`ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`) to reduce false negative exits under high local concurrency.


## Overview

- This benchmark suite is a production trust report, not only a speed chart. It combines correctness stress tests, deterministic guarantee checks, SSR/hydration certification, and throughput benchmarks.
- Stroid is validated under realistic usage and adversarial conditions: race storms, malformed sync frames, storage failures, async retry pressure, and hydration divergence.
- Subscriber and selector fanout is measured into high-cardinality ranges (including 200k+ subscribers in dedicated scripts) so scaling ceilings are visible before production rollout.
- Core throughput (`bench:stress`) is compared against Zustand and Jotai, while Stroid-specific guarantees (determinism, persistence resilience, sync safety, lifecycle cleanup) are verified in separate benchmark families.
- Absolute ops/sec values are hardware and runtime sensitive; use CI regression checks as the merge gate and use local runs for trend analysis and profiling.
- Regression policy: CI fails on `npm run bench:stress:check` when tracked metrics drop below `80%` of baseline. Baseline updates (`npm run bench:stress:update-baseline`) should be review-driven.

## Reproduce

| Purpose | Command |
| --- | --- |
| Stress tests | `npm run test:stress` |
| All benchmark workloads | `npm run benchmark:all` |
| Regression gate only | `npm run bench:stress:check` |
| CI benchmark pair | `npm run bench:stress:ci` |
 
