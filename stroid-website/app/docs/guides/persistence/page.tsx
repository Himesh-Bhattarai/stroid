import {
  DocsH1,
  DocsH2,
  DocsParagraph,
  DocsCode,
  DocsInlineCode,
  DocsCallout,
  DocsTable,
} from "@/components/docs/docs-content"

export const metadata = {
  title: "Persistence & Sync - Guides - stroid Docs",
  description: "Persist state to storage and sync across browser tabs with stroid.",
}

export default function PersistenceGuidePage() {
  return (
    <article>
      <DocsH1>Persistence & Sync</DocsH1>
      <DocsParagraph>
        stroid includes built-in persistence and cross-tab synchronization — no middleware or plugins
        required. Add a single config option and your state survives page refreshes and stays in sync
        across tabs.
      </DocsParagraph>
      <DocsCallout type="warning">
        Examples reflect the current API: stores are named (<DocsInlineCode>createStore('name', state, options)</DocsInlineCode>)
        and mutations use <DocsInlineCode>setStore</DocsInlineCode>.
      </DocsCallout>

      <DocsH2 id="basic-persistence">Basic Persistence</DocsH2>
      <DocsCode filename="settings-store.ts">{`import { createStore } from 'stroid'

createStore(
  'settings',
  {
    theme: 'dark' as 'light' | 'dark',
    fontSize: 14,
    sidebarOpen: true,
  },
  {
    persist: { key: 'app-settings', driver: localStorage },
  }
)`}</DocsCode>

      <DocsH2 id="persist-options">Persist Options</DocsH2>
      <DocsTable
        headers={["Option", "Type", "Description"]}
        rows={[
          ["key", "string", "The storage key. Must be unique per store."],
          ["driver", "Storage-like", "Object with getItem/setItem/removeItem (e.g., localStorage)."],
          ["serialize/deserialize", "(v)=>string / (str)=>any", "Override JSON for custom persistence."],
          ["encrypt/decrypt", "(str)=>string", "Optional transforms applied before/after storage."],
        ]}
      />

      <DocsH2 id="selective">Selective Persistence</DocsH2>
      <DocsParagraph>
        Want to whitelist/blacklist fields? Provide custom <DocsInlineCode>serialize</DocsInlineCode> / <DocsInlineCode>deserialize</DocsInlineCode>{" "}
        functions and filter keys inside them.
      </DocsParagraph>
      <DocsCallout type="info">
        Schema <DocsInlineCode>version</DocsInlineCode> and <DocsInlineCode>migrations</DocsInlineCode> live at the top level of <DocsInlineCode>StoreOptions</DocsInlineCode>, not inside <DocsInlineCode>persist</DocsInlineCode>.
      </DocsCallout>

      <DocsH2 id="tab-sync">Cross-Tab Sync</DocsH2>
      <DocsParagraph>
        Enable <DocsInlineCode>sync: true</DocsInlineCode> to automatically synchronize state across
        browser tabs using the BroadcastChannel API:
      </DocsParagraph>
      <DocsCode filename="sync.ts">{`import { createStore, setStore } from 'stroid'

createStore(
  'cart',
  { items: [] as CartItem[] },
  {
    persist: { key: 'cart', driver: localStorage },
    sync: true, // Changes in one tab appear in all tabs
  }
)

export const addItem = (item: CartItem) =>
  setStore('cart', (d) => {
    d.items.push(item)
  })`}</DocsCode>

      <DocsCallout type="info">
        Tab sync uses <DocsInlineCode>BroadcastChannel</DocsInlineCode>. If it is unavailable, a warning is logged and sync is skipped.
      </DocsCallout>

    </article>
  )
}
