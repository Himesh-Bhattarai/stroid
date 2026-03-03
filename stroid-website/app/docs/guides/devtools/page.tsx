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
  title: "DevTools - Guides - stroid Docs",
  description: "Connect stroid to Redux DevTools for time-travel debugging.",
}

export default function DevToolsGuidePage() {
  return (
    <article>
      <DocsH1>DevTools</DocsH1>
      <DocsParagraph>
        stroid integrates with the Redux DevTools browser extension for time-travel debugging, action
        logging, and state inspection. No setup required beyond enabling the option.
      </DocsParagraph>
      <DocsCallout type="warning">
        This guide reflects stroid 0.0.2 (named stores). Examples use <DocsInlineCode>createStore(name, initial, options)</DocsInlineCode> and
        mutations via <DocsInlineCode>setStore</DocsInlineCode>.
      </DocsCallout>

      <DocsH2 id="enabling">Enabling DevTools</DocsH2>
      <DocsCode filename="store.ts">{`import { createStore, setStore } from 'stroid'

createStore(
  'counter',
  { count: 0 },
  {
    devtools: true,
    historyLimit: 100,
  }
)

export const increment = () => setStore('counter', (d) => { d.count += 1 })`}</DocsCode>

      <DocsCallout type="tip">
        Always guard DevTools with an environment check. The DevTools connector adds a small
        overhead and should be disabled in production.
      </DocsCallout>

      <DocsH2 id="features">What You Get</DocsH2>
      <ul className="mt-4 flex flex-col gap-2 pl-6 text-muted-foreground">
        <li className="list-disc text-sm leading-relaxed">
          <strong className="text-foreground">Action logging</strong> — see every action dispatched with its payload
        </li>
        <li className="list-disc text-sm leading-relaxed">
          <strong className="text-foreground">State inspection</strong> — browse the full state tree at any point
        </li>
        <li className="list-disc text-sm leading-relaxed">
          <strong className="text-foreground">Time-travel</strong> — step forward and backward through actions
        </li>
        <li className="list-disc text-sm leading-relaxed">
          <strong className="text-foreground">State diff</strong> — see exactly what changed with each action
        </li>
        <li className="list-disc text-sm leading-relaxed">
          <strong className="text-foreground">Action replay</strong> — re-dispatch actions to reproduce bugs
        </li>
      </ul>

      <DocsH2 id="options">DevTools Options</DocsH2>
      <DocsParagraph>
        DevTools is enabled per store with a boolean. Control history depth via <DocsInlineCode>historyLimit</DocsInlineCode>.
      </DocsParagraph>
      <DocsCode filename="options.ts">{`createStore('auth', initial, {
  devtools: true,
  historyLimit: 100, // default 50
})`}</DocsCode>

      <DocsH2 id="multiple-stores">Multiple Stores</DocsH2>
      <DocsParagraph>
        Each store appears as a separate instance in DevTools. Give them unique <DocsInlineCode>name</DocsInlineCode> values in your code/comments to tell them apart.
      </DocsParagraph>

    </article>
  )
}
