import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getQuery, getRouterParam, readBody } from 'h3'
import { authError } from '../../../server/domain/auth-errors'
import { mediaError } from '../../../server/domain/media-errors'
import type { MediaService } from '../../../server/services/media-service'
import { createMediaServiceForEvent } from '../../../server/services/media-service-factory'
import { requireAdmin } from '../../../server/utils/require-admin'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return {
    ...actual,
    getQuery: vi.fn(),
    getRouterParam: vi.fn(),
    readBody: vi.fn()
  }
})

vi.mock('../../../server/utils/require-admin', () => ({
  requireAdmin: vi.fn()
}))

vi.mock('../../../server/services/media-service-factory', () => ({
  createMediaServiceForEvent: vi.fn()
}))

import listMedia from '../../../server/api/v1/admin/media/index.get'
import mediaStats from '../../../server/api/v1/admin/media/stats.get'
import updateMedia from '../../../server/api/v1/admin/media/[id].patch'
import deleteMedia from '../../../server/api/v1/admin/media/[id].delete'
import batchDeleteMedia from '../../../server/api/v1/admin/media/batch-delete.post'

type Handler = (event: unknown) => Promise<unknown>

const currentAdmin = {
  administrator: { id: 'admin-1', username: 'admin' },
  permissions: ['post:*'] as const
}

function makeEvent() {
  return {
    node: {
      req: { headers: { 'cf-ray': 'request-1' } },
      res: { statusCode: 200, setHeader: vi.fn() }
    },
    context: {}
  }
}

function mediaService(implementation: Partial<MediaService>) {
  vi.mocked(createMediaServiceForEvent).mockReturnValue(implementation as MediaService)
}

function expectErrorEnvelope(
  body: unknown,
  expected: { code: string; message: string; details?: Record<string, unknown> }
) {
  expect(body).toEqual({
    error: {
      code: expected.code,
      message: expected.message,
      details: expected.details ?? {},
      requestId: 'request-1'
    }
  })
}

const mediaItem = {
  id: 'media-1',
  url: 'https://media.example/images/media-1.png',
  altText: null,
  caption: null,
  width: null,
  height: null,
  providerKey: 'cloudflare-r2',
  referenceState: 'stored',
  contentType: 'image/png',
  sizeBytes: 2048,
  originalFilename: 'hero.png',
  createdAt: new Date('2026-07-15T00:00:00.000Z'),
  updatedAt: new Date('2026-07-15T00:00:00.000Z')
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireAdmin).mockResolvedValue(currentAdmin as never)
  vi.mocked(getQuery).mockReturnValue({})
})

describe('admin media library route authentication order', () => {
  it.each([
    ['list', listMedia],
    ['stats', mediaStats],
    ['update', updateMedia],
    ['delete', deleteMedia],
    ['batch delete', batchDeleteMedia]
  ])('authenticates %s requests before creating a service', async (_name, handler) => {
    vi.mocked(requireAdmin).mockRejectedValue(
      authError('unauthorized', 'Authentication is required', 401)
    )
    const event = makeEvent()

    const body = await (handler as Handler)(event)

    expect(requireAdmin).toHaveBeenCalledWith(event)
    expect(createMediaServiceForEvent).not.toHaveBeenCalled()
    expectErrorEnvelope(body, { code: 'unauthorized', message: 'Authentication is required' })
    expect(event.node.res.statusCode).toBe(401)
  })
})

describe('admin media list route', () => {
  it('applies parsed filters and returns paging metadata', async () => {
    vi.mocked(getQuery).mockReturnValue({
      q: ' hero ',
      contentType: 'image/png',
      from: '2026-07-01',
      to: '2026-07-31',
      offset: '24',
      limit: '12'
    })
    const list = vi.fn().mockResolvedValue({ items: [mediaItem], total: 30, offset: 24, limit: 12 })
    mediaService({ list })
    const event = makeEvent()

    const body = await (listMedia as Handler)(event)

    expect(list).toHaveBeenCalledWith(
      {
        q: 'hero',
        contentType: 'image/png',
        from: new Date('2026-07-01T00:00:00.000Z'),
        to: new Date('2026-07-31T23:59:59.999Z'),
        offset: 24,
        limit: 12
      },
      currentAdmin.permissions
    )
    expect(body).toEqual({ data: [mediaItem], meta: { total: 30, offset: 24, limit: 12 } })
  })

  it('defaults paging when no query is supplied', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], total: 0, offset: 0, limit: 24 })
    mediaService({ list })

    await (listMedia as Handler)(makeEvent())

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0, limit: 24 }),
      currentAdmin.permissions
    )
  })

  it.each([
    ['a limit above the maximum', { limit: '500' }],
    ['a negative offset', { offset: '-1' }],
    ['an unsupported content type', { contentType: 'image/svg+xml' }],
    ['a malformed date', { from: '07/2026' }],
    ['a normalized nonexistent date', { from: '2026-02-31' }],
    ['an invalid calendar month', { to: '2026-99-09' }],
    ['an inverted date range', { from: '2026-07-31', to: '2026-07-01' }]
  ] as const)('rejects %s as a 422 without reaching the service', async (_label, query) => {
    vi.mocked(getQuery).mockReturnValue({ ...query })
    const list = vi.fn()
    mediaService({ list })
    const event = makeEvent()

    const body = await (listMedia as Handler)(event)

    expect(list).not.toHaveBeenCalled()
    expect(body).toMatchObject({ error: { code: 'validation_failed' } })
    expect(event.node.res.statusCode).toBe(422)
  })
})

describe('admin media stats route', () => {
  it('returns the library summary and the active storage provider', async () => {
    const stats = vi.fn().mockResolvedValue({
      totalCount: 4,
      totalBytes: 8192,
      unknownSizeCount: 1,
      activeProviderKey: 's3-compatible'
    })
    mediaService({ stats })

    const body = await (mediaStats as Handler)(makeEvent())

    expect(stats).toHaveBeenCalledWith(currentAdmin.permissions)
    expect(body).toEqual({
      data: { totalCount: 4, totalBytes: 8192, unknownSizeCount: 1, activeProviderKey: 's3-compatible' },
      meta: {}
    })
  })
})

describe('admin media update route', () => {
  it('passes the trimmed metadata patch through to the service', async () => {
    vi.mocked(getRouterParam).mockReturnValue('media-1')
    vi.mocked(readBody).mockResolvedValue({ altText: 'Hero', caption: 'On the pier' })
    const updateMetadata = vi.fn().mockResolvedValue(mediaItem)
    mediaService({ updateMetadata })

    const body = await (updateMedia as Handler)(makeEvent())

    expect(updateMetadata).toHaveBeenCalledWith(
      'media-1',
      { altText: 'Hero', caption: 'On the pier' },
      currentAdmin.permissions
    )
    expect(body).toEqual({ data: mediaItem, meta: {} })
  })

  it('defaults omitted metadata fields to null so a partial body clears them explicitly', async () => {
    vi.mocked(getRouterParam).mockReturnValue('media-1')
    vi.mocked(readBody).mockResolvedValue({})
    const updateMetadata = vi.fn().mockResolvedValue(mediaItem)
    mediaService({ updateMetadata })

    await (updateMedia as Handler)(makeEvent())

    expect(updateMetadata).toHaveBeenCalledWith(
      'media-1',
      { altText: null, caption: null },
      currentAdmin.permissions
    )
  })

  it('returns 404 for a missing router parameter', async () => {
    vi.mocked(getRouterParam).mockReturnValue(undefined)
    const updateMetadata = vi.fn()
    mediaService({ updateMetadata })
    const event = makeEvent()

    const body = await (updateMedia as Handler)(event)

    expect(updateMetadata).not.toHaveBeenCalled()
    expectErrorEnvelope(body, { code: 'media_not_found', message: 'Image was not found' })
    expect(event.node.res.statusCode).toBe(404)
  })

  it('maps an invalid body to 422', async () => {
    vi.mocked(getRouterParam).mockReturnValue('media-1')
    vi.mocked(readBody).mockResolvedValue({ altText: 42 })
    const updateMetadata = vi.fn()
    mediaService({ updateMetadata })
    const event = makeEvent()

    const body = await (updateMedia as Handler)(event)

    expect(updateMetadata).not.toHaveBeenCalled()
    expect(body).toMatchObject({ error: { code: 'validation_failed' } })
    expect(event.node.res.statusCode).toBe(422)
  })
})

describe('admin media delete route', () => {
  it('deletes without forcing by default', async () => {
    vi.mocked(getRouterParam).mockReturnValue('media-1')
    const remove = vi.fn().mockResolvedValue({ id: 'media-1', objectDeleted: true })
    mediaService({ remove })

    const body = await (deleteMedia as Handler)(makeEvent())

    expect(remove).toHaveBeenCalledWith('media-1', { force: false }, currentAdmin.permissions)
    expect(body).toEqual({ data: { id: 'media-1', objectDeleted: true }, meta: {} })
  })

  it('forwards the explicit force confirmation', async () => {
    vi.mocked(getRouterParam).mockReturnValue('media-1')
    vi.mocked(getQuery).mockReturnValue({ force: 'true' })
    const remove = vi.fn().mockResolvedValue({ id: 'media-1', objectDeleted: true })
    mediaService({ remove })

    await (deleteMedia as Handler)(makeEvent())

    expect(remove).toHaveBeenCalledWith('media-1', { force: true }, currentAdmin.permissions)
  })

  it('surfaces the referencing posts when the image is still in use', async () => {
    vi.mocked(getRouterParam).mockReturnValue('media-1')
    const posts = [{ postId: 'post-1', title: 'Trip notes', slug: 'trip-notes', field: 'content' }]
    const remove = vi.fn().mockRejectedValue(
      mediaError('media_in_use', 'Image is still referenced by published content', 409, { posts })
    )
    mediaService({ remove })
    const event = makeEvent()

    const body = await (deleteMedia as Handler)(event)

    expectErrorEnvelope(body, {
      code: 'media_in_use',
      message: 'Image is still referenced by published content',
      details: { posts }
    })
    expect(event.node.res.statusCode).toBe(409)
  })
})

describe('admin media batch delete route', () => {
  it('passes validated ids and force state to the service', async () => {
    vi.mocked(readBody).mockResolvedValue({ ids: ['media-1', 'media-2'], force: false })
    const removeMany = vi.fn().mockResolvedValue({
      requested: 2,
      deleted: [{ id: 'media-1', objectDeleted: true }],
      blocked: [{ id: 'media-2', usage: [] }],
      failed: []
    })
    mediaService({ removeMany })

    const body = await (batchDeleteMedia as Handler)(makeEvent())

    expect(removeMany).toHaveBeenCalledWith(
      ['media-1', 'media-2'],
      { force: false },
      currentAdmin.permissions
    )
    expect(body).toEqual({
      data: {
        requested: 2,
        deleted: [{ id: 'media-1', objectDeleted: true }],
        blocked: [{ id: 'media-2', usage: [] }],
        failed: []
      },
      meta: {}
    })
  })

  it('rejects an empty selection before service work', async () => {
    vi.mocked(readBody).mockResolvedValue({ ids: [] })
    const removeMany = vi.fn()
    mediaService({ removeMany })
    const event = makeEvent()

    const body = await (batchDeleteMedia as Handler)(event)

    expect(removeMany).not.toHaveBeenCalled()
    expect(body).toMatchObject({ error: { code: 'validation_failed' } })
    expect(event.node.res.statusCode).toBe(422)
  })
})
