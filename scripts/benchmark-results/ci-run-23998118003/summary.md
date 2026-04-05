# Benchmark Comparison

- Baseline: `/home/runner/work/stroid/stroid/scripts/benchmark-results/baseline.json`
- Latest: `/home/runner/work/stroid/stroid/scripts/benchmark-results/latest.json`
- Threshold: 80.00% of baseline ops/sec

| Benchmark | Library | Baseline ops/sec | Latest ops/sec | Ratio | Status |
|---|---:|---:|---:|---:|---|
| create_store_10000 | stroid | 13478.31 | 26993.96 | 200.28% | ok |
| create_store_10000 | zustand | 425056.21 | 798313.39 | 187.81% | ok |
| create_store_10000 | jotai | 39576.72 | 112111.83 | 283.28% | ok |
| set_primitive_100000 | stroid | 25453.41 | 62948.68 | 247.31% | ok |
| set_primitive_100000 | zustand | 1274003.82 | 2920670.70 | 229.25% | ok |
| set_primitive_100000 | jotai | 175043.61 | 508062.17 | 290.25% | ok |
| set_deep_10000 | stroid | 15858.01 | 30496.46 | 192.31% | ok |
| set_deep_10000 | zustand | 593376.73 | 677809.03 | 114.23% | ok |
| set_deep_10000 | jotai | 132427.35 | 197503.46 | 149.14% | ok |
| selector_irrelevant_update_10000 | stroid | 19691.76 | 49938.61 | 253.60% | ok |
| selector_irrelevant_update_10000 | zustand | 927721.24 | 1891180.71 | 203.85% | ok |
| selector_irrelevant_update_10000 | jotai | 62625.72 | 155896.79 | 248.93% | ok |
| persist_cycle_1000 | stroid | 82.46 | 732.11 | 887.80% | ok |
| broadcast_dispatch_receive_10000 | stroid | 29667.18 | 82021.15 | 276.47% | ok |
| async_ttl_100_concurrent_x_100_rounds | stroid | 5823.70 | 21909.05 | 376.21% | ok |
