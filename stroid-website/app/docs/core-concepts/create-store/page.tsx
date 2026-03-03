import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DocsH1,
  DocsH2,
  DocsH3,
  DocsParagraph,
  DocsCode,
  DocsInlineCode,
  DocsCallout,
} from "@/components/docs/docs-content"

export const metadata = {
  title: "createStore - Core Concepts - stroid Docs",
  description: "Learn how to create and configure stores with stroid's createStore API.",
}

export default function CreateStorePage() {
  return (
    <article>
      <DocsH1>createStore</DocsH1>
      <DocsParagraph>
        <DocsInlineCode>createStore(name, initialState, options?)</DocsInlineCode> registers a named
        store. State is plain data; updates are performed later with <DocsInlineCode>setStore</DocsInlineCode>.
      </DocsParagraph>

      <DocsH2 id="basic-usage">Basic usage</DocsH2>
      <DocsCode filename="store.ts">{`import { createStore } from 'stroid'

// Declare once at module scope
createStore('profile', {
  name: 'Alex',
  theme: 'dark',
})`}</DocsCode>

      <DocsCallout type="tip">
        Call <DocsInlineCode>createStore</DocsInlineCode> exactly once per store name (module scope
        is best). Re-calling with the same name is a no-op that preserves state.
      </DocsCallout>

      <DocsH2 id="update">Updating state</DocsH2>
      <DocsParagraph>
        Mutate through <DocsInlineCode>setStore</DocsInlineCode>. Drafts are mutable; stroid handles
        structural sharing under the hood.
      </DocsParagraph>
      <DocsCode filename="update.ts">{`import { setStore } from 'stroid'

// Object merge
setStore('profile', { theme: 'light' })

// Draft mutation
setStore('profile', (d) => {
  d.name = 'Jordan'
})`}</DocsCode>

      <DocsH2 id="options">Options</DocsH2>
      <DocsParagraph>
        Pass options as the third argument. Common ones: persistence, sync, DevTools, SSR controls.
      </DocsParagraph>
      <DocsCode filename="options.ts">{`import { createStore } from 'stroid'

createStore(
  'settings',
  { theme: 'dark', language: 'en' },
  {
    persist: { key: 'settings', driver: localStorage },
    sync: true,               // cross-tab BroadcastChannel
    devtools: true,           // Redux DevTools
    historyLimit: 50,
  }
)`}</DocsCode>

      <DocsH2 id="ssr">SSR</DocsH2>
      <DocsParagraph>
        In production servers, <DocsInlineCode>createStore</DocsInlineCode> is blocked to prevent
        cross-request leaks. Use <DocsInlineCode>createStoreForRequest</DocsInlineCode> per request,
        or pass <DocsInlineCode>{`{ allowSSRGlobalStore: true }`}</DocsInlineCode> only if you truly
        want a global store on the server.
      </DocsParagraph>

    
    </article>
  )
}
