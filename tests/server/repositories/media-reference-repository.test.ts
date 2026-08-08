import { createMediaReferenceRepository } from '../../../server/repositories/media-reference-repository'
import { createSqliteTestDatabase } from '../test-utils/sqlite-db'

function setup() {
  const { db, sqlite } = createSqliteTestDatabase()
  sqlite.prepare(`
    INSERT INTO administrators (id, username, password_hash)
    VALUES ('admin-1', 'admin', 'hash')
  `).run()
  return { repository: createMediaReferenceRepository(db as never), sqlite }
}

function mediaInput(id: string, originalFilename: string) {
  const timestamp = new Date('2026-07-15T00:00:00.000Z')
  return {
    id,
    url: `https://media.example/${encodeURIComponent(originalFilename)}`,
    altText: null,
    width: null,
    height: null,
    caption: null,
    providerKey: 'cloudflare-r2',
    referenceState: 'stored',
    storageKey: `images/${id}.png`,
    storageLocator: JSON.stringify({
      version: 1,
      providerKey: 'cloudflare-r2',
      config: { publicBaseUrl: 'https://media.example' }
    }),
    contentType: 'image/png',
    sizeBytes: 8,
    originalFilename,
    thumbnailUrl: null,
    thumbnailKey: null,
    thumbnailSizeBytes: null,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

describe('media reference repository', () => {
  it('treats percent and underscore as literal characters in library searches', async () => {
    const { repository } = setup()
    await repository.create(mediaInput('literal', 'hero_image-100%.png'))
    await repository.create(mediaInput('wildcard', 'heroXimage-1000.png'))

    const underscore = await repository.list({ offset: 0, limit: 20, q: 'hero_image' })
    const percent = await repository.list({ offset: 0, limit: 20, q: '100%' })

    expect(underscore.items.map((item) => item.id)).toEqual(['literal'])
    expect(percent.items.map((item) => item.id)).toEqual(['literal'])
  })

  it('finds a markdown reference whose URL contains escaped LIKE characters', async () => {
    const { repository, sqlite } = setup()
    const url = 'https://media.example/hero_image-100%25.png'
    sqlite.prepare(`
      INSERT INTO posts (id, type, status, title, slug, author_id)
      VALUES ('post-1', 'article', 'draft', 'Literal URL', 'literal-url', 'admin-1')
    `).run()
    sqlite.prepare(`INSERT INTO post_content (post_id, markdown) VALUES ('post-1', ?)`)
      .run(`![hero](${url})`)

    await expect(repository.findUsage(url, 20)).resolves.toEqual([
      expect.objectContaining({ postId: 'post-1', field: 'content' })
    ])
  })

  it('includes site, profile, and homepage-card settings in usage checks', async () => {
    const { repository, sqlite } = setup()
    const url = 'https://media.example/shared_image.png'
    sqlite.prepare(`
      INSERT INTO site_settings (id, site_name, logo_url)
      VALUES ('site', 'TBLOG', ?)
    `).run(url)
    sqlite.prepare(`
      INSERT INTO profile_settings
        (id, name, role, avatar_url, short_bio, signature, introduction, current_status)
      VALUES ('profile', 'Author', 'Writer', ?, '', '', '', 'Active')
    `).run(url)
    sqlite.prepare(`
      INSERT INTO home_settings (id, rail_cards_json)
      VALUES ('home', ?)
    `).run(JSON.stringify([{ type: 'curated-topic', coverUrl: url }]))

    const usage = await repository.findUsage(url, 20)

    expect(usage).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'siteSettings', href: '/admin/settings' }),
      expect.objectContaining({ field: 'profileSettings', href: '/admin/profile' }),
      expect.objectContaining({ field: 'homeSettings', href: '/admin/home-cards' })
    ]))
  })
})
