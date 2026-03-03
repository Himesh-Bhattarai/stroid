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
  title: "setStore & Mutations - Core Concepts - stroid Docs",
  description: "Learn how stroid handles state mutations with mutable draft syntax.",
}

export default function SetStorePage() {
  return (
    <article>
      <DocsH1>setStore & Mutations</DocsH1>
      <DocsParagraph>
        stroid lets you write state mutations with natural, mutable syntax via
        <DocsInlineCode>setStore</DocsInlineCode>. Drafts feel mutable; under the hood stroid creates
        immutable updates so React detects changes and re-renders only what changed.
      </DocsParagraph>

      <DocsH2 id="mutable-drafts">Mutable Drafts</DocsH2>
      <DocsParagraph>
        The updater receives a mutable draft of the current state. Push to arrays, reassign fields,
        remove keys — write the code you want.
      </DocsParagraph>
      <DocsCode filename="mutations.ts">{`import { createStore, setStore } from 'stroid'

createStore('users', { list: [] as User[] })

export function addUser(user: User) {
  setStore('users', (s) => {
    s.list.push(user)          // Array.push works
  })
}

export function removeUser(id: string) {
  setStore('users', (s) => {
    s.list = s.list.filter((u) => u.id !== id)  // Reassignment works
  })
}

export function updateName(id: string, name: string) {
  setStore('users', (s) => {
    const user = s.list.find((u) => u.id === id)
    if (user) user.name = name  // Nested mutation works
  })
}`}</DocsCode>

      <DocsH2 id="set-store-api">setStore API</DocsH2>
      <DocsParagraph>
        Two call styles are available: a partial object merge, or a draft mutator.
      </DocsParagraph>
      <DocsCode filename="set-store.ts">{`import { setStore } from 'stroid'

// Partial merge (shallow)
setStore('settings', { theme: 'light' })

// Draft mutation
setStore('settings', (s) => {
  s.flags.beta = true
})`}</DocsCode>

      <DocsCallout type="info">
        <DocsInlineCode>setStore</DocsInlineCode> can be called from anywhere — React components,
        utilities, async functions. No provider is required; the store is keyed by name.
      </DocsCallout>

      <DocsH2 id="batching">Automatic Batching</DocsH2>
      <DocsParagraph>
        Multiple mutations within one <DocsInlineCode>setStore</DocsInlineCode> call are batched into
        a single notification. Subscribers only see the final state:
      </DocsParagraph>
      <DocsCode filename="batching.ts">{`import { createStore, setStore } from 'stroid'

createStore('metrics', { a: 0, b: 0, c: 0 })

setStore('metrics', (s) => {
  s.a = 1  // batched
  s.b = 2  // batched
  s.c = 3  // subscribers notified once
})`}</DocsCode>

      
    </article>
  )
}
