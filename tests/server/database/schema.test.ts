import { getTableColumns, getTableName } from 'drizzle-orm'
import {
  administratorIpRules,
  administratorLoginAttempts,
  administratorRecoveryCodes,
  administratorSecurity,
  administrators,
  analyticsReportState,
  categories,
  commentSettings,
  comments,
  integrationSettings,
  homeSettings,
  mediaReferences,
  mediaSettings,
  postContent,
  postMetadata,
  postTags,
  posts,
  profileSettings,
  searchSettings,
  securitySettings,
  seoSettings,
  sessions,
  siteSettings,
  tags
} from '../../../server/database/schema'
import { postStatusValues, postTypeValues } from '../../../server/domain/post'

describe('database schema', () => {
  it('defines the version one durable tables', () => {
    const tableNames = [
      administrators,
      sessions,
      administratorSecurity,
      administratorRecoveryCodes,
      administratorIpRules,
      administratorLoginAttempts,
      categories,
      tags,
      posts,
      postContent,
      postMetadata,
      postTags,
      comments,
      mediaReferences,
      siteSettings,
      homeSettings,
      profileSettings,
      searchSettings,
      analyticsReportState,
      commentSettings,
      mediaSettings,
      securitySettings,
      seoSettings,
      integrationSettings
    ].map((table) => getTableName(table))

    expect(tableNames).toEqual([
      'administrators',
      'sessions',
      'administrator_security',
      'administrator_recovery_codes',
      'administrator_ip_rules',
      'administrator_login_attempts',
      'categories',
      'tags',
      'posts',
      'post_content',
      'post_metadata',
      'post_tags',
      'comments',
      'media_references',
      'site_settings',
      'home_settings',
      'profile_settings',
      'search_settings',
      'analytics_report_state',
      'comment_settings',
      'media_settings',
      'security_settings',
      'seo_settings',
      'integration_settings'
    ])
  })

  it('keeps public post type and status values explicit', () => {
    expect(postTypeValues).toEqual(['article', 'page'])
    expect(postStatusValues).toEqual(['draft', 'published'])
  })

  it('tracks the media library columns needed to delete and account for stored objects', () => {
    const columns = getTableColumns(mediaReferences)

    // The key addresses the object and the locator preserves the immutable provider coordinates;
    // size and content type let the library filter by type and report storage usage.
    expect(columns.storageKey.name).toBe('storage_key')
    expect(columns.storageLocator.name).toBe('storage_locator')
    expect(columns.contentType.name).toBe('content_type')
    expect(columns.sizeBytes.name).toBe('size_bytes')
    expect(columns.originalFilename.name).toBe('original_filename')
    // Legacy rows predate these columns, so every one of them stays nullable.
    for (const column of [
      columns.storageKey,
      columns.storageLocator,
      columns.contentType,
      columns.sizeBytes,
      columns.originalFilename
    ]) {
      expect(column.notNull).toBe(false)
    }
  })
})
