// Stroid API reference in TSX form (copy/paste friendly for other tools)
// This is documentation only; no runtime logic is executed.

import React from "react";

export const StroidDocs: React.FC = () => (
  <div style={{ fontFamily: "monospace", lineHeight: 1.5 }}>
    <h1>stroid — API & Feature Guide</h1>

    <section>
      <h2>Core Store API</h2>
      <ul>
        <li>
          <strong>createStore(name, initialData, options?)</strong> – create a store with any JSON-serializable data.
          Options:
          <ul>
            <li><code>persist</code>: boolean | "localStorage" | "sessionStorage" | custom driver.</li>
            <li><code>schema</code>: zod/yup/JSON-schema/validator fn; blocks invalid state.</li>
            <li><code>version</code> &amp; <code>migrations</code>: number + map of version→(state) =&gt; state.</li>
            <li><code>devtools</code>: boolean; connects to Redux DevTools (with redaction).</li>
            <li><code>middleware</code>: array of functions receiving { action, name, prev, next, path }.</li>
            <li><code>validator</code>, <code>onSet</code>, <code>onReset</code>, <code>onDelete</code>, <code>onCreate</code>, <code>onError</code>.</li>
            <li><code>redactor</code>: scrub data before devtools/history/sync.</li>
            <li><code>historyLimit</code>: number (default 50) for change log.</li>
            <li><code>sync</code>: true or { channel?, conflictResolver? } for BroadcastChannel sync.</li>
          </ul>
        </li>
        <li><strong>setStore(name, keyOrData, value?)</strong> – update store.
          <ul>
            <li>Mutator: <code>setStore("user", draft =&gt; draft.count++)</code>.</li>
            <li>Object merge: <code>setStore("user", { theme: "dark" })</code>.</li>
            <li>Path set: <code>setStore("user", "profile.city", "SF")</code>.</li>
          </ul>
        </li>
        <li><strong>setStoreBatch(fn)</strong> – batch multiple updates into one notify.</li>
        <li><strong>getStore(name, path?)</strong> – read whole state or nested path.</li>
        <li><strong>deleteStore / resetStore / mergeStore</strong> – lifecycle ops (merge is shallow object-only).</li>
        <li><strong>clearAllStores()</strong> – remove everything.</li>
        <li><strong>hasStore / listStores / getStoreMeta</strong> – inspection helpers.</li>
        <li><strong>subscribeWithSelector(name, selector, equality?, listener)</strong> – granular subscription.</li>
      </ul>
    </section>

    <section>
      <h2>Selectors & Presets</h2>
      <ul>
        <li><strong>createSelector(storeName, fn)</strong> – memoized derived selector.</li>
        <li><strong>createCounterStore / createListStore / createEntityStore</strong> – quick-start store factories.</li>
        <li><strong>chain(storeName)</strong> – fluent getter/setter for nested paths.</li>
      </ul>
    </section>

    <section>
      <h2>Async Layer</h2>
      <ul>
        <li><strong>fetchStore(name, urlOrPromise, options?)</strong> – SWR-style fetch with TTL, dedupe, retry/backoff, abort signals, transform hooks.</li>
        <li><strong>refetchStore(name)</strong> – re-run last fetch config.</li>
        <li><strong>getAsyncMetrics()</strong> – cache hits/misses, dedupes, requests, failures, avg/last ms.</li>
      </ul>
    </section>

    <section>
      <h2>React Hooks</h2>
      <ul>
        <li><strong>useStore(name, path?)</strong> – subscribe to store or path.</li>
        <li><strong>useSelector(name, selector, equality?)</strong> – selector subscription with custom equality.</li>
        <li><strong>useAsyncStore(name)</strong> – returns { data, loading, error, status, isEmpty }.</li>
        <li><strong>useStoreStatic(name, path?)</strong> – read without subscribing (SSR/RSC friendly).</li>
        <li><strong>useFormStore(name, field)</strong> – value/onChange binding for inputs.</li>
        <li><strong>useStoreField(name, field)</strong> – alias of useStore for a single path.</li>
      </ul>
    </section>

    <section>
      <h2>Persistence & Integrity</h2>
      <ul>
        <li>Drivers: localStorage, sessionStorage, custom (must expose getItem/setItem/removeItem).</li>
        <li>Envelope: stores version + checksum; failed checksum resets to initial state.</li>
        <li>Migrations: applied in order when persisted version &lt; current.</li>
        <li>Redaction: <code>redactor(state)</code> scrubs data for devtools/history/sync/persist logs.</li>
      </ul>
    </section>

    <section>
      <h2>Sync & Conflict Resolution</h2>
      <ul>
        <li><strong>sync: true</strong> – BroadcastChannel last-write-wins across tabs.</li>
        <li><strong>sync: { channel, conflictResolver }</strong> – custom channel; conflictResolver receives { local, incoming, localUpdated, incomingUpdated } and returns resolved state or undefined to keep local.</li>
      </ul>
    </section>

    <section>
      <h2>DevTools, History, Metrics</h2>
      <ul>
        <li>Redux DevTools bridge; redaction supported.</li>
        <li>History log (diff, prev/next, timestamp) with <strong>getHistory(name, limit?)</strong> and <strong>clearHistory(name?)</strong>.</li>
        <li>Notify timing metrics via <strong>getMetrics(name)</strong>.</li>
      </ul>
    </section>

    <section>
      <h2>SSR / RSC</h2>
      <ul>
        <li><strong>createStoreForRequest(initializer)</strong>: build per-request stores server-side, then <strong>snapshot()</strong> to JSON.</li>
        <li><strong>hydrateStores(snapshot, options?)</strong>: client-side hydration (or per-request server reuse).</li>
        <li>Use <strong>useStoreStatic</strong> in RSC to read without subscriptions.</li>
        <li>Avoid global singletons across requests; prefer per-request factories.</li>
      </ul>
    </section>

    <section>
      <h2>Zustand Compatibility</h2>
      <ul>
        <li><strong>createZustandCompatStore((set, get, api) =&gt; initial, options?)</strong> – exposes setState/getState/subscribe/subscribeWithSelector/destroy.</li>
        <li>Supports middleware equivalents via core options (persist, devtools, immer-like mutators via draft setters).</li>
      </ul>
    </section>

    <section>
      <h2>Testing & Bench</h2>
      <ul>
        <li><strong>createMockStore</strong>, <strong>withMockedTime</strong>, <strong>resetAllStoresForTest</strong>.</li>
        <li><strong>benchmarkStoreSet(name, iterations?, makeUpdate?)</strong> – micro-benchmark setter throughput.</li>
      </ul>
    </section>

    <section>
      <h2>Quick Reference Snippets</h2>
      <pre>{`// Create + persist + schema
createStore("user", { name: "Alex" }, {
  persist: true,
  schema: z.object({ name: z.string() }),
  version: 2,
  migrations: { 2: (s) => ({ ...s, verified: false }) },
  redactor: (s) => ({ ...s, token: undefined }),
});

// Mutator + batch
setStoreBatch(() => {
  setStore("user", d => { d.count = (d.count ?? 0) + 1; });
  setStore("user", "theme", "light");
});

// Async with SWR/TTL
await fetchStore("todos", "/api/todos", { ttl: 30000, staleWhileRevalidate: true });

// SSR hydration
const reqStore = createStoreForRequest(api => api.create("cart", { items: [] }));
const snapshot = reqStore.snapshot(); // send to client
hydrateStores(snapshot);

// Realtime sync with custom resolver
createStore("cart", { items: [] }, {
  sync: { conflictResolver: ({ local, incoming }) => incoming.items.length >= local.items.length ? incoming : local }
});`}</pre>
    </section>
  </div>
);

export default StroidDocs;
