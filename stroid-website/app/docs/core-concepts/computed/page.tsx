import Link from "next/link"
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
  title: "Computed Values - Core Concepts - stroid Docs",
  description: "Learn how to derive computed values from store state in stroid.",
}

export default function ComputedPage() {
  return (
    <article>
      <DocsH1>Computed Values</DocsH1>
      <DocsParagraph>
        stroid does not ship a special “computed” primitive. Derive values in selectors or compute
        them once and store them yourself. This keeps the core small and predictable.
      </DocsParagraph>

      <DocsH2 id="selectors">Derive in selectors</DocsH2>
      <DocsParagraph>
        Most cases are covered by selectors passed to <DocsInlineCode>useStore</DocsInlineCode>.
        The selector runs only when the referenced slice changes.
      </DocsParagraph>
      <DocsCode filename="CartSummary.tsx">{`import { useStore } from 'stroid'

function CartSummary() {
  const { total, count } = useStore('cart', (s) => ({
    count: s.items.length,
    total: s.items.reduce((sum, i) => sum + i.price, 0),
  }))

  return (
    <div>
      <p>Items: {count}</p>
      <p>Total: \${total.toFixed(2)}</p>
    </div>
  )
}`}</DocsCode>

      <DocsH2 id="precompute">Precompute and store</DocsH2>
      <DocsParagraph>
        If you need the derived value elsewhere (e.g., persistence, cross-tab sync), compute it
        inside <DocsInlineCode>setStore</DocsInlineCode> and store it alongside the source data.
      </DocsParagraph>
      <DocsCode filename="cart-store.ts">{`import { createStore, setStore } from 'stroid'

createStore('cart', { items: [], total: 0 })

export function addItem(item: Item) {
  setStore('cart', (d) => {
    d.items.push(item)
    d.total = d.items.reduce((sum, i) => sum + i.price, 0)
  })
}`}</DocsCode>

      <DocsCallout type="tip">
        Keep selectors small and pure. If a derived value is expensive, memoize it in userland with
        <DocsInlineCode>useMemo</DocsInlineCode> or store it during updates as shown above.
      </DocsCallout>

     
    </article>
  )
}
