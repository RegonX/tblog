import { computed } from 'vue'
import type { PostDetailView } from '../../types/public-view'

const siteContext = vi.hoisted(() => ({
  siteName: { value: 'TBLOG' },
  defaultTitle: { value: 'Default title' as string | null },
  defaultDescription: { value: 'Default description' as string | null },
  robotsPolicy: { value: 'index,follow' },
  locale: { value: 'zh-CN' },
  logoUrl: { value: '/logo.png' as string | null },
  baseUrl: { value: 'https://blog.example' },
  config: { value: { seo: { rssEnabled: true, authorUrl: 'https://blog.example/author' } } as { seo: { rssEnabled: boolean, authorUrl: string | null } } | null },
  canonicalFor: (path: string) => `https://blog.example${path === '/' ? '/' : path}`,
  toAbsolute: (url: string | null) => url
    ? (/^https?:\/\//i.test(url) ? url : `https://blog.example${url.startsWith('/') ? url : `/${url}`}`)
    : null
}))

vi.mock('~/composables/useSiteConfig', () => ({
  useSeoContext: () => siteContext
}))

import { serializeJsonLd, useArticleSeo, useHomeSeo, useSiteSeoDefaults } from '../../composables/useSeo'

describe('public SEO head composition', () => {
  const headEntries: Array<() => Record<string, unknown>> = []
  const seoEntries: Array<Record<string, unknown>> = []

  beforeEach(() => {
    headEntries.length = 0
    seoEntries.length = 0
    vi.stubGlobal('useRoute', () => ({ path: '/posts/demo' }))
    vi.stubGlobal('useHead', (entry: () => Record<string, unknown>) => headEntries.push(entry))
    vi.stubGlobal('useSeoMeta', (entry: Record<string, unknown>) => seoEntries.push(entry))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('emits complete site Twitter defaults alongside canonical, robots, and RSS discovery', () => {
    useSiteSeoDefaults()

    const head = headEntries[0]!()
    const meta = seoEntries[0]!
    expect(head).toMatchObject({
      link: [
        { rel: 'canonical', href: 'https://blog.example/posts/demo', key: 'canonical' },
        {
          rel: 'alternate',
          type: 'application/rss+xml',
          title: 'TBLOG',
          href: 'https://blog.example/rss.xml',
          key: 'rss'
        }
      ],
      meta: [{ name: 'robots', content: 'index,follow', key: 'robots' }]
    })
    expect(head).not.toHaveProperty('htmlAttrs')
    expect((meta.twitterTitle as () => string)()).toBe('Default title')
    expect((meta.twitterDescription as () => string)()).toBe('Default description')
    expect((meta.ogImage as () => string)()).toBe('https://blog.example/logo.png')
  })

  it('uses article overrides and safely serializes JSON-LD script content', () => {
    const post = computed<PostDetailView>(() => ({
      id: 'p1', slug: 'demo', type: 'article', title: 'Article', excerpt: 'Excerpt', readingTime: 2,
      publishedAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-15T12:00:00.000Z',
      category: null, tags: [], html: '<p>Body</p>',
      tocJson: null, codeMeta: [], cover: '/cover.png', pageViews: null, analyticsUpdatedAt: null,
      seoTitle: 'SEO </script><script>alert(1)</script>', seoDescription: 'SEO description',
      canonicalUrlOverride: 'https://canonical.example/demo', openGraphImageUrl: '/og.png',
      twitterImageUrl: null, jsonLdOverrideJson: null
    }))

    useArticleSeo(post)

    const meta = seoEntries[0]!
    expect((meta.ogUrl as () => string)()).toBe('https://canonical.example/demo')
    expect((meta.ogImage as () => string)()).toBe('https://blog.example/og.png')
    expect((meta.articleModifiedTime as () => string)()).toBe('2026-07-15T12:00:00.000Z')
    const script = (headEntries[0]!().script as Array<Record<string, string>>)[0]!
    expect(script).toHaveProperty('textContent')
    expect(script).not.toHaveProperty('innerHTML')
    expect(script.textContent).not.toContain('</script>')
    expect(script.textContent).toContain('\\u003C/script\\u003E')
    expect(script.textContent).toContain('https://blog.example/logo.png')
    expect(script.textContent).toContain('2026-07-15T12:00:00.000Z')
    const jsonLd = JSON.parse(script.textContent)
    expect(jsonLd.mainEntityOfPage).toEqual({
      '@type': 'WebPage',
      '@id': 'https://canonical.example/demo'
    })
    expect(jsonLd.publisher.url).toBe('https://blog.example/')
    expect(jsonLd.author).toEqual({
      '@type': 'Person',
      name: 'TBLOG',
      url: 'https://blog.example/author'
    })
  })

  it('writes safe WebSite JSON-LD for the homepage', () => {
    siteContext.siteName.value = 'TBLOG </script>'
    useHomeSeo()

    const script = (headEntries[0]!().script as Array<Record<string, string>>)[0]!
    expect(script.textContent).not.toContain('</script>')
    expect(JSON.parse(script.textContent).name).toBe('TBLOG </script>')
    siteContext.siteName.value = 'TBLOG'
  })

  it('omits the author URL when it is not configured', () => {
    siteContext.config.value = { seo: { rssEnabled: true, authorUrl: null } }
    const post = computed<PostDetailView>(() => ({
      id: 'p2', slug: 'no-author-url', type: 'article', title: 'Article', excerpt: null, readingTime: 1,
      publishedAt: '2026-07-01T00:00:00.000Z', updatedAt: null,
      category: null, tags: [], html: '<p>Body</p>', tocJson: null, codeMeta: [], cover: null,
      pageViews: null, analyticsUpdatedAt: null, seoTitle: null, seoDescription: null,
      canonicalUrlOverride: null, openGraphImageUrl: null, twitterImageUrl: null, jsonLdOverrideJson: null
    }))

    useArticleSeo(post)

    const script = (headEntries[0]!().script as Array<Record<string, string>>)[0]!
    expect(JSON.parse(script.textContent).author).toEqual({ '@type': 'Person', name: 'TBLOG' })
    siteContext.config.value = { seo: { rssEnabled: true, authorUrl: 'https://blog.example/author' } }
  })

  it('escapes HTML-sensitive characters without changing parsed JSON values', () => {
    const serialized = serializeJsonLd({ value: '<tag>&value' })
    expect(serialized).toBe('{"value":"\\u003Ctag\\u003E\\u0026value"}')
    expect(JSON.parse(serialized)).toEqual({ value: '<tag>&value' })
  })
})
