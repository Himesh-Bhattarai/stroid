'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ChevronRight, Menu, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { navigation, NavItem } from './nav-data'

function SidebarSection({ group }: { group: NavItem }) {
  const pathname = usePathname()
  const hasActiveChild = group.items?.some((item) => item.href === pathname)
  const [open, setOpen] = useState(true)

  return (
    <div>
      {/* Section heading -- colorful icon + text like VS Code */}
      <button
        onClick={() => setOpen(!open)}
        className="group flex w-full items-center gap-1 rounded-md px-0 py-1.5 text-sm font-semibold transition-colors hover:bg-muted/40"
      >
        {/* Colorful icon background */}
        {group.icon && (
          <div className={cn('ml-1 flex items-center justify-center rounded text-foreground', group.color)}>
            <group.icon className="size-4" />
          </div>
        )}

        <span className={cn('flex-1 text-left', hasActiveChild ? 'text-foreground' : 'text-muted-foreground')}>
          {group.title}
        </span>

        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-200',
            open && 'rotate-90'
          )}
        />
      </button>

      {/* Collapsible items -- colorful left border for active */}
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-in-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          <ul className="relative ml-0 border-l border-muted-foreground/20 py-0.5 pl-2">
            {group.items?.map((item) => {
              const isExternal = item.href?.startsWith('http')
              const isActive = !isExternal && pathname === item.href
              return (
                <li key={item.href} className="relative">
                  {/* Active left accent */}
                  {isActive && (
                    <span
                      className={cn(
                        'absolute -left-px top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r',
                        group.color && `bg-gradient-to-b ${group.color}`
                      )}
                    />
                  )}
                  <Link
                    href={item.href!}
                    target={isExternal ? '_blank' : undefined}
                    rel={isExternal ? 'noopener noreferrer' : undefined}
                    className={cn(
                      'block py-1.5 pl-2 pr-2 text-[13px] leading-snug transition-all duration-150 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
                      isActive
                        ? 'font-semibold text-foreground bg-muted/60'
                        : 'text-muted-foreground/80 hover:text-foreground hover:bg-muted/30'
                    )}
                  >
                    {item.title}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}

export function DocsSidebar({ open }: { open: boolean }) {
  return (
    <aside
      className={cn(
        'sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 border-r border-border/40 transition-[width,opacity] duration-300 ease-in-out lg:block',
        'scrollbar-hide overflow-y-auto',
        open ? 'w-64 opacity-100' : 'w-0 overflow-hidden border-r-0 opacity-0'
      )}
      style={{
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >
      <nav className="flex w-64 flex-col gap-4 px-0 py-6" aria-label="Documentation">
        {navigation.map((group) => (
          <SidebarSection key={group.title} group={group} />
        ))}
      </nav>
    </aside>
  )
}

export function DocsMobileNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const currentTitle = navigation
    .flatMap((g) => g.items ?? [])
    .find((i) => i.href === pathname)?.title

  return (
    <div className="sticky top-14 z-40 border-b border-border/40 bg-background/95 backdrop-blur-lg lg:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm"
      >
        <Menu className="size-4 text-muted-foreground" />
        <span className="font-medium text-foreground">{currentTitle ?? 'Documentation'}</span>
        <ChevronDown
          className={cn(
            'ml-auto size-3.5 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="max-h-[70vh] overflow-y-auto border-t border-border/40 bg-background">
          <div className="flex flex-col gap-4 px-4 py-4">
            {navigation.map((group) => (
              <div key={group.title}>
                <div className="mb-2 flex items-center gap-2">
                  {group.icon && (
                    <div className={cn('flex items-center justify-center rounded text-sm', group.color)}>
                      <group.icon className="size-4" />
                    </div>
                  )}
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {group.title}
                  </p>
                </div>
                <ul className="flex flex-col">
                  {group.items?.map((item) => {
                    const isExternal = item.href?.startsWith('http')
                    const isActive = !isExternal && pathname === item.href
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href!}
                          target={isExternal ? '_blank' : undefined}
                          rel={isExternal ? 'noopener noreferrer' : undefined}
                          onClick={() => !isExternal && setOpen(false)}
                          className={cn(
                            'block rounded-md px-3 py-2 text-sm transition-colors',
                            isActive
                              ? cn(
                                  'bg-primary/10 font-semibold text-foreground',
                                  group.color && `bg-gradient-to-r ${group.color} bg-clip-text text-transparent`
                                )
                              : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                          )}
                        >
                          {item.title}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
