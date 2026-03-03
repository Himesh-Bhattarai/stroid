'use client'

import { createStore, setStore, useStore } from 'stroid'
import type { ReactNode } from 'react'

// Global UI store for site chrome (sidebar + dialogs)
createStore(
  'ui',
  {
    sidebarOpen: true,
    searchOpen: false,
    mobileMenuOpen: false,
    searchQuery: '',
    codeShowcaseTab: 'basic',
    heroCopied: false,
    terminalCopied: false,
  },
  {
    allowSSRGlobalStore: true, // safe because this store is client-only UI state
  }
)

export function toggleSidebar() {
  setStore('ui', (s) => {
    s.sidebarOpen = !s.sidebarOpen
  })
}

export function openSearch() {
  setStore('ui', (s) => {
    s.searchOpen = true
  })
}

export function closeSearch() {
  setStore('ui', (s) => {
    s.searchOpen = false
    s.searchQuery = ''
  })
}

export function toggleMobileMenu() {
  setStore('ui', (s) => {
    s.mobileMenuOpen = !s.mobileMenuOpen
  })
}

export function setSearchQuery(value: string) {
  setStore('ui', (s) => {
    s.searchQuery = value
  })
}

export function setCodeShowcaseTab(id: string) {
  setStore('ui', (s) => {
    s.codeShowcaseTab = id
  })
}

export function markHeroCopied(temp: boolean) {
  setStore('ui', (s) => {
    s.heroCopied = temp
  })
}

export function markTerminalCopied(temp: boolean) {
  setStore('ui', (s) => {
    s.terminalCopied = temp
  })
}

// Hooks
export const useSidebar = () => ({
  sidebarOpen: useStore('ui', (s) => s.sidebarOpen),
  toggleSidebar,
})

export const useSearchDialog = () => ({
  open: useStore('ui', (s) => s.searchOpen),
  query: useStore('ui', (s) => s.searchQuery),
  openSearch,
  closeSearch,
  setQuery: setSearchQuery,
})

export const useMobileMenu = () => ({
  open: useStore('ui', (s) => s.mobileMenuOpen),
  toggleMobileMenu,
})

export const useCodeShowcase = () => ({
  tab: useStore('ui', (s) => s.codeShowcaseTab),
  setTab: setCodeShowcaseTab,
})

export const useHeroCopy = () => ({
  copied: useStore('ui', (s) => s.heroCopied),
  setCopied: markHeroCopied,
})

export const useTerminalCopy = () => ({
  copied: useStore('ui', (s) => s.terminalCopied),
  setCopied: markTerminalCopied,
})

// Provider left for structure; no longer holds local state
export function SidebarProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}
