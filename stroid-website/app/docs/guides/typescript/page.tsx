import {
  DocsH1,
  DocsH2,
  DocsParagraph,
  DocsCode,
  DocsInlineCode,
  DocsCallout,
} from "@/components/docs/docs-content"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export const metadata = {
  title: "TypeScript - Guides - stroid Docs",
  description: "Advanced TypeScript patterns and best practices for stroid.",
}

export default function TypeScriptGuidePage() {
  return (
    <article>
      <DocsH1>TypeScript Guide</DocsH1>
      <DocsParagraph>
        stroid is TypeScript-first. Types flow from <DocsInlineCode>createStore</DocsInlineCode> into
        <DocsInlineCode>setStore</DocsInlineCode>, <DocsInlineCode>useStore</DocsInlineCode>, and
        <DocsInlineCode>getStore</DocsInlineCode> without manual generics in most cases.
      </DocsParagraph>

      <DocsH2 id="define">Define a typed store</DocsH2>
      <DocsParagraph>
        Add an explicit state type so inference stays precise.
      </DocsParagraph>
      <DocsCode filename="store.ts">{`import { createStore, setStore, useStore } from 'stroid'

type Todo = { id: number; text: string; done: boolean }
type TodoState = { items: Todo[]; filter: 'all' | 'active' | 'done' }

createStore<TodoState>('todos', { items: [], filter: 'all' })

export function addTodo(text: string) {
  setStore('todos', (d) => {
    d.items.push({ id: Date.now(), text, done: false })
  })
}`}</DocsCode>

      <DocsH2 id="selectors">Selectors stay typed</DocsH2>
      <DocsParagraph>
        <DocsInlineCode>useStore</DocsInlineCode> infers the selector return type automatically.
      </DocsParagraph>
      <DocsCode filename="component.tsx">{`const count = useStore('todos', (s) => s.items.length) // number
const filter = useStore('todos', (s) => s.filter)       // 'all' | 'active' | 'done'`}</DocsCode>

      <DocsH2 id="path-helpers">Path helpers</DocsH2>
      <DocsParagraph>
        Utilities from <DocsInlineCode>stroid/core</DocsInlineCode> help with deep paths.
      </DocsParagraph>
      <DocsCode filename="paths.ts">{`import type { Path, PathValue } from 'stroid/core'
type State = TodoState

type AllPaths = Path<State>                  // "items" | "filter" | "items.0" | ...
type FilterValue = PathValue<State, 'filter'>  // 'all' | 'active' | 'done'`}</DocsCode>

      <DocsCallout type="tip">
        Prefer explicit types on arrays/unions in initial state (e.g.,
        <DocsInlineCode>[] as Todo[]</DocsInlineCode>) so inference has full information.
      </DocsCallout>

    </article>
  )
}
