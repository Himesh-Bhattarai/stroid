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
| `stroid` | `createStore` | `browser` | 78.5 KiB -> 26.7 KiB | 23.6 KiB | Root public API barrel (broad surface) |
| `stroid/core` | `createStore` | `browser` | 78.0 KiB -> 26.5 KiB | 23.5 KiB | Core store primitives + lifecycle machinery |
| `stroid/psr` | `getTimingContract` | `browser` | 33.9 KiB -> 12.1 KiB | 10.9 KiB | PSR contract: snapshots, patch APIs, timing/graph |
| `stroid/query` | `reactQueryKey` | `browser` | 0.1 KiB -> 0.1 KiB | 0.1 KiB | Query-key helpers only |
| `stroid/runtime-tools` | `listStores` | `browser` | 28.7 KiB -> 10.1 KiB | 9.1 KiB | Observability helpers (meta/graph/health) |
| `stroid/runtime-admin` | `clearAllStores` | `browser` | 28.5 KiB -> 10.1 KiB | 9.0 KiB | Admin helpers (clear stores + async state) |
| `stroid/selectors` | `createSelector` | `browser` | 29.8 KiB -> 10.6 KiB | 9.5 KiB | Selector helpers |
| `stroid/computed` | `createComputed` | `browser` | 82.4 KiB -> 28.0 KiB | 24.7 KiB | Computed stores runtime |
| `stroid/helpers` | `createCounterStore` | `browser` | 79.6 KiB -> 26.9 KiB | 23.9 KiB | Convenience store helpers |
| `stroid/async` | `fetchStore` | `browser` | 78.0 KiB -> 26.6 KiB | 23.5 KiB | Fetch/cache/revalidate |
| `stroid/persist` | `installPersist` | `browser` | 21.9 KiB -> 7.2 KiB | 6.5 KiB | Persistence installer |
| `stroid/sync` | `installSync` | `browser` | 88.6 KiB -> 29.7 KiB | 26.3 KiB | BroadcastChannel sync installer |
| `stroid/devtools` | `installDevtools` | `browser` | 31.0 KiB -> 10.8 KiB | 9.7 KiB | History + devtools runtime |
| `stroid/feature` | `registerStoreFeature` | `browser` | 0.1 KiB -> 0.1 KiB | 0.1 KiB | Feature plugin API |
| `stroid/install` | `installAllFeatures` | `browser` | 105.6 KiB -> 34.3 KiB | 30.0 KiB | Convenience installer aggregator |
| `stroid/react` | `useStore` | `browser` | 34.4 KiB -> 12.2 KiB | 11.0 KiB | React hooks (react external) |
| `stroid/testing` | `resetAllStoresForTest` | `browser` | 29.2 KiB -> 10.3 KiB | 9.3 KiB | Testing helpers |
| `stroid/server/portable` | `createRequestScope` | `browser` | 86.9 KiB -> 29.2 KiB | 25.7 KiB | Explicit request-scope bridge (portable) |
| `stroid/server` | `createStoreForRequest` | `node` | 89.4 KiB -> 29.9 KiB | 26.3 KiB | AsyncLocalStorage SSR request scope (Node-only) |

Visual (gzip):

```text
stroid/install           34.3 KiB  ############################
stroid/server            29.9 KiB  ########################    
stroid/sync              29.7 KiB  ########################    
stroid/server/portable   29.2 KiB  ########################    
stroid/computed          28.0 KiB  #######################     
stroid/helpers           26.9 KiB  ######################      
stroid                   26.7 KiB  ######################      
stroid/async             26.6 KiB  ######################      
stroid/core              26.5 KiB  ######################      
stroid/react             12.2 KiB  ##########                  
stroid/psr               12.1 KiB  ##########                  
stroid/devtools          10.8 KiB  #########                   
stroid/selectors         10.6 KiB  #########                   
stroid/testing           10.3 KiB  ########                    
stroid/runtime-tools     10.1 KiB  ########                    
stroid/runtime-admin     10.1 KiB  ########                    
stroid/persist            7.2 KiB  ######                      
stroid/query              0.1 KiB                              
stroid/feature            0.1 KiB                              
```

Notes:
- These are *import-closure* sizes, not the size of `dist/*.js` files.
- The exact number varies with bundler settings; treat this as a consistent local baseline.

