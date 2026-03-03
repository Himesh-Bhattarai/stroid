import {
  DocsH1,
  DocsH2,
  DocsParagraph,
  DocsCode,
  DocsInlineCode,
  DocsTable,
  DocsCallout,
} from "@/components/docs/docs-content"

export const metadata = {
  title: "useStore - API Reference - stroid Docs",
  description: "API reference for stroid's useStore hook.",
}

export default function UseStoreAPIPage() {
  return (
    <article>
      <DocsH1 className="font-mono">useStore</DocsH1>
      <DocsParagraph>
        A React hook that subscribes a component to a store. The component re-renders only
        when the selected value changes.
      </DocsParagraph>

      <DocsH2 id="signature">Signature</DocsH2>
      <DocsCode>{`function useStore<T, R>(
  store: Store<T>,
  selector: (state: FullState<T>) => R,
  equalityFn?: (a: R, b: R) => boolean
): R`}</DocsCode>

      <DocsH2 id="parameters">Parameters</DocsH2>
      <DocsTable
        headers={["Parameter", "Type", "Description"]}
        rows={[
          ["store", "Store<T>", "The store to subscribe to, created by createStore."],
          ["selector", "(state) => R", "Function that extracts the desired value from the store state."],
          ["equalityFn", "((a: R, b: R) => boolean) (optional)", "Custom equality function. Default: Object.is for primitives, shallow comparison for objects."],
        ]}
      />

      <DocsH2 id="return-value">Return Value</DocsH2>
      <DocsParagraph>
        Returns the value produced by the selector. The type is fully inferred from the selector
        return type.
      </DocsParagraph>

      <DocsH2 id="examples">Examples</DocsH2>
      <DocsCode filename="primitives.tsx">{`// Selecting a primitive value
const count = useStore(store, s => s.count)
// Type: number — uses Object.is for comparison

// Selecting an object (uses shallow comparison)
const { name, email } = useStore(store, s => ({
  name: s.name,
  email: s.email,
}))

// Selecting an action (stable reference, never causes re-render)
const increment = useStore(store, s => s.increment)

// Custom equality
const items = useStore(store, s => s.items, (a, b) => 
  a.length === b.length
)`}</DocsCode>

      <DocsCallout type="tip">
        For best performance, keep selectors as focused as possible. Prefer{" "}
        <DocsInlineCode>{"s => s.count"}</DocsInlineCode> over <DocsInlineCode>{"s => s"}</DocsInlineCode>.
        Selecting the entire state object causes re-renders on every change.
      </DocsCallout>

      <DocsH2 id="built-in-equality">Built-in Equality Functions</DocsH2>
      <DocsCode filename="equality.ts">{`import { shallow, deep } from 'stroid'

// Shallow comparison — compares object keys one level deep
const data = useStore(store, s => ({ a: s.a, b: s.b }), shallow)

// Deep comparison — recursively compares nested structures
const nested = useStore(store, s => s.deeply.nested, deep)`}</DocsCode>
    </article>
  )
}
