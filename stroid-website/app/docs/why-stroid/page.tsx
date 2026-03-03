import {
  DocsH1,
  DocsH2,
  DocsParagraph,
  DocsCallout,
  DocsInlineCode,
} from "@/components/docs/docs-content"

export const metadata = {
  title: "Why stroid? - stroid Docs",
  description: "What stroid is optimized for and where it fits.",
}

export default function WhyStroidPage() {
  return (
    <article>
      <DocsH1>Why stroid?</DocsH1>
      <DocsParagraph>
        stroid is a small, TypeScript-first state engine focused on selector-based subscriptions,
        mutable-friendly updates, and built-in persistence/sync. Use it when you want a tiny API with
        zero runtime dependencies and you like writing updates as plain mutations via <DocsInlineCode>setStore</DocsInlineCode>.
      </DocsParagraph>

      <DocsH2 id="fits">Where it fits</DocsH2>
      <ul className="mt-4 flex flex-col gap-2 pl-6 text-muted-foreground">
        <li className="list-disc text-sm leading-relaxed">TypeScript projects that want inference without extra generics</li>
        <li className="list-disc text-sm leading-relaxed">Apps that need persistence and tab sync without middleware stacks</li>
        <li className="list-disc text-sm leading-relaxed">Teams that prefer mutable syntax with immutable outputs</li>
        <li className="list-disc text-sm leading-relaxed">Cases where bundle size matters (~8.6 kB min+gzip, zero deps)</li>
        <li className="list-disc text-sm leading-relaxed">Situations where Redux DevTools support is useful with minimal setup</li>
      </ul>

      <DocsCallout type="info">
        Choice is yours: stroid is flexible and can live alongside other state tools. Pick what fits your
        project and migrate gradually if you need to.
      </DocsCallout>
    </article>
  )
}
