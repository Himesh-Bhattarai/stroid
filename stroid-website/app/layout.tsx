import type { Metadata, Viewport } from 'next'
import { Inter, Roboto, Open_Sans, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SidebarProvider } from './sidebar-context'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const roboto = Roboto({
  subsets: ['latin'],
  variable: '--font-roboto',
  weight: ['300', '400', '500', '700'],
})

const openSans = Open_Sans({
  subsets: ['latin'],
  variable: '--font-open-sans',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://stroid.dev'),
  title: 'stroid - The TypeScript State Engine for React',
  description:
    'Simple. Typed. Powerful. A next-generation React state management library with built-in persistence, tab sync, DevTools, and TypeScript-first design.',
  keywords: ['React', 'TypeScript', 'state management', 'stroid', 'Redux alternative', 'Zustand alternative'],
  openGraph: {
    title: 'stroid - The TypeScript State Engine for React',
    description: 'Simple. Typed. Powerful. Next-gen state management for React.',
    type: 'website',
    url: 'https://stroid.dev/',
    images: [
      {
        url: '/favicon/web-app-manifest-512x512.png',
        width: 512,
        height: 512,
        alt: 'stroid logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'stroid - The TypeScript State Engine for React',
    description: 'Simple. Typed. Powerful. Next-gen state management for React.',
    images: ['/favicon/web-app-manifest-512x512.png'],
  },
  alternates: {
    canonical: 'https://stroid.dev/',
  },
  icons: {
    icon: [
      { url: '/favicon/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon/favicon-96x96.png', sizes: '32x32', type: 'image/png' },
    ],
    shortcut: '/favicon/favicon-96x96.png',
    apple: '/favicon/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#1a1a2e',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${roboto.variable} ${openSans.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <ThemeProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
          >
            Skip to content
          </a>
          <SidebarProvider>{children}</SidebarProvider>
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}
