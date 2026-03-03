'use client'

import { SiteHeader } from "@/components/site-header"
import { DocsSidebar, DocsMobileNav } from "@/components/docs/docs-sidebar"
import { useSidebar } from "@/app/sidebar-context"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { DocsPager } from "@/components/docs/docs-pager"

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { sidebarOpen } = useSidebar()
  const pathname = usePathname()

  const segments = pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean)
  const withoutDocs = segments[0] === "docs" ? segments.slice(1) : segments
  const crumbs = withoutDocs.slice(0, 3) // limit length

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <DocsMobileNav />
      <div className="flex w-full px-0">
        <DocsSidebar open={sidebarOpen} />
        <main id="main" className="min-w-0 flex-1 px-4 py-8 lg:px-12 lg:py-12">
          <div className="mx-auto max-w-3xl space-y-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Link href="/docs" className="font-medium text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                  Docs
                </Link>
                {crumbs.map((seg, idx) => (
                  <span key={idx} className="flex items-center gap-2">
                    <span aria-hidden="true">/</span>
                    {idx === crumbs.length - 1 ? (
                      <span className="text-foreground font-semibold">{seg.replace(/-/g, " ")}</span>
                    ) : (
                      <Link
                        href={"/docs/" + crumbs.slice(0, idx + 1).join("/")}
                        className="hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {seg.replace(/-/g, " ")}
                      </Link>
                    )}
                  </span>
                ))}
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Docs for v0.0.2 - current npm release. Reduce your code, reduce your stress - never your functionality.
              </div>
            </div>
            {children}
            <DocsPager />
          </div>
        </main>
      </div>
    </div>
  )
}


