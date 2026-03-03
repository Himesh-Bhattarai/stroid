import { MetadataRoute } from 'next'

const base = 'https://stroid.dev'

const urls = [
  '',
  '/docs',
  '/docs/quick-start',
  '/docs/why-stroid',
  '/docs/api',
  '/docs/guides/persistence',
  '/docs/guides/async',
  '/docs/guides/devtools',
  '/docs/guides/forms',
  '/docs/guides/typescript',
]

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return urls.map((path) => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency: 'weekly',
    priority: path === '' ? 1.0 : 0.8,
  }))
}
