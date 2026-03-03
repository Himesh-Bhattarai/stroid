import * as React from 'react'
import { BookOpen, Layers, Compass, Code, Users } from 'lucide-react'

export type NavItem = {
  title: string
  href?: string
  items?: NavItem[]
  color?: string
  icon?: React.ComponentType<{ className?: string }>
}

export const navigation: NavItem[] = [
  {
    title: 'Getting Started',
    color: 'from-blue-500 to-cyan-400',
    icon: BookOpen,
    items: [
      { title: 'Introduction', href: '/docs' },
      { title: 'Quick Start', href: '/docs/quick-start' },
      { title: 'Why stroid?', href: '/docs/why-stroid' },
    ],
  },
  {
    title: 'Core Concepts',
    color: 'from-purple-500 to-pink-400',
    icon: Layers,
    items: [
      { title: 'createStore', href: '/docs/core-concepts/create-store' },
      { title: 'useStore & Selectors', href: '/docs/core-concepts/use-store' },
      { title: 'setStore & Mutations', href: '/docs/core-concepts/set-store' },
      { title: 'Computed Values', href: '/docs/core-concepts/computed' },
    ],
  },
  {
    title: 'Guides',
    color: 'from-orange-500 to-yellow-400',
    icon: Compass,
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
    color: 'from-emerald-500 to-teal-400',
    icon: Code,
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
  {
    title: 'Community',
    color: 'from-red-500 to-orange-400',
    icon: Users,
    items: [
      { title: 'Feedback', href: 'https://github.com/Himesh-Bhattarai/stroid/discussions' },
      { title: 'Issues', href: 'https://github.com/Himesh-Bhattarai/stroid/issues' },
    ],
  },
]

export function flattenNavigation(nav: NavItem[] = navigation): { title: string; href: string }[] {
  const out: { title: string; href: string }[] = []
  for (const group of nav) {
    if (!group.items) continue
    for (const item of group.items) {
      if (item.href && !item.href.startsWith('http')) {
        out.push({ title: item.title, href: item.href })
      }
      if (item.items) {
        out.push(...flattenNavigation([item]))
      }
    }
  }
  return out
}
