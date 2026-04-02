# Benchmark Report

## Summary

This report combines the serialized benchmark-script rerun from `2026-03-31`, the upgraded hydration-divergence certification rerun from `2026-04-01`, and the new SSR/hydration standalone certifications rerun on `2026-04-02`.

Headline results:

- the expanded SSR isolation certification passed with `0` correctness violations across `2 x 1,024` burst requests, `8,192` sustained requests, `256` concurrent React streaming HTTP requests, and `50,000` long-tail memory cycles
- the standalone SSR warm-container certification passed with `1,024` sequential requests, `2,048` detached probes, `0` detached leaks, and `0` global residuals in one long-lived Node process
- the standalone serverless provider-model certification passed `96` local invocations each for AWS Lambda, Vercel render-to-action hand-off, and Cloudflare Workers explicit scopes, with `0` detached leaks and `0` global residuals across all three runtime models
- the standalone React 18 concurrency certification passed `8` runs each for `useTransition` and `useDeferredValue`, with `0` invariant violations and final-state parity on every run
- the standalone Next.js Server Actions boundary certification passed `48` render/action pairs, with `0` state mismatches and `0` cross-capture bleed events
- the standalone WebSocket hydration stream certification passed `24` runs with `6` queued pre-close sync frames and `4` post-close frames each, with `0` mismatches and deterministic final ordering on every run
- the hydration-divergence certification now runs as a first-class guarantee suite under the manual-close boundary: `54` certified runs, `1,028` queued writes, `0` unexpected outcomes, and `0` invariant violations across `try`, `hit`, `stress`, and `hammer` campaigns
- the standalone hydration randomized certification passed `36` paired runs across `client_wins`, `server_wins`, and `merge`, with `0` replay mismatches and exact drift-order parity between immediate execution and queued replay
- the standalone large-payload hydration benchmark preserved parity at `256 KB`, `1,024 KB`, and `2,048 KB`, while making the current cost curve explicit: queued replay median rose from `79.148ms` at `256 KB` to `2,963.113ms` at `2,048 KB`
- Stroid sustained `250,000` single-store subscribers at `2.530ms` median (`noop`) and `3.044ms` median (`compute`)
- Stroid sustained `250,000` concurrent subscribers across multi-store fanout at `1.666ms` to `1.766ms` median wave latency
- in the cross-library subscriber comparison, Stroid was still slower on raw notify latency than Redux and Zustand in this script, but memory stayed close to Zustand and below both Redux variants at `75,000` subscribers
- in a dedicated `stroid/core` small-range run (`100` to `10,000` subscribers), median single-write latency stayed under `0.2ms` through `10,000` subscribers (`0.116ms` noop, `0.147ms` compute)
---
>[!IMPORTANT]
>Important comparison note:
>
>- Stroid numbers in the cross-library script are measured end-to-end until its async notification flush reaches the final marker subscriber
>- Redux and Zustand numbers are measured synchronously inside `dispatch()` / `setState()`
>- treat that table as a practical comparison, not a perfectly apples-to-apples scheduler comparison
>-So this is not a raw speed comparison — it’s a delivery model difference.

## Environment

| Field | Value |
| --- | --- |
| Date | `2026-03-31`, `2026-04-01`, and `2026-04-02` |
| Node | `v25.8.2` and `v24.14.1` |
| Platform | `darwin` |
| Arch | `arm64` |

## Trust Notes

- benchmark commands were run serially on the same machine to avoid cross-process contention skewing the measurements
- the guarantee suite intentionally emits warning lines during the atomic rollback benchmark because it injects controlled failures; those warnings are expected and the benchmark still passed
- the hydration-divergence certification below now matches the first-class suite included in `npm run benchmark:guarantees`; the detailed per-campaign numbers were captured from a standalone `npm run benchmark:hydration-divergence` rerun on `2026-04-01`
- the SSR warm-container and hydration randomized sections below were rerun as standalone certifications on `2026-04-02`; those scripts are now wired into `npm run benchmark:guarantees`
- the serverless provider-model section below was rerun as a standalone certification on `2026-04-02`; it is now wired into `npm run benchmark:guarantees` for future suite reruns
- the React 18 concurrency section below was rerun as a standalone certification on `2026-04-02`; it is now wired into `npm run benchmark:guarantees` for future suite reruns
- the Next.js Server Actions section below was rerun as a standalone certification on `2026-04-02`; it is now wired into `npm run benchmark:guarantees` for future suite reruns
- the WebSocket hydration stream section below was rerun as a standalone certification on `2026-04-02`; it is now wired into `npm run benchmark:guarantees` for future suite reruns
- the large-payload hydration benchmark below stays standalone on purpose because its multi-MB stress tier is materially more expensive than the default guarantee suite

## Hydration Divergence Certification

Dedicated results from `scripts/hydration-divergence-benchmark.ts` as exercised on `2026-04-01`.

| Campaign | Runs | Writes / Run | Median | P95 | Read |
| --- | --- | --- | --- | --- | --- |
| Try | `16` | `5` | `18.596ms` | `30.248ms` | mixed `effect > storage > sync > network > network`, no pre-close leak, final remote state settled to `fresh` |
| Hit | `12` | `4` | `19.468ms` | `22.587ms` | policy matrix stayed deterministic: `server_wins`, `client_wins`, `merge`, `invalidate_and_refetch` |
| Stress | `18` | `18` | `15.246ms` | `31.544ms` | repeated mixed-source replay preserved exact insertion order across async boundaries |
| Hammer | `8` | `72` | `31.262ms` | `32.413ms` | high-volume queued writes survived without leak or reorder across three stores |

Hydration certification read:

- `guaranteeBoundary = manual-close`
- `certifiedRuns = 54`
- `totalQueuedWrites = 1028`
- `unexpectedOutcomes = 0`
- `invariantViolations = 0`

Guarantee note:

- timer mode (`bootWindowMs` or `bootWindow: { mode: "timer" }`) remains supported for lower-friction adoption, but this certification only claims guarantees for explicit manual close

## SSR Warm-Container Certification

Dedicated results from `scripts/ssr-warm-container-benchmark.ts` as exercised on `2026-04-02`.

| Load | Request Median | Request P95 | Wave Median | Retained Growth | Read |
| --- | --- | --- | --- | --- | --- |
| `8` waves x `128` requests (`1,024` total) | `0.311ms` | `1.641ms` | `228.712ms` | `0.148 MB` | detached timeout/immediate probes stayed clean while the same process reused request handlers across all waves |

Warm-container certification read:

- `detachedLeakCount = 0`
- `globalResidualCount = 0`
- `globalStoreCountAfterRun = 0`
- `peakDeltaMb = 0.199`

This is a Node-process warm-container simulation, not a direct claim about every serverless provider's internal runtime lifecycle.

## Serverless Provider Model Certification

Dedicated results from `scripts/serverless-provider-certification.ts` as exercised on `2026-04-02`.

| Provider | Invocations | Detached Probes | Median | P95 | Retained Growth | Read |
| --- | --- | --- | --- | --- | --- | --- |
| `aws_lambda` | `96` | `192` | `0.103ms` | `0.203ms` | `2.411 MB` | warm Node handler model preserved request isolation with detached probe cleanup after every invocation |
| `vercel` | `96` | `192` | `1.308ms` | `1.480ms` | `0.275 MB` | render path stayed on `stroid/server`, then resumed safely through `stroid/server/portable` for the separate action boundary |
| `cloudflare_workers` | `96` | `0` | `1.192ms` | `1.296ms` | `0.122 MB` | explicit portable request scopes kept state off the global registry inside a warm worker-style isolate model |

Provider-model certification read:

- `aws_lambda.detachedLeakCount = 0`, `aws_lambda.globalResidualCount = 0`
- `vercel.detachedLeakCount = 0`, `vercel.globalResidualCount = 0`
- `cloudflare_workers.detachedLeakCount = 0`, `cloudflare_workers.globalResidualCount = 0`
- `totalInvocations = 288`

This is a local runtime-model certification, not a remote managed-platform deployment claim.

## React 18 Concurrency Certification

Dedicated results from `scripts/react-concurrency-benchmark.ts` as exercised on `2026-04-02`.

| Scenario | Runs | Updates / Run | Median | P95 | Average Renders | Read |
| --- | --- | --- | --- | --- | --- | --- |
| `useTransition` | `8` | `24` | `4.143ms` | `33.792ms` | `73` | multiple `useStore(...)` reads stayed coherent through transition-driven store updates, with final state settling at `count:24` |
| `useDeferredValue` | `8` | `24` | `3.717ms` | `10.054ms` | `73` | live and deferred store snapshots both preserved internal parity/label invariants across every update |

Concurrency certification read:

- `useTransition.invariantViolations = 0`
- `useDeferredValue.invariantViolations = 0`
- both scenarios ended at `{ value: 24, parity: "even", label: "count:24" }`
- the hook layer stayed on the existing `useSyncExternalStore` implementation; this section certifies that path rather than introducing a separate concurrent-specific hook implementation

## Next.js Server Actions Boundary Certification

Dedicated results from `scripts/next-server-actions-benchmark.ts` as exercised on `2026-04-02`.

| Load | Render Pair Median | Action Pair Median | Pair Median | Read |
| --- | --- | --- | --- | --- |
| `48` render/action pairs | `0.296ms` | `0.154ms` | `0.471ms` | render captures resumed cleanly inside separate action scopes without cross-request bleed |

Server-action certification read:

- `stateMismatchCount = 0`
- `crossCaptureBleedCount = 0`
- the certified path is `stroid/server` for render capture plus `stroid/server/portable` for the action boundary

## WebSocket Hydration Stream Certification

Dedicated results from `scripts/websocket-hydration-stream-benchmark.ts` as exercised on `2026-04-02`.

| Runs | Queued Before Close | Continued After Close | Median | P95 | Read |
| --- | --- | --- | --- | --- | --- |
| `24` | `6` sync frames | `4` sync frames | `6.535ms` | `7.206ms` | pre-close websocket-style sync writes queued and replayed in order, then post-close frames continued immediately without corrupting sequence |

WebSocket stream certification read:

- `mismatchCount = 0`
- `queuedWrites = 6`
- `replayedWrites = 6`
- this section certifies a long-lived `sync` stream across the manual close boundary, not only a short initial burst

## Hydration Randomized Certification

Dedicated results from `scripts/hydration-randomized-benchmark.ts` as exercised on `2026-04-02`.

| Policy | Runs | Ops / Run | Median | P95 | Read |
| --- | --- | --- | --- | --- | --- |
| `client_wins` | `6` | `36` | `26.154ms` | `63.581ms` | queued replay matched immediate execution exactly; all `36` writes queued and replayed |
| `server_wins` | `6` | `36` | `24.846ms` | `26.458ms` | every drift reverted to the hydrated baseline with exact event-order parity |
| `merge` | `6` | `36` | `24.970ms` | `26.058ms` | queued replay matched immediate custom-merge execution with `merged` drift resolution throughout |

Randomized certification read:

- `pairedRuns = 36`
- `mismatches = 0`
- `queuedWritesSeen = 36`
- `replayedWritesSeen = 36`

## Hydration Large-Payload Benchmark

Dedicated results from `scripts/hydration-large-payload-benchmark.ts` as exercised on `2026-04-02`.

| Target Size | Approx Bytes | Clone Median | Immediate Median | Queued Median | Retained Growth | Read |
| --- | --- | --- | --- | --- | --- | --- |
| `256 KB` | `262,551` | `0.336ms` | `86.011ms` | `79.148ms` | `7.375 MB` | parity held; `3` queued writes replayed correctly |
| `1,024 KB` | `1,048,881` | `1.210ms` | `779.936ms` | `791.965ms` | `15.493 MB` | parity held; clone cost stayed small relative to whole-write cost |
| `2,048 KB` | `2,097,591` | `2.489ms` | `2,958.211ms` | `2,963.113ms` | `19.224 MB` | parity held, but write cost becomes very visible at multi-MB state sizes |

Large-payload read:

- `mismatches = 0`
- default script sizes now stop at `2,048 KB` so the benchmark stays practical for routine reruns
- use `STROID_HYDRATION_LARGE_SIZES=256,1024,4096` (or another override) when you explicitly want a heavier stress tier

## SSR Isolation Certification

Detailed results from the expanded `scripts/ssr-isolation-benchmark.ts` as exercised again inside `npm run benchmark:guarantees`.

| Phase | Load | Median | P95 | Read |
| --- | --- | --- | --- | --- |
| Burst chaos A | `1,024` concurrent requests | `199.620ms` | `218.522ms` | seeded mixed async boundaries with request-local writes and controlled aborts |
| Burst chaos B | `1,024` concurrent requests | `175.425ms` | `190.808ms` | second seeded burst to avoid overfitting to one interleave shape |
| Sustained pressure | `8` waves x `1,024` concurrent (`8,192` total) | request `166.844ms`, wave `184.425ms` | request `199.227ms`, wave `210.578ms` | sustained throughput measured at `5,249.724 req/s` |
| Cross-request interleaving | `96` A/B pairs (`192` requests) | `6.823ms` | `6.988ms` | explicit pause-resume A/B mutation ordering with no contamination |
| Lifecycle escape | `512` requests, `1,536` detached probes | `32.137ms` | `39.955ms` | detached timeout/immediate/third-party callback probes saw no stale access |
| React streaming HTTP | `256` concurrent HTTP requests | response `91.202ms`, shell `0.085ms`, all-ready `5.197ms` | response `123.662ms`, shell `0.440ms`, all-ready `7.754ms` | local `http` server + `renderToPipeableStream` + nested `Suspense` waterfalls |
| Long-tail memory | `2,000` warmup + `50,000` measured cycles | batch `7.214ms` | batch `8.716ms` | slope `0.002 MB / 1k`, retained growth `-0.478 MB`, invariants stayed `0` |

Certification read:

- `foreignReadCount = 0`
- `contextMismatchCount = 0`
- `postLifecycleAccessSuccess = 0`
- `registryResidualCount = 0`
- `subscriberResidualCount = 0`
- `maxConcurrentCorrectnessViolations = 0`

## Cross-Library Comparison

### Single Write Average

All values are `singleAvgMs` from `scripts/compare-state-libraries.ts`.

| Subscribers | Stroid | Redux plain | Redux + Immer | Zustand |
| --- | --- | --- | --- | --- |
| `5,000` | `0.141ms` | `0.062ms` | `0.059ms` | `0.054ms` |
| `10,000` | `0.146ms` | `0.089ms` | `0.079ms` | `0.096ms` |
| `25,000` | `0.299ms` | `0.145ms` | `0.157ms` | `0.155ms` |
| `50,000` | `0.506ms` | `0.274ms` | `0.286ms` | `0.284ms` |
| `75,000` | `0.728ms` | `0.411ms` | `0.406ms` | `0.438ms` |

### 100 Write Batch Total

All values are `batch100Ms` from `scripts/compare-state-libraries.ts`.

| Subscribers | Stroid | Redux plain | Redux + Immer | Zustand |
| --- | --- | --- | --- | --- |
| `5,000` | `7.666ms` | `2.849ms` | `3.278ms` | `3.040ms` |
| `10,000` | `7.095ms` | `5.677ms` | `5.869ms` | `5.781ms` |
| `25,000` | `17.143ms` | `14.185ms` | `17.820ms` | `14.477ms` |
| `50,000` | `30.327ms` | `27.091ms` | `27.454ms` | `29.180ms` |
| `75,000` | `73.156ms` | `41.023ms` | `40.877ms` | `41.793ms` |

### Memory At 75K Subscribers

| Library | Heap Delta MB | Bytes / Subscriber |
| --- | --- | --- |
| Stroid | `6.518` | `91.127` |
| Redux plain | `7.143` | `99.869` |
| Redux + Immer | `7.523` | `105.183` |
| Zustand | `6.506` | `90.965` |

### Cross-Library Read

- fastest raw single-write result in this script: Redux plain at every measured subscriber count except the smallest bucket where Zustand was marginally faster
- smallest memory footprint at `75,000` subscribers in this script: Zustand by a narrow margin, with Stroid effectively adjacent
- the biggest practical gap is still delivery model: the Stroid measurement waits for its async flush to finish, while Redux and Zustand do not

## Stroid Scale Results

### Single-Store Subscriber Fanout

Selected rows from `npm run benchmark:subscriber`.

| Subscribers | Noop Median | Noop Batch100 | Compute Median | Compute Batch100 |
| --- | --- | --- | --- | --- |
| `10,000` | `0.121ms` | `7.771ms` | `0.143ms` | `10.323ms` |
| `50,000` | `0.517ms` | `32.049ms` | `0.654ms` | `43.482ms` |
| `100,000` | `1.066ms` | `65.992ms` | `1.236ms` | `125.715ms` |
| `200,000` | `1.941ms` | `214.948ms` | `2.389ms` | `256.455ms` |
| `250,000` | `2.530ms` | `252.156ms` | `3.044ms` | `318.475ms` |

### Stroid/Core Small-Range (100 To 10K)

Results from `npm run benchmark:core-small` on `2026-03-31` (`node v25.8.2`, `darwin`, `arm64`).

| Subscribers | Core Noop Median | Core Noop Batch100 | Core Compute Median | Core Compute Batch100 |
| --- | --- | --- | --- | --- |
| `100` | `0.072ms` | `2.225ms` | `0.019ms` | `1.377ms` |
| `500` | `0.029ms` | `2.544ms` | `0.034ms` | `2.076ms` |
| `1,000` | `0.043ms` | `2.943ms` | `0.053ms` | `2.838ms` |
| `2,500` | `0.081ms` | `3.894ms` | `0.077ms` | `4.332ms` |
| `5,000` | `0.116ms` | `5.734ms` | `0.152ms` | `6.821ms` |
| `7,500` | `0.156ms` | `6.841ms` | `0.165ms` | `8.382ms` |
| `10,000` | `0.116ms` | `11.814ms` | `0.147ms` | `10.251ms` |

Read note:

- this range intentionally focuses on smaller subscriber counts for `stroid/core`
- the `10,000` row is now firmly sub-millisecond on this machine even with end-to-end marker timing

### 250K Concurrent Fanout

Results from `npm run benchmark:subscriber:concurrent`.

| Scenario | Mode | Stores | Total Subscribers | Median | P95 | Peak Heap Delta MB |
| --- | --- | --- | --- | --- | --- | --- |
| `realtime-dashboard-concurrent` | `concurrent` | `5` | `250,000` | `1.666ms` | `3.376ms` | `19.552` |
| `ops-dashboard-atomic-batch` | `batch` | `10` | `250,000` | `1.766ms` | `3.014ms` | `15.872` |

### Selector Benchmark

Selected rows from `npm run benchmark:selector`.

| Subscribers | Raw Ms | Simple Selector Ms | Complex Selector Ms | Raw Heap MB | Simple Heap MB | Complex Heap MB |
| --- | --- | --- | --- | --- | --- | --- |
| `50,000` | `0.608` | `3.501` | `4.122` | `3.952` | `27.109` | `27.206` |
| `200,000` | `1.612` | `29.672` | `29.000` | `15.693` | `108.773` | `108.764` |
| `800,000` | `6.875` | `118.473` | `121.928` | `62.732` | `435.053` | `435.048` |

### Additional Script Outputs

| Script | Key Numeric Result |
| --- | --- |
| `npm run benchmark:deep-update` | deep path update at `250,000` subscribers: `1.656ms`; at `800,000`: `19.499ms` |
| `npm run benchmark:lifecycle` | at `100,000` subscribers: base `1.175ms`, hook `2.351ms`, middleware `1.285ms`, async helper `3.660ms` |

## Guarantee Results

Results from the serialized `npm run benchmark:guarantees` rerun captured before the new `benchmark:ssr-warm`, `benchmark:serverless-provider`, `benchmark:next-server-actions`, `benchmark:react-concurrency`, `benchmark:websocket-stream`, and `benchmark:hydration-randomized` additions were folded into the suite. Use the standalone sections above for the `2026-04-02` reruns of those newer certifications.

| Benchmark | Numeric Result | Status |
| --- | --- | --- |
| SSR isolation certification | `2 x 1,024` burst requests, `8,192` sustained requests at `5,249.724 req/s`, `256` React streaming HTTP requests, `50,000` memory cycles, all invariants `0` | Pass |
| Atomic rollback | `48` iterations, `36` forced rollbacks, `partialCommitCount = 0` | Pass |
| Race resistance | `24` waves x `80` ops, `0.956ms` median, `invariantViolations = 0`, `stateMismatchCount = 0` | Pass |
| Hydration divergence | `54` certified runs, `1,028` queued writes, `guaranteeBoundary = manual-close`, `unexpectedOutcomes = 0`, `invariantViolations = 0` | Pass |
| Determinism replay | `20` replays, `uniqueOutputCount = 1`, `23.152ms` median | Pass |
| Memory leak detection | `240` measured cycles, retained growth `2.517MB` | Pass |
| Governance lifecycle | `5` proposals, `1` rejected mutation, `previewCommitMismatchCount = 0` | Pass |

Guarantee read:

- the atomic benchmark intentionally forces rollbacks and logs warnings while proving `partialCommitCount = 0`
- the SSR suite now includes real React streaming HTTP lifecycle coverage instead of only synthetic request callbacks

## Commands Used

| Purpose | Command |
| --- | --- |
| Standalone SSR certification | `npm run benchmark:ssr-isolation` |
| Standalone SSR warm-container certification | `npm run benchmark:ssr-warm` |
| Serverless provider-model certification | `npm run benchmark:serverless-provider` |
| Next.js Server Actions boundary certification | `npm run benchmark:next-server-actions` |
| React 18 concurrency certification | `npm run benchmark:react-concurrency` |
| WebSocket hydration stream certification | `npm run benchmark:websocket-stream` |
| Cross-library compare | `npm run benchmark:compare` |
| Core small-range | `npm run benchmark:core-small` |
| Single-store fanout | `npm run benchmark:subscriber` |
| Concurrent fanout | `npm run benchmark:subscriber:concurrent` |
| Selector cost | `npm run benchmark:selector` |
| Deep path updates | `npm run benchmark:deep-update` |
| Lifecycle overhead | `npm run benchmark:lifecycle` |
| Hydration divergence certification | `npm run benchmark:hydration-divergence` |
| Hydration randomized certification | `npm run benchmark:hydration-randomized` |
| Hydration large-payload benchmark | `npm run benchmark:hydration-large-payload` |
| Guarantee suite | `npm run benchmark:guarantees` |
