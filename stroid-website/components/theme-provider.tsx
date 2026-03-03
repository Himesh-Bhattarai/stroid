'use client'

import * as React from 'react'
import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
  useTheme,
} from 'next-themes'

export const themePresets = ['paper', 'aurora', 'graphite', 'sand'] as const

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      enableSystem={false}
      defaultTheme="paper"
      themes={themePresets as unknown as string[]}
      disableTransitionOnChange
      {...props}
    >
      <ThemeGuard>{children}</ThemeGuard>
    </NextThemesProvider>
  )
}

function ThemeGuard({ children }: { children: React.ReactNode }) {
  const { theme, resolvedTheme, setTheme } = useTheme()
  React.useEffect(() => {
    const current = (theme ?? resolvedTheme ?? 'paper') as (typeof themePresets)[number] | string
    const asPreset = current as (typeof themePresets)[number]
    if (!themePresets.includes(asPreset)) {
      setTheme('paper')
      return
    }
    const root = document.documentElement
    root.classList.remove('dark')
    if (asPreset === 'aurora' || asPreset === 'graphite') {
      root.classList.add('dark')
    }
  }, [theme, resolvedTheme, setTheme])
  return <>{children}</>
}
