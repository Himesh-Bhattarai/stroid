'use client'

import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { navigation, flattenNavigation } from './nav-data'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

const orderedDocs = flattenNavigation(navigation)

export function DocsPager() {
  const pathname = usePathname()
  const index = orderedDocs.findIndex((item) => item.href === pathname)

  if (index === -1) return null

  const prev = orderedDocs[index - 1]
  const next = orderedDocs[index + 1]

  if (!prev && !next) return null

  return (
    <div className="mt-10 grid gap-2 border-t border-border/40 pt-5 sm:grid-cols-2">
      {prev ? (
        <Link
          href={prev.href}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'group flex max-w-[240px] items-center justify-start gap-2 text-left truncate self-start h-9'
          )}
        >
          <ArrowLeft className="size-4 text-muted-foreground group-hover:text-foreground" />
          <span className="text-sm font-semibold text-foreground truncate">{prev.title}</span>
        </Link>
      ) : (
        <div className="h-full" />
      )}

      {next ? (
        <Link
          href={next.href}
          className={cn(
            buttonVariants({ variant: 'default', size: 'sm' }),
            'group flex max-w-[240px] items-center justify-end gap-2 text-left truncate self-end ml-auto h-9'
          )}
        >
          <span className="text-sm font-semibold text-primary-foreground truncate">{next.title}</span>
          <ArrowRight className="size-4 text-primary-foreground group-hover:translate-x-0.5 transition-transform" />
        </Link>
      ) : (
        <div className="h-full" />
      )}
    </div>
  )
}
