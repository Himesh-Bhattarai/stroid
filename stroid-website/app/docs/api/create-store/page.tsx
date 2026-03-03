import {
  DocsH1,
  DocsH2,
  DocsParagraph,
  DocsCode,
  DocsInlineCode,
  DocsTable,
} from "@/components/docs/docs-content"

export const metadata = {
  title: "createStore - API Reference - stroid Docs",
  description: "API reference for stroid's createStore function.",
}

export default function CreateStoreAPIPage() {
  return (
    <article>
      <DocsH1 className="font-mono">createStore</DocsH1>
      <DocsParagraph>
        Registers a named store with initial state. Use <DocsInlineCode>setStore</DocsInlineCode> to
        mutate it and <DocsInlineCode>useStore</DocsInlineCode> or <DocsInlineCode>getStore</DocsInlineCode> to read it.
      </DocsParagraph>

      <DocsH2 id="signature">Signature</DocsH2>
      <DocsCode>{`function createStore<State>(
  name: string,
  initialState: State,
  options?: StoreOptions<State>
): void`}</DocsCode>

      <DocsH2 id="parameters">Parameters</DocsH2>
      <DocsTable
        headers={["Parameter", "Type", "Description"]}
        rows={[
          ["name", "string", "Unique store key. Calling createStore twice with the same name is a no-op."],
          ["initialState", "State", "Plain object representing the initial state snapshot."],
          ["options", "StoreOptions<State> (optional)", "Configuration for persistence, sync, DevTools, SSR behaviour, etc."],
        ]}
      />

      <DocsH2 id="return-value">Return value</DocsH2>
      <DocsParagraph>
        Returns <DocsInlineCode>void</DocsInlineCode>. Interact with the store via
        <DocsInlineCode>setStore</DocsInlineCode>, <DocsInlineCode>getStore</DocsInlineCode>, and
        <DocsInlineCode>useStore</DocsInlineCode>.
      </DocsParagraph>

      <DocsH2 id="example">Example</DocsH2>
      <DocsCode filename="example.ts">{`import { createStore, setStore, getStore, useStore } from 'stroid'

// Declare once
createStore('counter', { count: 0 }, { devtools: true, persist: { key: 'counter', driver: localStorage } })

// Update
export const increment = () =>
  setStore('counter', (d) => {
    d.count += 1
  })

// Read outside React
console.log(getStore('counter').count) // 0

// React component
export function Counter() {
  const count = useStore('counter', (s) => s.count)
  return <button onClick={increment}>Count: {count}</button>
}`}</DocsCode>
    </article>
  )
}
