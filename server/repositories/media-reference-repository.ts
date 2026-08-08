import { and, count, desc, eq, gte, lte, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import type { AppDatabase } from '../database/client'
import {
  homeSettings,
  mediaReferences,
  postContent,
  postMetadata,
  posts,
  profileSettings,
  siteSettings
} from '../database/schema'
import type {
  MediaListQuery,
  MediaReferenceRecord,
  MediaReferenceRepository,
  MediaUsageReference
} from './contracts/media-repositories'

const recordColumns = {
  id: mediaReferences.id,
  url: mediaReferences.url,
  altText: mediaReferences.altText,
  width: mediaReferences.width,
  height: mediaReferences.height,
  caption: mediaReferences.caption,
  providerKey: mediaReferences.providerKey,
  referenceState: mediaReferences.referenceState,
  storageKey: mediaReferences.storageKey,
  storageLocator: mediaReferences.storageLocator,
  contentType: mediaReferences.contentType,
  sizeBytes: mediaReferences.sizeBytes,
  originalFilename: mediaReferences.originalFilename,
  thumbnailUrl: mediaReferences.thumbnailUrl,
  thumbnailKey: mediaReferences.thumbnailKey,
  thumbnailSizeBytes: mediaReferences.thumbnailSizeBytes,
  createdAt: mediaReferences.createdAt,
  updatedAt: mediaReferences.updatedAt
} as const

/** `%` and `_` are LIKE wildcards; escape them so a filename search cannot widen its own match. */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

function literalLike(column: SQLWrapper, value: string): SQL {
  const pattern = `%${escapeLikePattern(value)}%`
  // SQLite only treats the backslash as an escape character when ESCAPE is declared explicitly.
  return sql`${column} LIKE ${pattern} ESCAPE ${'\\'}`
}

function buildFilter(query: MediaListQuery): SQL | undefined {
  const conditions: SQL[] = []
  const term = query.q?.trim()
  if (term) {
    const match = or(
      literalLike(mediaReferences.originalFilename, term),
      literalLike(mediaReferences.altText, term),
      literalLike(mediaReferences.caption, term),
      literalLike(mediaReferences.url, term)
    )
    if (match) conditions.push(match)
  }
  if (query.contentType) conditions.push(eq(mediaReferences.contentType, query.contentType))
  if (query.from) conditions.push(gte(mediaReferences.createdAt, query.from))
  if (query.to) conditions.push(lte(mediaReferences.createdAt, query.to))
  return conditions.length > 0 ? and(...conditions) : undefined
}

export function createMediaReferenceRepository(db: AppDatabase): MediaReferenceRepository {
  async function findById(id: string): Promise<MediaReferenceRecord | null> {
    const [row] = await db
      .select(recordColumns)
      .from(mediaReferences)
      .where(eq(mediaReferences.id, id))
      .limit(1)
    return row ?? null
  }

  return {
    async create(input) {
      await db.insert(mediaReferences).values(input)
    },

    async list(query) {
      const filter = buildFilter(query)
      const [items, totalRows] = await Promise.all([
        db
          .select(recordColumns)
          .from(mediaReferences)
          .where(filter)
          .orderBy(desc(mediaReferences.createdAt), desc(mediaReferences.id))
          .limit(query.limit)
          .offset(query.offset),
        db
          .select({ value: count() })
          .from(mediaReferences)
          .where(filter)
      ])
      const [totalRow] = totalRows

      return {
        items,
        total: totalRow?.value ?? 0,
        offset: query.offset,
        limit: query.limit
      }
    },

    findById,

    async updateMetadata(id, input) {
      await db
        .update(mediaReferences)
        .set({ altText: input.altText, caption: input.caption, updatedAt: input.updatedAt })
        .where(eq(mediaReferences.id, id))
      return findById(id)
    },

    async deleteById(id) {
      await db.delete(mediaReferences).where(eq(mediaReferences.id, id))
    },

    async summary() {
      const [row] = await db
        .select({
          totalCount: count(),
          // Rows predating size tracking hold NULL. Summing them as 0 would understate usage with no
          // signal at all, so they are counted separately and reported as unknown.
          totalBytes: sql<number>`coalesce(sum(${mediaReferences.sizeBytes}), 0)`,
          unknownSizeCount: sql<number>`sum(case when ${mediaReferences.sizeBytes} is null then 1 else 0 end)`
        })
        .from(mediaReferences)

      return {
        totalCount: row?.totalCount ?? 0,
        totalBytes: Number(row?.totalBytes ?? 0),
        unknownSizeCount: Number(row?.unknownSizeCount ?? 0)
      }
    },

    async findUsage(url, limit): Promise<MediaUsageReference[]> {
      const seoMatch = or(
        eq(postMetadata.openGraphImageUrl, url),
        eq(postMetadata.twitterImageUrl, url)
      )
      const siteMatch = or(
        eq(siteSettings.logoUrl, url),
        eq(siteSettings.faviconUrl, url),
        eq(siteSettings.featuredFallbackCover, url)
      )

      const [inContent, inCover, inSeo, inSiteSettings, inProfileSettings, inHomeSettings] = await Promise.all([
        db
          .select({ postId: posts.id, title: posts.title, slug: posts.slug })
          .from(postContent)
          .innerJoin(posts, eq(postContent.postId, posts.id))
          .where(literalLike(postContent.markdown, url))
          .limit(limit),
        db
          .select({ postId: posts.id, title: posts.title, slug: posts.slug })
          .from(posts)
          .where(eq(posts.cover, url))
          .limit(limit),
        db
          .select({ postId: posts.id, title: posts.title, slug: posts.slug })
          .from(postMetadata)
          .innerJoin(posts, eq(postMetadata.postId, posts.id))
          .where(seoMatch)
          .limit(limit),
        db
          .select({ id: siteSettings.id })
          .from(siteSettings)
          .where(siteMatch)
          .limit(1),
        db
          .select({ id: profileSettings.id })
          .from(profileSettings)
          .where(eq(profileSettings.avatarUrl, url))
          .limit(1),
        db
          .select({ id: homeSettings.id })
          .from(homeSettings)
          .where(literalLike(homeSettings.railCardsJson, url))
          .limit(1)
      ])

      const references: MediaUsageReference[] = [
        ...inContent.map((row) => ({ ...row, href: `/admin/posts/${row.postId}`, field: 'content' as const })),
        ...inCover.map((row) => ({ ...row, href: `/admin/posts/${row.postId}`, field: 'cover' as const })),
        ...inSeo.map((row) => ({ ...row, href: `/admin/posts/${row.postId}`, field: 'seoImage' as const })),
        ...inSiteSettings.map(() => ({
          postId: 'settings:site', title: 'Site settings', slug: '', href: '/admin/settings', field: 'siteSettings' as const
        })),
        ...inProfileSettings.map(() => ({
          postId: 'settings:profile', title: 'Profile settings', slug: '', href: '/admin/profile', field: 'profileSettings' as const
        })),
        ...inHomeSettings.map(() => ({
          postId: 'settings:home', title: 'Homepage cards', slug: '', href: '/admin/home-cards', field: 'homeSettings' as const
        }))
      ]

      // One post can reference the same image from several fields; report it once, keeping the first
      // (content) match so the warning points at the most visible usage.
      const seen = new Set<string>()
      return references
        .filter((reference) => {
          if (seen.has(reference.postId)) return false
          seen.add(reference.postId)
          return true
        })
        .slice(0, limit)
    }
  }
}
