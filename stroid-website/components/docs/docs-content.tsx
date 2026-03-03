import { cn } from "@/lib/utils"
import { CodeBlock } from "../code-block"

export function DocsH1({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h1 className={cn("font-[family-name:var(--font-heading)] text-3xl font-bold tracking-tight text-foreground md:text-4xl", className)}>
      {children}
    </h1>
  )
}

export function DocsH2({ children, id, className }: { children: React.ReactNode; id?: string; className?: string }) {
  return (
    <h2 id={id} className={cn("mt-12 scroll-mt-20 font-[family-name:var(--font-heading)] text-2xl font-bold tracking-tight text-foreground", className)}>
      {children}
    </h2>
  )
}

export function DocsH3({ children, id, className }: { children: React.ReactNode; id?: string; className?: string }) {
  return (
    <h3 id={id} className={cn("mt-8 scroll-mt-20 font-[family-name:var(--font-heading)] text-xl font-semibold text-foreground", className)}>
      {children}
    </h3>
  )
}

export function DocsParagraph({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("mt-4 text-base leading-relaxed text-muted-foreground", className)}>
      {children}
    </p>
  )
}

export async function DocsCode({ children, filename }: { children: string; filename?: string }) {
  return <CodeBlock code={children} filename={filename} />
}

export function DocsInlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-sm text-primary">
      {children}
    </code>
  )
}

export function DocsCallout({
  children,
  type = "info",
}: {
  children: React.ReactNode
  type?: "info" | "warning" | "tip"
}) {
  const styles = {
    info: "border-primary/30 bg-primary/5",
    warning: "border-destructive/30 bg-destructive/5",
    tip: "border-[oklch(0.75_0.15_60)]/30 bg-[oklch(0.75_0.15_60)]/5",
  }

  const labels = {
    info: "Note",
    warning: "Warning",
    tip: "Tip",
  }

  return (
    <div className={cn("mt-6 rounded-lg border p-4", styles[type])}>
      <p className="text-sm font-semibold text-foreground">{labels[type]}</p>
      <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  )
}

export function DocsTable({
  headers,
  rows,
}: {
  headers: string[]
  rows: string[][]
}) {
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full text-left text-sm" role="table">
        <thead>
          <tr className="border-b border-border">
            {headers.map((h) => (
              <th key={h} className="pb-3 pr-4 font-[family-name:var(--font-ui)] font-semibold text-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50">
              {row.map((cell, j) => (
                <td key={j} className="py-3 pr-4 text-muted-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
