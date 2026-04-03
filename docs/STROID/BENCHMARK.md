# Benchmark Report

Latest rerun: `2026-04-03`

This report is derived from the committed JSON outputs in `scripts/*-output.json`. The goal is twofold:
- certify correctness invariants under concurrent SSR + hydration edge cases
- publish a repeatable performance baseline (fanout, selectors, deep updates, cross-library comparisons)

## Quick View

- SSR isolation: `0` correctness violations across burst (`2 x 1,024`), sustained (`8,192`), interleaving (`192`), async-boundary matrix (`256`), React pipeable-stream SSR (`256`), client-abort streaming (`64`), edge readable-stream SSR (`192`), and long-tail memory (`50,000`).
- Warm-container + provider-model: `0` detached leaks and `0` global residuals across the warm Node model and the AWS/Vercel/Workers provider models.
- React 18 concurrency: `0` invariant violations under both `useTransition` and `useDeferredValue` runs.
- WebSocket hydration stream: `0` mismatches with `6` queued writes replayed deterministically before close.
- Large-payload hydration: parity preserved through `2,048 KB` payloads (queued median `3069.392ms`, mismatches `0`).
- Fanout scale (single-store): `250,000` subscribers at `2.374ms` median (`noop`) and `3.339ms` median (`compute`) per write.

Raw outputs:
- `benchmark:guarantees`: [`scripts/guarantee-benchmark-suite-output.json`](../../scripts/guarantee-benchmark-suite-output.json)
- `benchmark:subscriber`: [`scripts/subscriber-benchmark-output.json`](../../scripts/subscriber-benchmark-output.json)
- `benchmark:compare`: [`scripts/compare-state-libraries-output.json`](../../scripts/compare-state-libraries-output.json)
- `benchmark:ssr-fair-compare`: [`scripts/ssr-fair-compare-output.json`](../../scripts/ssr-fair-compare-output.json)
- `benchmark:hydration-large-payload`: [`scripts/hydration-large-payload-benchmark-output.json`](../../scripts/hydration-large-payload-benchmark-output.json)

## Environment

| Field | Value |
| --- | --- |
| Date | `2026-04-03` |
| Node | `v24.14.1` |
| Platform | `darwin` |
| Arch | `arm64` |
| CPU | `Apple M4 Pro` |

## Trust Notes

- All scripts were run serially in one local workspace to avoid cross-process contention skewing results.
- Most performance scripts measure end-to-end until a final marker subscriber observes the committed value (not just `setStore()` call time).
- The atomic rollback benchmark intentionally emits warnings while injecting controlled failures; the suite still passes when `partialCommitCount = 0`.
- The serverless “provider” certification is a local runtime-model test (warm container behavior + explicit scope boundaries). It is not a claim about remote managed deployments without credentials and platform tooling.

## How To Reproduce

If you are capturing JSON to a file, prefer running the underlying `node --import tsx ...` command directly (running via `npm run` prefixes output and breaks strict JSON capture).

| Purpose | Command | Output |
| --- | --- | --- |
| Certified suite | `node --expose-gc --import tsx scripts/guarantee-benchmark-suite.ts > scripts/guarantee-benchmark-suite-output.json` | [`scripts/guarantee-benchmark-suite-output.json`](../../scripts/guarantee-benchmark-suite-output.json) |
| Large payload | `node --expose-gc --import tsx scripts/hydration-large-payload-benchmark.ts > scripts/hydration-large-payload-benchmark-output.json` | [`scripts/hydration-large-payload-benchmark-output.json`](../../scripts/hydration-large-payload-benchmark-output.json) |
| Fanout scale | `node --expose-gc --import tsx scripts/subscriber-benchmark.ts > scripts/subscriber-benchmark-output.json` | [`scripts/subscriber-benchmark-output.json`](../../scripts/subscriber-benchmark-output.json) |
| Cross-library fanout | `node --expose-gc --import tsx scripts/compare-state-libraries.ts > scripts/compare-state-libraries-output.json` | [`scripts/compare-state-libraries-output.json`](../../scripts/compare-state-libraries-output.json) |
| SSR fair compare | `node --expose-gc --import tsx scripts/ssr-fair-compare.ts > scripts/ssr-fair-compare-output.json` | [`scripts/ssr-fair-compare-output.json`](../../scripts/ssr-fair-compare-output.json) |

## Certified Guarantee Suite (Correctness)

Results below are from [`scripts/guarantee-benchmark-suite-output.json`](../../scripts/guarantee-benchmark-suite-output.json).

| Certification | Key Result | Status |
| --- | --- | --- |
| SSR isolation | `0` violations across burst, sustained, interleaving, async boundary matrix, React streaming (pipeable + readable), client abort, and long-tail memory | Pass |
| SSR warm container | `0` detached leaks, `0` global residuals across `1,024` sequential requests | Pass |
| Serverless provider model | `288` total invocations across AWS/Vercel/Workers models with `0` leaks/residuals | Pass |
| Next.js Server Actions boundary | `48` render/action pairs, `stateMismatchCount = 0`, `crossCaptureBleedCount = 0` | Pass |
| React 18 concurrency | `useTransition` + `useDeferredValue`: `0` invariant violations | Pass |
| WebSocket hydration stream | `24` runs, queued `6` writes pre-close replayed in order, `mismatchCount = 0` | Pass |
| Atomic failure injection | `48` iterations, `36` rollbacks, `partialCommitCount = 0` | Pass |
| Race resistance | `24` waves x `80` ops, `invariantViolations = 0`, `stateMismatchCount = 0` | Pass |
| Hydration divergence | `68` certified runs, `1,136` queued writes, boundary = `mixed`, `unexpectedOutcomes = 0`, `invariantViolations = 0` | Pass |
| Hydration randomized | `36` runs, `mismatches = 0` across `client_wins`, `server_wins`, `merge` | Pass |
| Determinism replay | `20` replays, `uniqueOutputCount = 1` | Pass |
| Memory leak detection | `240` measured cycles, store count returns to `0` at every checkpoint | Pass |
| Governance lifecycle | `5` proposals, `1` rejected mutation, `previewCommitMismatchCount = 0` | Pass |

### SSR Isolation (Expanded)

- Burst chaos: `2 x 1,024` concurrent requests (seeded interleavings, controlled aborts)
- Sustained pressure: `8 x 1,024` concurrent (`8,192` total), throughput `5555.721 req/s`
- Cross-request interleaving: `96` pairs (`192` requests) with forced pause/resume
- Async boundary matrix: `256` concurrent requests across Promise/microtask/nextTick/immediate/timeout/MessageChannel/EventEmitter/crypto
- React streaming SSR: `256` concurrent HTTP requests using `renderToPipeableStream` + nested `Suspense`
- React streaming abort: `64` client disconnects; server aborts the render stream on `res.close`
- Edge readable-stream SSR: `192` concurrent renders using `renderToReadableStream` (`react-dom/server.browser`)
- Long-tail memory: `50,000` cycles, memory slope `0.002 MB / 1k`, `retainedGrowthMb = -0.328`
- Invariants: `foreignReadCount = 0`, `contextMismatchCount = 0`, `postLifecycleAccessSuccess = 0`, `registryResidualCount = 0`, `subscriberResidualCount = 0`

<details>
<summary>Raw (jq snippet)</summary>

```bash
jq '.results[] | select(.name==\"SSR Isolation Certification Suite\") | {requests, boundaryMatrix, sustainedPressure, reactStreamingHttp, reactStreamingHttpAbort, reactStreamingReadable, memoryStability, invariants}' scripts/guarantee-benchmark-suite-output.json
```

</details>

### Warm-Container + Provider-Model Certifications

- Warm container: `1,024` sequential requests, `2,048` detached probes, `detachedLeakCount = 0`, `globalResidualCount = 0`
- Provider model: `96` invocations each for `aws_lambda`, `vercel`, `cloudflare_workers`, all with `detachedLeakCount = 0`, `globalResidualCount = 0`

### React 18 Concurrency Certification

- `useTransition`: `8` runs, `24` updates/run, `invariantViolations = 0`
- `useDeferredValue`: `8` runs, `24` updates/run, `invariantViolations = 0`
- Both scenarios converged to `{ value: 24, parity: "even", label: "count:24" }`

### Next.js Server Actions Boundary Certification

- `48` render/action pairs
- `stateMismatchCount = 0`
- `crossCaptureBleedCount = 0`

### WebSocket Hydration Stream Certification

- `24` runs
- queued before close: `6` sync frames
- continued after close: `4` sync frames
- `mismatchCount = 0` with deterministic replay ordering

## Performance Baselines (Stroid)

### Single-Store Subscriber Fanout

Selected rows from [`scripts/subscriber-benchmark-output.json`](../../scripts/subscriber-benchmark-output.json).

| Subscribers | Noop Median | Noop Batch100 | Compute Median | Compute Batch100 |
| --- | ---: | ---: | ---: | ---: |
| `10,000` | `0.121ms` | `7.797ms` | `0.296ms` | `10.433ms` |
| `50,000` | `0.496ms` | `32.365ms` | `0.650ms` | `43.792ms` |
| `100,000` | `0.997ms` | `65.921ms` | `1.207ms` | `127.531ms` |
| `200,000` | `1.922ms` | `202.409ms` | `2.390ms` | `250.542ms` |
| `250,000` | `2.374ms` | `253.380ms` | `3.339ms` | `318.448ms` |

### Stroid/Core Small-Range (100 To 10K)

Results from [`scripts/core-small-benchmark-output.json`](../../scripts/core-small-benchmark-output.json).

| Subscribers | Core Noop Median | Core Noop Batch100 | Core Compute Median | Core Compute Batch100 |
| --- | ---: | ---: | ---: | ---: |
| `100` | `0.066ms` | `2.317ms` | `0.015ms` | `1.296ms` |
| `500` | `0.029ms` | `2.220ms` | `0.045ms` | `1.691ms` |
| `1,000` | `0.048ms` | `2.636ms` | `0.043ms` | `2.355ms` |
| `2,500` | `0.067ms` | `3.451ms` | `0.076ms` | `3.672ms` |
| `5,000` | `0.086ms` | `5.119ms` | `0.147ms` | `5.832ms` |
| `7,500` | `0.086ms` | `6.048ms` | `0.106ms` | `7.807ms` |
| `10,000` | `0.118ms` | `7.372ms` | `0.140ms` | `9.235ms` |

### 250K Concurrent Fanout (Multi-Store)

Results from [`scripts/subscriber-concurrent-benchmark-output.json`](../../scripts/subscriber-concurrent-benchmark-output.json).

| Scenario | Mode | Stores | Total Subscribers | Median | P95 | Peak Heap Delta MB |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `realtime-dashboard-concurrent` | `concurrent` | `5` | `250,000` | `1.557ms` | `3.062ms` | `19.527` |
| `ops-dashboard-atomic-batch` | `batch` | `10` | `250,000` | `1.666ms` | `2.742ms` | `15.924` |

### Selector Benchmark

Results from [`scripts/selector-benchmark-output.json`](../../scripts/selector-benchmark-output.json).

| Subscribers | Raw Ms | Simple Selector Ms | Complex Selector Ms | Raw Heap MB | Simple Heap MB | Complex Heap MB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `50,000` | `0.603` | `3.687` | `3.398` | `3.951` | `27.336` | `27.206` |
| `100,000` | `0.872` | `11.523` | `12.121` | `7.871` | `54.394` | `54.387` |
| `200,000` | `1.612` | `27.774` | `27.357` | `15.688` | `108.773` | `108.765` |
| `800,000` | `6.471` | `116.042` | `114.025` | `62.732` | `435.052` | `435.049` |

### Deep Path Update Benchmark

Results from [`scripts/deep-update-benchmark-output.json`](../../scripts/deep-update-benchmark-output.json).

| Subscribers | Deep Path Single Avg |
| --- | ---: |
| `50,000` | `1.159ms` |
| `100,000` | `0.756ms` |
| `150,000` | `0.853ms` |
| `200,000` | `1.132ms` |
| `250,000` | `1.425ms` |
| `800,000` | `8.667ms` |

### Lifecycle + Async Helper Overhead

Results from [`scripts/lifecycle-benchmark-output.json`](../../scripts/lifecycle-benchmark-output.json) (`3` runs, median of samples).

- base (no lifecycle): `1.053ms`
- hook (`lifecycle.onSet`): `1.064ms`
- middleware (`lifecycle.middleware`): `0.841ms`
- async helper (`fetchStore` over 100k subscribers): `2.937ms`

## Cross-Library Comparison (Subscriber Fanout)

Important comparison note:
- Stroid numbers in this script are measured end-to-end until its async notification flush reaches a final marker subscriber.
- Redux and Zustand numbers are measured synchronously inside `dispatch()` / `setState()`.

### Single Write Average

All values are `singleAvgMs` from `scripts/compare-state-libraries.ts`.

| Subscribers | Stroid | Redux plain | Redux + Immer | Zustand |
| --- | ---: | ---: | ---: | ---: |
| `5,000` | `0.125ms` | `0.056ms` | `0.062ms` | `0.063ms` |
| `10,000` | `0.121ms` | `0.096ms` | `0.095ms` | `0.100ms` |
| `25,000` | `0.279ms` | `0.150ms` | `0.155ms` | `0.155ms` |
| `50,000` | `0.528ms` | `0.272ms` | `0.274ms` | `0.285ms` |
| `75,000` | `0.712ms` | `0.418ms` | `0.431ms` | `0.426ms` |

### 100 Write Batch Total

All values are `batch100Ms` from `scripts/compare-state-libraries.ts`.

| Subscribers | Stroid | Redux plain | Redux + Immer | Zustand |
| --- | ---: | ---: | ---: | ---: |
| `5,000` | `5.254ms` | `2.915ms` | `3.307ms` | `3.043ms` |
| `10,000` | `6.990ms` | `5.437ms` | `5.631ms` | `5.644ms` |
| `25,000` | `15.569ms` | `13.832ms` | `14.164ms` | `14.510ms` |
| `50,000` | `29.394ms` | `27.022ms` | `27.383ms` | `28.714ms` |
| `75,000` | `43.649ms` | `40.806ms` | `55.109ms` | `42.756ms` |

### Memory At 75K Subscribers

| Library | Heap Delta MB | Bytes / Subscriber |
| --- | ---: | ---: |
| Stroid | `6.517` | `91.117` |
| Redux plain | `7.533` | `105.314` |
| Redux + Immer | `7.524` | `105.195` |
| Zustand | `6.519` | `91.143` |

## SSR Fair Compare (Streaming HTTP)

This script runs four modes (baseline, Redux, Zustand, Stroid) inside the same process, with the same async workload, and measures end-to-end time from request start until the streamed HTML is fully read.

Source + raw output: [`scripts/ssr-fair-compare-output.json`](../../scripts/ssr-fair-compare-output.json).

| Mode | Median | P95 | Req/s | Heap Delta MB | Violations |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline (no store) | `65.291ms` | `139.065ms` | `5366.624` | `9.267` | `n/a` |
| Redux | `45.891ms` | `113.108ms` | `7341.032` | `2.679` | `0` |
| Zustand | `58.261ms` | `83.139ms` | `10335.583` | `0.555` | `0` |
| Stroid | `102.838ms` | `161.060ms` | `5780.932` | `1.505` | `0` |

<details>
<summary>Per-concurrency medians</summary>

| Concurrency | Baseline Median | Redux Median | Zustand Median | Stroid Median |
| ---: | ---: | ---: | ---: | ---: |
| `100` | `15.268ms` | `8.868ms` | `9.665ms` | `17.225ms` |
| `500` | `51.186ms` | `40.578ms` | `31.075ms` | `63.701ms` |
| `1000` | `67.134ms` | `74.607ms` | `64.747ms` | `154.989ms` |

</details>

## Hydration Large-Payload Benchmark

This benchmark makes the cloning and replay costs explicit at multi-hundred-KB to multi-MB state sizes.

Raw output: [`scripts/hydration-large-payload-benchmark-output.json`](../../scripts/hydration-large-payload-benchmark-output.json).

| Target Size | Approx Bytes | Clone Median | Immediate Median | Queued Median | Retained Growth | Mismatches |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `256 KB` | `262,551` | `0.376ms` | `90.228ms` | `81.826ms` | `7.375 MB` | `0` |
| `1024 KB` | `1,048,881` | `1.371ms` | `822.616ms` | `836.635ms` | `15.492 MB` | `0` |
| `2048 KB` | `2,097,591` | `2.566ms` | `3108.530ms` | `3069.392ms` | `19.229 MB` | `0` |
