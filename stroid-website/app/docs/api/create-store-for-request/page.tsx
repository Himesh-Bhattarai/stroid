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
  title: "createStoreForRequest - API Reference - stroid Docs",
  description: "API reference for stroid's createStoreForRequest function for SSR.",
}

export default function CreateStoreForRequestAPIPage() {
  return (
    <article>
      <DocsH1 className="font-mono">createStoreForRequest</DocsH1>
      <DocsParagraph>
        Creates an isolated store instance scoped to a single server request. Essential for SSR
        to prevent state leaking between requests.
      </DocsParagraph>

      <DocsH2 id="signature">Signature</DocsH2>
      <DocsCode>{`function createStoreForRequest<T extends StoreDefinition>(
  definition: T
): Store<T>`}</DocsCode>

      <DocsH2 id="parameters">Parameters</DocsH2>
      <DocsTable
        headers={["Parameter", "Type", "Description"]}
        rows={[
          ["definition", "T extends StoreDefinition", "Same definition shape as createStore. Persistence and sync options are ignored in SSR."],
        ]}
      />

      <DocsCallout type="info">
        <DocsInlineCode>createStoreForRequest</DocsInlineCode> is identical to{" "}
        <DocsInlineCode>createStore</DocsInlineCode> in API, but it creates a fresh instance every
        time it{"'"}s called. This prevents state from one user{"'"}s request leaking into another{"'"}s.
      </DocsCallout>

      <DocsH2 id="example">Example</DocsH2>
      <DocsCode filename="app/page.tsx">{`import { createStoreForRequest, useStore } from 'stroid'

// Server Component
export default async function Page() {
  const store = createStoreForRequest({
    user: null as User | null,
    preferences: { theme: 'dark' },
  })

  // Populate on the server
  const user = await fetchUser()
  setStore(store, { user })

  return <ClientPage store={store} />
}

// Client Component
'use client'
function ClientPage({ store }) {
  const user = useStore(store, s => s.user)
  return <div>Hello, {user?.name}</div>
}`}</DocsCode>
    </article>
  )
}
