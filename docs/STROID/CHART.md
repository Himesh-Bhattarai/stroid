# Bundle Size Chart

Generated: 2026-04-02
Node: v24.14.1 (darwin arm64)
esbuild: 0.27.3

Method:
- Built `dist/` output (self-import via package `exports`).
- Bundled with esbuild as minified ESM (`target=es2020`).
- Reported as bundle-closure size (what gets pulled into an app bundle).
- `react` and `react-dom` are externalized (peer deps).



Table:

| Entrypoint | Probe | Platform | Minified -> Gzip | Brotli | Notes |
| --- | --- | --- | ---: | ---: | --- |
| `stroid` | `createStore` | `browser` | 78.1 KiB -> 26.6 KiB | 23.5 KiB | Root public API barrel (broad surface) |
| `stroid/core` | `createStore` | `browser` | 77.6 KiB -> 26.3 KiB | 23.3 KiB | Core store primitives + lifecycle machinery |
| `stroid/psr` | `getTimingContract` | `browser` | 33.9 KiB -> 12.1 KiB | 10.9 KiB | PSR contract: snapshots, patch APIs, timing/graph |
| `stroid/query` | `reactQueryKey` | `browser` | 0.1 KiB -> 0.1 KiB | 0.1 KiB | Query-key helpers only |
| `stroid/runtime-tools` | `listStores` | `browser` | 28.7 KiB -> 10.1 KiB | 9.0 KiB | Observability helpers (meta/graph/health) |
| `stroid/runtime-admin` | `clearAllStores` | `browser` | 28.5 KiB -> 10.0 KiB | 9.1 KiB | Admin helpers (clear stores + async state) |
| `stroid/selectors` | `createSelector` | `browser` | 29.8 KiB -> 10.5 KiB | 9.5 KiB | Selector helpers |
| `stroid/computed` | `createComputed` | `browser` | 82.0 KiB -> 27.8 KiB | 24.5 KiB | Computed stores runtime |
| `stroid/helpers` | `createCounterStore` | `browser` | 79.1 KiB -> 26.8 KiB | 23.7 KiB | Convenience store helpers |
| `stroid/async` | `fetchStore` | `browser` | 77.6 KiB -> 26.4 KiB | 23.4 KiB | Fetch/cache/revalidate |
| `stroid/persist` | `installPersist` | `browser` | 21.8 KiB -> 7.2 KiB | 6.5 KiB | Persistence installer |
| `stroid/sync` | `installSync` | `browser` | 88.1 KiB -> 29.5 KiB | 26.1 KiB | BroadcastChannel sync installer |
| `stroid/devtools` | `installDevtools` | `browser` | 31.0 KiB -> 10.8 KiB | 9.7 KiB | History + devtools runtime |
| `stroid/feature` | `registerStoreFeature` | `browser` | 0.1 KiB -> 0.1 KiB | 0.1 KiB | Feature plugin API |
| `stroid/install` | `installAllFeatures` | `browser` | 105.1 KiB -> 34.0 KiB | 29.8 KiB | Convenience installer aggregator |
| `stroid/react` | `useStore` | `browser` | 33.3 KiB -> 11.9 KiB | 10.7 KiB | React hooks (react external) |
| `stroid/testing` | `resetAllStoresForTest` | `browser` | 29.1 KiB -> 10.3 KiB | 9.3 KiB | Testing helpers |
| `stroid/server/portable` | `createRequestScope` | `browser` | 86.5 KiB -> 29.0 KiB | 25.6 KiB | Explicit request-scope bridge (portable) |
| `stroid/server` | `createStoreForRequest` | `node` | 89.0 KiB -> 29.7 KiB | 26.2 KiB | AsyncLocalStorage SSR request scope (Node-only) |

Visual (gzip):

```text
stroid/install           34.0 KiB  ############################
stroid/server            29.7 KiB  ########################    
stroid/sync              29.5 KiB  ########################    
stroid/server/portable   29.0 KiB  ########################    
stroid/computed          27.8 KiB  #######################     
stroid/helpers           26.8 KiB  ######################      
stroid                   26.6 KiB  ######################      
stroid/async             26.4 KiB  ######################      
stroid/core              26.3 KiB  ######################      
stroid/psr               12.1 KiB  ##########                  
stroid/react             11.9 KiB  ##########                  
stroid/devtools          10.8 KiB  #########                   
stroid/selectors         10.5 KiB  #########                   
stroid/testing           10.3 KiB  ########                    
stroid/runtime-tools     10.1 KiB  ########                    
stroid/runtime-admin     10.0 KiB  ########                    
stroid/persist            7.2 KiB  ######                      
stroid/query              0.1 KiB                              
stroid/feature            0.1 KiB                              
```

Notes:
- These are *import-closure* sizes, not the size of `dist/*.js` files.
- The exact number varies with bundler settings; treat this as a consistent local baseline.

## The Stroid Tradeoff: Correctness Over Micro-Optimization

Stroid is intentionally larger than a bare-bones state container. This is a deliberate architectural choice. While other libraries focus on being as small as possible, Stroid focuses on being as **reliable** as possible.

### Why the extra KBs?
1.  **Integrated Ecosystem:** If you take a minimal library and manually add persistence, cross-tab synchronization, and async caching, your final bundle will often meet or exceed Stroid's size. Stroid provides these as a unified, as well as trusted in production(not any production case study because no community support, i will build after my assignmment finished toward system).
2.  **Deterministic Runtime:** We ship a robust internal registry and lifecycle engine. This ensures that state transitions are predictable, even in complex SSR and concurrent React environments.
3.  **Production Safety:** A bug in state synchronization can cost real money in production. We prioritize data integrity and "correctness-by-design" over shaving off a few kilobytes.

### Our Philosophy
If your primary constraint is the absolute smallest bundle size for a simple site, Stroid may not be the right fit. However, if you are building a **mission-critical application** where data safety, deterministic replay, and a single mental model are paramount, Stroid is built for you.

We respect the developer's need for performance, and we continue to optimize our tree-shaking and internal structures. But we will never compromise on the **guarantees** that keep your production environment stable.

**In short: We choose correctness and trust. Because while performance can be optimized later, a lost state or a race condition in production is a cost no company wants to pay nither i want to give those cost to you.**


- It's very painful to write. 
                                                         -Himesh Chanchal Bhattarai

---
