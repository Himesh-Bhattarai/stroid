import {
  DocsH1,
  DocsH2,
  DocsParagraph,
  DocsCode,
  DocsTable,
} from "@/components/docs/docs-content"

export const metadata = {
  title: "setStore - API Reference - stroid Docs",
  description: "API reference for stroid's setStore function.",
}

export default function SetStoreAPIPage() {
  return (
    <article>
      <DocsH1 className="font-mono">setStore</DocsH1>
      <DocsParagraph>
        Imperatively updates a store{"'"}s state from outside an action. Useful for integrations,
        middleware, or non-component code.
      </DocsParagraph>

      <DocsH2 id="signature">Signatures</DocsH2>
      <DocsCode>{`// Mutator function
function setStore<T>(
  store: Store<T>,
  mutator: (draft: State<T>) => void
): void

// Partial state merge
function setStore<T>(
  store: Store<T>,
  partial: Partial<State<T>>
): void`}</DocsCode>

      <DocsH2 id="parameters">Parameters</DocsH2>
      <DocsTable
        headers={["Parameter", "Type", "Description"]}
        rows={[
          ["store", "Store<T>", "The store to update."],
          ["mutator", "(draft) => void", "A function that receives a mutable draft and modifies it."],
          ["partial", "Partial<State<T>>", "An object to shallow-merge into the current state."],
        ]}
      />

      <DocsH2 id="examples">Examples</DocsH2>
      <DocsCode filename="examples.ts">{`import { setStore } from 'stroid'
import { myStore } from './store'

// Using a mutator
setStore(myStore, (s) => {
  s.count = 0
  s.items = []
})

// Using partial merge
setStore(myStore, { count: 0 })

// Reset to initial state
setStore(myStore, myStore.initialState)

// Conditional updates
setStore(myStore, (s) => {
  if (s.count > 10) {
    s.count = 10  // cap at 10
  }
})`}</DocsCode>
    </article>
  )
}
