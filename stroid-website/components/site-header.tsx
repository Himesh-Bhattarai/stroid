'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { Menu, X, Github, Search, PanelLeftClose, PanelLeft, Palette } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSidebar, useSearchDialog, useMobileMenu } from '@/app/sidebar-context'
import { themePresets } from './theme-provider'

const navigation = [
  {
    title: 'Getting Started',
    items: [
      { title: 'Introduction', href: '/docs' },
      { title: 'Quick Start', href: '/docs/quick-start' },
      { title: 'Why stroid?', href: '/docs/why-stroid' },
    ],
  },
  {
    title: 'Core Concepts',
    items: [
      { title: 'createStore', href: '/docs/core-concepts/create-store' },
      { title: 'useStore & Selectors', href: '/docs/core-concepts/use-store' },
      { title: 'setStore & Mutations', href: '/docs/core-concepts/set-store' },
      { title: 'Computed Values', href: '/docs/core-concepts/computed' },
    ],
  },
  {
    title: 'Guides',
    items: [
      { title: 'Async State', href: '/docs/guides/async' },
      { title: 'Persistence & Sync', href: '/docs/guides/persistence' },
      { title: 'TypeScript', href: '/docs/guides/typescript' },
      { title: 'Forms', href: '/docs/guides/forms' },
      { title: 'DevTools', href: '/docs/guides/devtools' },
    ],
  },
  {
    title: 'API Reference',
    items: [
      { title: 'Overview', href: '/docs/api' },
      { title: 'createStore', href: '/docs/api/create-store' },
      { title: 'useStore', href: '/docs/api/use-store' },
      { title: 'setStore', href: '/docs/api/set-store' },
      { title: 'useFormStore', href: '/docs/api/use-form-store' },
      { title: 'createStoreForRequest', href: '/docs/api/create-store-for-request' },
      { title: 'StoreOptions', href: '/docs/api/store-options' },
    ],
  },
]

const navLinks = [
  { label: 'Examples', href: '/examples' },
  { label: 'Release', href: 'https://github.com/Himesh-Bhattarai/stroid/releases' },
  { label: 'Discussion', href: 'https://github.com/Himesh-Bhattarai/stroid/discussions/2' },
]

function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { query, setQuery } = useSearchDialog()
  const inputRef = useRef<HTMLInputElement>(null)

  const allItems = useMemo(
    () => navigation.flatMap((g) => g.items.map((i) => ({ ...i, section: g.title }))),
    []
  )

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems.slice(0, 8)
    return allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(query.toLowerCase()) ||
        item.section.toLowerCase().includes(query.toLowerCase())
    )
  }, [query, allItems])

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative mx-auto mt-[15vh] w-full max-w-lg px-4">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documentation..."
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              aria-label="Search documentation"
            />
            <kbd className="shrink-0 rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/60">
              ESC
            </kbd>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">No results found.</p>
            ) : (
              filtered.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-muted/60"
                >
                  <span className="text-foreground">{item.title}</span>
                  <span className="text-xs text-muted-foreground/50">{item.section}</span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function SiteHeader() {
  const { open: mobileOpen, toggleMobileMenu } = useMobileMenu()
  const { open: searchOpen, openSearch, closeSearch } = useSearchDialog()
  const pathname = usePathname()
  const isDocsPage = pathname.startsWith('/docs')
  const { sidebarOpen, toggleSidebar } = useSidebar()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  type ThemeName = (typeof themePresets)[number]

  const themeOptions: Record<
    ThemeName,
    {
      label: string
      short: string
    }
  > = {
    paper: { label: 'Paper', short: 'Pa' },
    aurora: { label: 'Aurora', short: 'A' },
    graphite: { label: 'Graphite', short: 'G' },
    sand: { label: 'Sand', short: 'S' },
  }

  const activeTheme = useMemo<ThemeName>(() => {
    const current = (theme ?? resolvedTheme ?? 'paper') as ThemeName
    return themePresets.includes(current) ? current : 'paper'
  }, [theme, resolvedTheme])

  const displayTheme = mounted ? activeTheme : 'paper'

  useEffect(() => setMounted(true), [])

  const cycleTheme = useCallback(() => {
    if (!mounted) return
    const currentIndex = themePresets.indexOf(activeTheme)
    const nextTheme = themePresets[(currentIndex + 1) % themePresets.length]
    setTheme(nextTheme)
  }, [activeTheme, setTheme, mounted])

  const handleSearchOpen = useCallback(() => openSearch(), [openSearch])
  const handleSearchClose = useCallback(() => closeSearch(), [closeSearch])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        openSearch()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openSearch])

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-lg supports-[backdrop-filter]:bg-background/80">
        <div className="relative mx-auto flex h-14 items-center gap-4 px-4 lg:px-6">
          {/* Sidebar toggle (docs pages only, desktop) */}
          {isDocsPage && (
            <button
              onClick={toggleSidebar}
              className="hidden items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarOpen ? <PanelLeftClose className="size-4" /> : <PanelLeft className="size-4" />}
            </button>
          )}

          {/* Brand */}
          <Link href="/docs" className="flex items-center gap-2">
            <span className="bg-gradient-to-r from-primary via-foreground to-primary bg-clip-text font-[family-name:var(--font-heading)] text-lg font-extrabold uppercase tracking-[0.2em] text-transparent">
              stroid
            </span>
          </Link>

          {/* Desktop nav (true center) */}
          <nav
            className="pointer-events-auto absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-6 md:flex"
            aria-label="Main navigation"
          >
            {navLinks.map((link) => {
              const isActive = pathname.startsWith(link.href)
              const isExternal = link.href.startsWith('http')
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  target={isExternal ? '_blank' : undefined}
                  rel={isExternal ? 'noopener noreferrer' : undefined}
                  className={cn(
                    'relative text-sm transition-colors',
                    isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {link.label}
                  {isActive && !isExternal && (
                    <span className="absolute inset-x-0 -bottom-1 h-0.5 rounded-full bg-primary" />
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Right controls */}
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={handleSearchOpen}
              className="flex h-8 w-full max-w-[240px] items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 text-sm text-muted-foreground/60 transition-colors hover:border-border hover:bg-muted/50 hover:text-muted-foreground"
              aria-label="Search documentation"
            >
              <Search className="size-3.5 shrink-0" />
              <span className="flex-1 text-left text-xs">Search docs...</span>
              <kbd className="hidden rounded border border-border/50 bg-muted/50 px-1 font-mono text-[10px] text-muted-foreground/40 sm:inline-block">
                Ctrl/⌘K
              </kbd>
            </button>

            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={cycleTheme}
              aria-label={`Switch theme (current ${themeOptions[displayTheme].label})`}
              disabled={!mounted}
            >
              <Palette className="size-4 text-muted-foreground" />
              <span className="flex items-center gap-1 text-xs font-semibold text-foreground">
                {themeOptions[displayTheme].label}
                <span className="flex size-4 items-center justify-center rounded-full bg-primary/80 text-[10px] leading-none text-primary-foreground">
                  {themeOptions[displayTheme].short}
                </span>
              </span>
            </Button>

            <Button variant="ghost" size="icon-sm" className="hidden md:flex" asChild>
              <a
                href="https://github.com/Himesh-Bhattarai/stroid"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub repository"
              >
                <Github className="size-4 text-muted-foreground" />
              </a>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={toggleMobileMenu}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="border-t border-border/40 bg-background px-4 pb-4 pt-2 md:hidden">
            <nav className="flex flex-col gap-0.5" aria-label="Mobile navigation">
              {navLinks.map((link) => {
                const isActive = pathname.startsWith(link.href)
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'rounded-lg px-3 py-2.5 text-sm transition-colors',
                      isActive
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                    onClick={toggleMobileMenu}
                  >
                    {link.label}
                  </Link>
                )
              })}
            </nav>

            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full justify-between"
              onClick={cycleTheme}
              aria-label={`Switch theme (current ${themeOptions[displayTheme].label})`}
              disabled={!mounted}
            >
              <span className="flex items-center gap-2">
                <Palette className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  Theme: {themeOptions[displayTheme].label}
                </span>
              </span>
              <span className="text-[11px] text-muted-foreground">Tap to cycle</span>
            </Button>
          </div>
        )}
      </header>

      <SearchDialog open={searchOpen} onClose={handleSearchClose} />
    </>
  )
}


