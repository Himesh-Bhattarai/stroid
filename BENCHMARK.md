# Benchmark Report

**Run date:** 2026-03-16 (Asia/Katmandu)  
**Runs:** 3 (averaged)  
**Command:** `node --expose-gc --import tsx -e "import './src/devtools.ts'; await import('./scripts/compare-state-libraries.ts');"`

## Environment

- Node: `v22.14.0`
- Platform: `win32` / `x64`
- Counts: `50k`, `100k`, `200k`, `800k` subscribers
- GC: enabled (`--expose-gc`)

## Notes

- Stroid numbers are measured end-to-end until its **async notification flush** reaches a marker subscriber.
- Redux and Zustand numbers are **synchronous** inside dispatch/setState.
- Devtools feature is imported for the benchmark run because the script uses `devtools: { historyLimit: 0 }`.
- These are **microbenchmarks** intended for comparison, not absolute performance claims.

## Results (Average of 3 runs)

### Subscribers: 50000

| Library | singleAvgMs | batch100Ms | heapDeltaMb | bytesPerSubscriber |
|---|---|---|---|---|
| redux-immer | 1.519 | 161.171 | 4.426 | 92.818 |
| redux-plain | 1.886 | 103.339 | 4.433 | 92.962 |
| stroid | 3.923 | 124.567 | 3.945 | 82.724 |
| zustand | 1.754 | 113.108 | 3.93 | 82.425 |

### Subscribers: 100000

| Library | singleAvgMs | batch100Ms | heapDeltaMb | bytesPerSubscriber |
|---|---|---|---|---|
| redux-immer | 2.079 | 194.528 | 8.846 | 92.757 |
| redux-plain | 2.581 | 203.027 | 8.867 | 92.974 |
| stroid | 10.583 | 258.839 | 7.846 | 82.273 |
| zustand | 3.112 | 237.108 | 7.857 | 82.388 |

### Subscribers: 200000

| Library | singleAvgMs | batch100Ms | heapDeltaMb | bytesPerSubscriber |
|---|---|---|---|---|
| redux-immer | 3.936 | 380.346 | 17.725 | 92.928 |
| redux-plain | 4.988 | 384.352 | 17.703 | 92.816 |
| stroid | 13.084 | 429.693 | 15.687 | 82.245 |
| zustand | 4.672 | 402.949 | 15.701 | 82.318 |

### Subscribers: 800000

| Library | singleAvgMs | batch100Ms | heapDeltaMb | bytesPerSubscriber |
|---|---|---|---|---|
| redux-immer | 14.907 | 1483.248 | 70.768 | 92.757 |
| redux-plain | 17.308 | 1618.298 | 70.746 | 92.729 |
| stroid | 40.127 | 1520.049 | 62.724 | 82.214 |
| zustand | 17.851 | 1894.376 | 62.741 | 82.235 |
