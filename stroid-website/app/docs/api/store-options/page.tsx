import {
  DocsH1,
  DocsH2,
  DocsParagraph,
  DocsCode,
  DocsTable,
  DocsCallout,
  DocsInlineCode,
} from "@/components/docs/docs-content"

export const metadata = {
  title: "StoreOptions - API Reference - stroid Docs",
  description: "API reference for stroid's StoreOptions configuration type.",
}

export default function StoreOptionsAPIPage() {
  return (
    <article>
      <DocsH1 className="font-mono">StoreOptions</DocsH1>
      <DocsParagraph>
        The optional second argument to <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-sm text-primary">createStore</code>.
        Configures persistence, cross-tab synchronization, DevTools, SSR behaviour, validation, and lifecycle hooks.
      </DocsParagraph>

      <DocsH2 id="type">Type Definition</DocsH2>
      <DocsCode>{`interface StoreOptions<State = any> {
  persist?: boolean | PersistConfig
  sync?: boolean | SyncOptions
  devtools?: boolean
  historyLimit?: number          // default 50
  version?: number
  migrations?: Record<number, (state: State) => State>
  schema?: unknown
  validator?: (next: State) => boolean
  middleware?: Array<(ctx: MiddlewareCtx) => void | State>
  onSet?: (prev: State, next: State) => void
  onReset?: (prev: State, next: State) => void
  onDelete?: (prev: State) => void
  onCreate?: (initial: State) => void
  onError?: (err: string) => void
  redactor?: (state: State) => State
  allowSSRGlobalStore?: boolean
}

interface PersistConfig {
  key: string
  driver: { getItem?: (k: string) => string | null; setItem?: (k: string, v: string) => void; removeItem?: (k: string) => void }
  serialize?: (value: unknown) => string
  deserialize?: (value: string) => unknown
  encrypt?: (str: string) => string
  decrypt?: (str: string) => string
}

interface SyncOptions {
  channel?: string
  conflictResolver?: ({ local, incoming, localUpdated, incomingUpdated }: any) => any
}`}</DocsCode>

      <DocsH2 id="persist">persist</DocsH2>
      <DocsTable
        headers={["Option", "Type", "Default", "Description"]}
        rows={[
          ["key", "string", "required", "Storage key to use."],
          ["driver", "Storage-like", "localStorage", "Object implementing getItem/setItem/removeItem."],
          ["serialize/deserialize", "(v)=>string / (str)=>any", "JSON", "Customize how state is written/read."],
          ["encrypt/decrypt", "(str) => str", "undefined", "Optional transforms for persisted string payloads."],
        ]}
      />
      <DocsCallout type="info">
        <DocsInlineCode>version</DocsInlineCode> and <DocsInlineCode>migrations</DocsInlineCode> live at the top level of <DocsInlineCode>StoreOptions</DocsInlineCode>.
      </DocsCallout>

      <DocsH2 id="sync">sync</DocsH2>
      <DocsParagraph>
        Set to <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-sm text-primary">true</code> to
        synchronize state across browser tabs (BroadcastChannel under the hood). Provide an optional{" "}
        <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-sm text-primary">channel</code> name and{" "}
        <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-sm text-primary">conflictResolver</code> to
        customize merge strategy.
      </DocsParagraph>

      <DocsH2 id="devtools">devtools</DocsH2>
      <DocsTable
        headers={["Option", "Type", "Default", "Description"]}
        rows={[
          ["devtools", "boolean", "false", "Connect this store to Redux DevTools."],
          ["historyLimit", "number", "50", "Maximum shallow diffs kept for time travel."],
        ]}
      />

      <DocsH2 id="full-example">Full Example</DocsH2>
      <DocsCode filename="full-options.ts">{`import { createStore } from 'stroid'

createStore(
  'auth',
  { user: null as User | null, token: '', theme: 'dark' },
  {
    persist: {
      key: 'auth-store',
      driver: localStorage,
      version: 2,
      migrate: (old, version) => (version === 1 ? { ...old, theme: 'dark' } : old),
    },
    sync: true,
    devtools: true,
    historyLimit: 100,
  }
)`}</DocsCode>
    </article>
  )
}
