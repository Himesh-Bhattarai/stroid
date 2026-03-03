import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DocsH1,
  DocsH2,
  DocsParagraph,
  DocsCode,
  DocsInlineCode,
  DocsCallout,
} from "@/components/docs/docs-content"

export const metadata = {
  title: "useStore & Selectors - Core Concepts - stroid Docs",
  description: "Learn how to subscribe to state with selectors in stroid.",
}

export default function UseStorePage() {
  return (
    <article>
      <DocsH1>useStore & Selectors</DocsH1>
      <DocsParagraph>
        <DocsInlineCode>useStore(name, selector?)</DocsInlineCode> subscribes a component to a named
        store. The selector keeps re-renders minimal by choosing only what the component needs.
      </DocsParagraph>

      <DocsH2 id="basic-selector">Basic Selector</DocsH2>
      <DocsCode filename="Component.tsx">{`import { useStore } from 'stroid'

function TodoCount() {
  // Only re-renders when todos length changes
  const count = useStore('todos', (s) => s.items.length)
  return <span>Todos: {count}</span>
}

function TodoList() {
  const todos = useStore('todos', (s) => s.items)
  return <ul>{todos.map((t) => <li key={t.id}>{t.text}</li>)}</ul>
}`}</DocsCode>

      <DocsCallout type="tip">
        Always select the smallest piece of state your component needs. Selecting the entire store
        object will cause re-renders on every state change.
      </DocsCallout>

      <DocsH2 id="multiple-values">Selecting multiple values</DocsH2>
      <DocsParagraph>
        Return an object to select more than one field. Objects use shallow comparison by default.
      </DocsParagraph>
      <DocsCode filename="multiple.tsx">{`function TodoHeader() {
  const { count, filter } = useStore('todos', (s) => ({
    count: s.items.length,
    filter: s.filter,
  }))

  return <h1>{filter} ({count})</h1>
}`}</DocsCode>

      <DocsH2 id="equality">Custom Equality</DocsH2>
      <DocsParagraph>
        Pass a custom equality function as the third argument when needed.
      </DocsParagraph>
      <DocsCode filename="equality.tsx">{`import { shallow } from 'stroid'

// Shallow comparison (default for objects)
const data = useStore('settings', (s) => ({ theme: s.theme, lang: s.language }), shallow)

// Custom comparison
const custom = useStore('todos', (s) => s.items, (a, b) =>
  a.length === b.length && a.every((item, i) => item.id === b[i].id)
)`}</DocsCode>

      <DocsH2 id="outside-react">Outside React</DocsH2>
      <DocsParagraph>
        For non-React code, call <DocsInlineCode>getStore</DocsInlineCode> and
        <DocsInlineCode>setStore</DocsInlineCode> directly.
      </DocsParagraph>
      <DocsCode filename="outside.ts">{`import { getStore, setStore } from 'stroid'

const todos = getStore('todos') // snapshot

setStore('todos', (d) => {
  d.items.push({ id: Date.now(), text: 'Write docs', done: false })
})`}</DocsCode>

     
    </article>
  )
}
