import { vi } from 'vitest'
import type {
  MediaReferenceRecord,
  MediaReferenceRepository
} from '../../../server/repositories/contracts/media-repositories'
import {
  createMediaService,
  deriveStorageKeyFromUrl,
  MEDIA_IMMUTABLE_CACHE_CONTROL,
  MAX_MEDIA_ALT_TEXT_BYTES,
  MAX_MEDIA_CAPTION_BYTES,
  MAX_MEDIA_FILENAME_BYTES,
  MAX_MEDIA_UPLOAD_BYTES
} from '../../../server/services/media-service'

describe('media service', () => {
  function storageLocator(providerKey = 'cloudflare-r2') {
    return JSON.stringify({ version: 1, providerKey, config: { publicBaseUrl: 'https://media.example' } })
  }

  function activeStorage(provider: ReturnType<typeof createStorage>, providerKey = 'cloudflare-r2') {
    return { provider, providerKey, storageLocator: storageLocator(providerKey) }
  }

  const signatures = {
    'image/jpeg': new Uint8Array([0xff, 0xd8, 0xff]),
    'image/png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    'image/gif': new TextEncoder().encode('GIF89a'),
    'image/webp': new Uint8Array([
      ...new TextEncoder().encode('RIFF'),
      0x04, 0x00, 0x00, 0x00,
      ...new TextEncoder().encode('WEBP')
    ]),
    'image/avif': new Uint8Array([
      0x00, 0x00, 0x00, 0x10,
      ...new TextEncoder().encode('ftypavif'),
      0x00, 0x00, 0x00, 0x00
    ])
  } as const

  function createStorage() {
    return {
      put: vi.fn().mockResolvedValue({
        key: 'stored', size: 8, contentType: 'image/png', uploadedAt: null, objectId: 'media-id'
      }),
      head: vi.fn().mockResolvedValue({
        key: 'stored', size: 8, contentType: 'image/png', uploadedAt: null, objectId: 'media-id'
      }),
      delete: vi.fn().mockResolvedValue(undefined),
      publicUrl: vi.fn((key: string) => `https://media.example/${key}`)
    }
  }

  function storedRecord(overrides: Partial<MediaReferenceRecord> = {}): MediaReferenceRecord {
    return {
      id: 'media-id',
      url: 'https://media.example/images/2026/07/media-id.png',
      altText: null,
      width: null,
      height: null,
      caption: null,
      providerKey: 'cloudflare-r2',
      referenceState: 'stored',
      storageKey: 'images/2026/07/media-id.png',
      storageLocator: storageLocator(),
      contentType: 'image/png',
      sizeBytes: 8,
      originalFilename: 'photo.png',
      thumbnailUrl: null,
      thumbnailKey: null,
      thumbnailSizeBytes: null,
      createdAt: new Date('2026-07-15T00:00:00.000Z'),
      updatedAt: new Date('2026-07-15T00:00:00.000Z'),
      ...overrides
    }
  }

  function createRepository(overrides: Partial<MediaReferenceRepository> = {}): MediaReferenceRepository {
    return {
      create: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ items: [], total: 0, offset: 0, limit: 24 }),
      findById: vi.fn().mockResolvedValue(null),
      updateMetadata: vi.fn().mockResolvedValue(null),
      deleteById: vi.fn().mockResolvedValue(undefined),
      summary: vi.fn().mockResolvedValue({ totalCount: 0, totalBytes: 0, unknownSizeCount: 0 }),
      findUsage: vi.fn().mockResolvedValue([]),
      ...overrides
    }
  }

  it('uploads through storage and records the public media reference with its metadata', async () => {
    const storage = createStorage()
    const create = vi.fn().mockResolvedValue(undefined)
    const service = createMediaService({
      mediaRepository: createRepository({ create }),
      resolveStorageProvider: async () => activeStorage(storage),
      resolveStorageProviderByKey: async () => storage,
      now: () => new Date('2026-07-15T00:00:00.000Z'),
      generateId: () => 'media-id'
    })

    const result = await service.upload(
      { filename: 'photo.png', contentType: 'image/png', bytes: signatures['image/png'], altText: 'Photo' },
      ['post:*']
    )

    expect(storage.put).toHaveBeenCalledWith(expect.objectContaining({
      key: 'images/2026/07/media-id.png',
      contentType: 'image/png',
      cacheControl: MEDIA_IMMUTABLE_CACHE_CONTROL,
      objectId: 'media-id'
    }))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      id: 'media-id',
      url: 'https://media.example/images/2026/07/media-id.png',
      providerKey: 'cloudflare-r2',
      referenceState: 'stored',
      storageKey: 'images/2026/07/media-id.png',
      storageLocator: storageLocator(),
      contentType: 'image/png',
      sizeBytes: signatures['image/png'].byteLength,
      originalFilename: 'photo.png'
    }))
    expect(result.url).toContain('media-id.png')
  })

  it('records the provider key of whichever storage backend is active', async () => {
    const storage = createStorage()
    const create = vi.fn().mockResolvedValue(undefined)
    const service = createMediaService({
      mediaRepository: createRepository({ create }),
      resolveStorageProvider: async () => activeStorage(storage, 's3-compatible'),
      resolveStorageProviderByKey: async () => storage,
      generateId: () => 'media-id'
    })

    await service.upload(
      { filename: 'photo.png', contentType: 'image/png', bytes: signatures['image/png'] },
      ['post:*']
    )

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ providerKey: 's3-compatible' }))
  })

  it('stores a generated WebP thumbnail beside the original when a transformer is available', async () => {
    const storage = createStorage()
    const create = vi.fn().mockResolvedValue(undefined)
    const thumbnailBytes = new Uint8Array([1, 2, 3, 4]).buffer
    const service = createMediaService({
      mediaRepository: createRepository({ create }),
      resolveStorageProvider: async () => activeStorage(storage),
      resolveStorageProviderByKey: async () => storage,
      createThumbnail: vi.fn().mockResolvedValue(thumbnailBytes),
      now: () => new Date('2026-07-15T00:00:00.000Z'),
      generateId: () => 'media-id'
    })

    const result = await service.upload(
      { filename: 'photo.png', contentType: 'image/png', bytes: signatures['image/png'] },
      ['post:*']
    )

    expect(storage.put).toHaveBeenNthCalledWith(2, expect.objectContaining({
      key: 'thumbnails/2026/07/media-id.webp',
      body: thumbnailBytes,
      contentType: 'image/webp',
      objectId: 'media-id:thumbnail'
    }))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      thumbnailUrl: 'https://media.example/thumbnails/2026/07/media-id.webp',
      thumbnailKey: 'thumbnails/2026/07/media-id.webp',
      thumbnailSizeBytes: 8
    }))
    expect(result.thumbnailUrl).toBe('https://media.example/thumbnails/2026/07/media-id.webp')
  })

  it.each(Object.entries(signatures))('accepts a valid minimal %s signature', async (contentType, bytes) => {
    const storage = createStorage()
    const service = createMediaService({
      mediaRepository: createRepository(),
      resolveStorageProvider: async () => activeStorage(storage),
      resolveStorageProviderByKey: async () => storage,
      generateId: () => 'media-id'
    })

    await expect(service.upload(
      { filename: 'image', contentType, bytes },
      ['post:*']
    )).resolves.toMatchObject({ contentType, size: bytes.byteLength })
  })

  it.each(Object.keys(signatures))('rejects content that does not match declared type %s', async (contentType) => {
    const resolveStorageProvider = vi.fn()
    const service = createMediaService({
      mediaRepository: createRepository(),
      resolveStorageProvider,
      resolveStorageProviderByKey: async () => null
    })
    const differentValidImage = contentType === 'image/png'
      ? signatures['image/jpeg']
      : signatures['image/png']

    await expect(service.upload(
      { filename: 'mismatch', contentType, bytes: differentValidImage },
      ['post:*']
    )).rejects.toMatchObject({ code: 'invalid_media' })
    expect(resolveStorageProvider).not.toHaveBeenCalled()
  })

  it('requires post permission before resolving storage', async () => {
    const resolveStorageProvider = vi.fn()
    const service = createMediaService({
      mediaRepository: createRepository(),
      resolveStorageProvider,
      resolveStorageProviderByKey: async () => null
    })

    await expect(service.upload(
      { filename: 'x.png', contentType: 'image/png', bytes: signatures['image/png'] },
      []
    )).rejects.toMatchObject({ code: 'forbidden' })
    expect(resolveStorageProvider).not.toHaveBeenCalled()
  })

  it.each([
    { filename: '', altText: undefined },
    { filename: 'a'.repeat(MAX_MEDIA_FILENAME_BYTES + 1), altText: undefined },
    { filename: 'image.png', altText: 'a'.repeat(MAX_MEDIA_ALT_TEXT_BYTES + 1) }
  ])('rejects oversized or invalid text metadata before resolving storage: %#', async ({ filename, altText }) => {
    const resolveStorageProvider = vi.fn()
    const service = createMediaService({
      mediaRepository: createRepository(),
      resolveStorageProvider,
      resolveStorageProviderByKey: async () => null
    })

    await expect(service.upload(
      { filename, contentType: 'image/png', bytes: signatures['image/png'], altText },
      ['post:*']
    )).rejects.toMatchObject({ code: 'invalid_media' })
    expect(resolveStorageProvider).not.toHaveBeenCalled()
  })

  it('deletes the stored object when reference persistence fails', async () => {
    const storage = createStorage()
    const service = createMediaService({
      mediaRepository: createRepository({
        create: vi.fn().mockRejectedValue(new Error('database unavailable'))
      }),
      resolveStorageProvider: async () => activeStorage(storage),
      resolveStorageProviderByKey: async () => storage,
      now: () => new Date('2026-07-15T00:00:00.000Z'),
      generateId: () => 'media-id'
    })

    await expect(service.upload(
      { filename: 'x.png', contentType: 'image/png', bytes: signatures['image/png'] },
      ['post:*']
    )).rejects.toMatchObject({ code: 'media_upload_failed' })
    expect(storage.delete).toHaveBeenCalledWith('images/2026/07/media-id.png')
  })

  it('retries transient cleanup failures after reference persistence fails', async () => {
    const storage = createStorage()
    storage.delete
      .mockRejectedValueOnce(new Error('temporary R2 failure'))
      .mockRejectedValueOnce(new Error('temporary R2 failure'))
      .mockResolvedValueOnce(undefined)
    const service = createMediaService({
      mediaRepository: createRepository({
        create: vi.fn().mockRejectedValue(new Error('database unavailable'))
      }),
      resolveStorageProvider: async () => activeStorage(storage),
      resolveStorageProviderByKey: async () => storage,
      generateId: () => 'media-id',
      now: () => new Date('2026-07-16T12:00:00.000Z')
    })

    await expect(service.upload(
      { filename: 'x.png', contentType: 'image/png', bytes: signatures['image/png'] },
      ['post:*']
    )).rejects.toMatchObject({ code: 'media_upload_failed' })
    expect(storage.delete).toHaveBeenCalledTimes(3)
  })

  it('rejects unsupported/oversized files and unavailable storage', async () => {
    const service = createMediaService({
      mediaRepository: createRepository(),
      resolveStorageProvider: async () => null,
      resolveStorageProviderByKey: async () => null
    })
    await expect(service.upload(
      { filename: 'x.svg', contentType: 'image/svg+xml', bytes: new Uint8Array([1]) },
      ['post:*']
    )).rejects.toMatchObject({ code: 'invalid_media' })
    await expect(service.upload(
      { filename: 'x.png', contentType: 'image/png', bytes: new Uint8Array(MAX_MEDIA_UPLOAD_BYTES + 1) },
      ['post:*']
    )).rejects.toMatchObject({ code: 'invalid_media' })
    await expect(service.upload(
      { filename: 'x.png', contentType: 'image/png', bytes: signatures['image/png'] },
      ['post:*']
    )).rejects.toMatchObject({ code: 'storage_unavailable' })
  })

  it('maps storage resolver failures to a safe unavailable error', async () => {
    const service = createMediaService({
      mediaRepository: createRepository(),
      resolveStorageProvider: async () => { throw new Error('binding lookup failed') },
      resolveStorageProviderByKey: async () => null
    })

    await expect(service.upload(
      { filename: 'x.png', contentType: 'image/png', bytes: signatures['image/png'] },
      ['post:*']
    )).rejects.toMatchObject({ code: 'storage_unavailable', statusCode: 503 })
  })

  describe('library reads', () => {
    it('lists media references as views and preserves paging metadata', async () => {
      const list = vi.fn().mockResolvedValue({
        items: [storedRecord()],
        total: 1,
        offset: 0,
        limit: 24
      })
      const service = createMediaService({
        mediaRepository: createRepository({ list }),
        resolveStorageProvider: async () => null,
        resolveStorageProviderByKey: async () => null
      })

      const page = await service.list({ offset: 0, limit: 24, q: 'photo' }, ['post:*'])

      expect(list).toHaveBeenCalledWith({ offset: 0, limit: 24, q: 'photo' })
      expect(page).toMatchObject({ total: 1, offset: 0, limit: 24 })
      expect(page.items[0]).toMatchObject({ id: 'media-id', originalFilename: 'photo.png' })
      // The storage key is an internal routing detail and stays out of the API view.
      expect(page.items[0]).not.toHaveProperty('storageKey')
    })

    it('reports the active storage provider alongside the library summary', async () => {
      const storage = createStorage()
      const service = createMediaService({
        mediaRepository: createRepository({
          summary: vi.fn().mockResolvedValue({ totalCount: 3, totalBytes: 2048, unknownSizeCount: 1 })
        }),
        resolveStorageProvider: async () => activeStorage(storage, 's3-compatible'),
        resolveStorageProviderByKey: async () => storage
      })

      await expect(service.stats(['post:*'])).resolves.toEqual({
        totalCount: 3,
        totalBytes: 2048,
        unknownSizeCount: 1,
        activeProviderKey: 's3-compatible'
      })
    })

    it('still reports the summary when no storage provider is configured', async () => {
      const service = createMediaService({
        mediaRepository: createRepository({
          summary: vi.fn().mockResolvedValue({ totalCount: 2, totalBytes: 10, unknownSizeCount: 0 })
        }),
        resolveStorageProvider: async () => { throw new Error('lookup failed') },
        resolveStorageProviderByKey: async () => null
      })

      await expect(service.stats(['post:*'])).resolves.toMatchObject({ activeProviderKey: null })
    })

    it('requires post permission for library reads', async () => {
      const service = createMediaService({
        mediaRepository: createRepository(),
        resolveStorageProvider: async () => null,
        resolveStorageProviderByKey: async () => null
      })

      await expect(service.list({ offset: 0, limit: 24 }, [])).rejects.toMatchObject({ code: 'forbidden' })
      await expect(service.stats([])).rejects.toMatchObject({ code: 'forbidden' })
      await expect(service.remove('media-id', { force: false }, [])).rejects.toMatchObject({ code: 'forbidden' })
    })
  })

  describe('metadata updates', () => {
    it('trims alt text and caption and returns the updated view', async () => {
      const updateMetadata = vi.fn().mockResolvedValue(storedRecord({ altText: 'Sunset', caption: 'On the pier' }))
      const service = createMediaService({
        mediaRepository: createRepository({
          findById: vi.fn().mockResolvedValue(storedRecord()),
          updateMetadata
        }),
        resolveStorageProvider: async () => null,
        resolveStorageProviderByKey: async () => null,
        now: () => new Date('2026-07-20T00:00:00.000Z')
      })

      const result = await service.updateMetadata(
        'media-id',
        { altText: '  Sunset  ', caption: '  On the pier  ' },
        ['post:*']
      )

      expect(updateMetadata).toHaveBeenCalledWith('media-id', {
        altText: 'Sunset',
        caption: 'On the pier',
        updatedAt: new Date('2026-07-20T00:00:00.000Z')
      })
      expect(result).toMatchObject({ altText: 'Sunset', caption: 'On the pier' })
    })

    it('rejects oversized alt text and captions', async () => {
      const service = createMediaService({
        mediaRepository: createRepository({ findById: vi.fn().mockResolvedValue(storedRecord()) }),
        resolveStorageProvider: async () => null,
        resolveStorageProviderByKey: async () => null
      })

      await expect(service.updateMetadata(
        'media-id',
        { altText: 'a'.repeat(MAX_MEDIA_ALT_TEXT_BYTES + 1), caption: null },
        ['post:*']
      )).rejects.toMatchObject({ code: 'invalid_media' })
      await expect(service.updateMetadata(
        'media-id',
        { altText: null, caption: 'a'.repeat(MAX_MEDIA_CAPTION_BYTES + 1) },
        ['post:*']
      )).rejects.toMatchObject({ code: 'invalid_media' })
    })

    it('reports a missing media reference', async () => {
      const service = createMediaService({
        mediaRepository: createRepository(),
        resolveStorageProvider: async () => null,
        resolveStorageProviderByKey: async () => null
      })

      await expect(service.updateMetadata('missing', { altText: null, caption: null }, ['post:*']))
        .rejects.toMatchObject({ code: 'media_not_found', statusCode: 404 })
      await expect(service.get('missing', ['post:*']))
        .rejects.toMatchObject({ code: 'media_not_found', statusCode: 404 })
    })
  })

  describe('deletion', () => {
    it('removes the stored object and the record when nothing references it', async () => {
      const storage = createStorage()
      const deleteById = vi.fn().mockResolvedValue(undefined)
      const service = createMediaService({
        mediaRepository: createRepository({
          findById: vi.fn().mockResolvedValue(storedRecord()),
          deleteById
        }),
        resolveStorageProvider: async () => activeStorage(storage),
        resolveStorageProviderByKey: async () => storage
      })

      await expect(service.remove('media-id', { force: false }, ['post:*']))
        .resolves.toEqual({ id: 'media-id', objectDeleted: true })
      expect(storage.delete).toHaveBeenCalledWith('images/2026/07/media-id.png')
      expect(deleteById).toHaveBeenCalledWith('media-id')
    })

    it('removes the thumbnail before removing the original object', async () => {
      const storage = createStorage()
      storage.head.mockImplementation(async (key: string) => ({
        key,
        size: 8,
        contentType: key.includes('thumbnail') ? 'image/webp' : 'image/png',
        uploadedAt: null,
        objectId: key.includes('thumbnail') ? 'media-id:thumbnail' : 'media-id'
      }))
      const deleteById = vi.fn().mockResolvedValue(undefined)
      const service = createMediaService({
        mediaRepository: createRepository({
          findById: vi.fn().mockResolvedValue(storedRecord({
            thumbnailUrl: 'https://media.example/thumbnails/2026/07/media-id.webp',
            thumbnailKey: 'thumbnails/2026/07/media-id.webp',
            thumbnailSizeBytes: 8
          })),
          deleteById
        }),
        resolveStorageProvider: async () => activeStorage(storage),
        resolveStorageProviderByKey: async () => storage
      })

      await service.remove('media-id', { force: true }, ['post:*'])

      expect(storage.delete.mock.calls.map(([key]) => key)).toEqual([
        'thumbnails/2026/07/media-id.webp',
        'images/2026/07/media-id.png'
      ])
      expect(deleteById).toHaveBeenCalledWith('media-id')
    })

    it('refuses to delete a referenced image and reports the referencing posts', async () => {
      const storage = createStorage()
      const deleteById = vi.fn()
      const service = createMediaService({
        mediaRepository: createRepository({
          findById: vi.fn().mockResolvedValue(storedRecord()),
          findUsage: vi.fn().mockResolvedValue([
            { postId: 'post-1', title: 'Trip notes', slug: 'trip-notes', field: 'content' }
          ]),
          deleteById
        }),
        resolveStorageProvider: async () => activeStorage(storage),
        resolveStorageProviderByKey: async () => storage
      })

      await expect(service.remove('media-id', { force: false }, ['post:*'])).rejects.toMatchObject({
        code: 'media_in_use',
        statusCode: 409,
        details: { posts: [{ postId: 'post-1', title: 'Trip notes', slug: 'trip-notes', field: 'content' }] }
      })
      expect(deleteById).not.toHaveBeenCalled()
      expect(storage.delete).not.toHaveBeenCalled()
    })

    it('deletes a referenced image when the administrator forces it', async () => {
      const storage = createStorage()
      const findUsage = vi.fn()
      const deleteById = vi.fn().mockResolvedValue(undefined)
      const service = createMediaService({
        mediaRepository: createRepository({
          findById: vi.fn().mockResolvedValue(storedRecord()),
          findUsage,
          deleteById
        }),
        resolveStorageProvider: async () => activeStorage(storage),
        resolveStorageProviderByKey: async () => storage
      })

      await expect(service.remove('media-id', { force: true }, ['post:*']))
        .resolves.toEqual({ id: 'media-id', objectDeleted: true })
      expect(findUsage).not.toHaveBeenCalled()
      expect(deleteById).toHaveBeenCalledWith('media-id')
    })

    it('routes the object delete to the backend recorded on the reference', async () => {
      const storage = createStorage()
      const resolveStorageProviderByKey = vi.fn().mockResolvedValue(storage)
      const service = createMediaService({
        mediaRepository: createRepository({
          findById: vi.fn().mockResolvedValue(storedRecord({
            providerKey: 's3-compatible',
            storageLocator: storageLocator('s3-compatible')
          })),
          deleteById: vi.fn().mockResolvedValue(undefined)
        }),
        // The active upload target is a different backend than the one holding this object.
        resolveStorageProvider: async () => activeStorage(createStorage()),
        resolveStorageProviderByKey
      })

      await service.remove('media-id', { force: true }, ['post:*'])

      expect(resolveStorageProviderByKey).toHaveBeenCalledWith(
        's3-compatible',
        storageLocator('s3-compatible')
      )
      expect(storage.delete).toHaveBeenCalled()
    })

    it('recovers the object key from the public URL for rows stored before key tracking', async () => {
      const storage = createStorage()
      const service = createMediaService({
        mediaRepository: createRepository({
          findById: vi.fn().mockResolvedValue(storedRecord({ storageKey: null, storageLocator: null })),
          deleteById: vi.fn().mockResolvedValue(undefined)
        }),
        resolveStorageProvider: async () => activeStorage(storage),
        resolveStorageProviderByKey: async () => storage
      })

      await service.remove('media-id', { force: true }, ['post:*'])

      expect(storage.delete).toHaveBeenCalledWith('images/2026/07/media-id.png')
    })

    it('keeps the record when the object cannot be deleted', async () => {
      const storage = createStorage()
      storage.delete.mockRejectedValue(new Error('permanent failure'))
      const deleteById = vi.fn().mockResolvedValue(undefined)
      const service = createMediaService({
        mediaRepository: createRepository({
          findById: vi.fn().mockResolvedValue(storedRecord()),
          deleteById
        }),
        resolveStorageProvider: async () => activeStorage(storage),
        resolveStorageProviderByKey: async () => storage
      })

      await expect(service.remove('media-id', { force: true }, ['post:*']))
        .rejects.toMatchObject({ code: 'storage_unavailable', statusCode: 503 })
      expect(deleteById).not.toHaveBeenCalled()
    })

    it('refuses to delete a same-named object that does not carry the upload identity', async () => {
      const storage = createStorage()
      storage.head.mockResolvedValue({
        key: 'stored', size: 8, contentType: 'image/png', uploadedAt: null, objectId: 'another-upload'
      })
      const deleteById = vi.fn()
      const service = createMediaService({
        mediaRepository: createRepository({
          findById: vi.fn().mockResolvedValue(storedRecord()),
          deleteById
        }),
        resolveStorageProvider: async () => activeStorage(storage),
        resolveStorageProviderByKey: async () => storage
      })

      await expect(service.remove('media-id', { force: true }, ['post:*']))
        .rejects.toMatchObject({ code: 'storage_unavailable', statusCode: 503 })
      expect(storage.delete).not.toHaveBeenCalled()
      expect(deleteById).not.toHaveBeenCalled()
    })

    it('refuses to delete when the backend holding the object is no longer configured', async () => {
      const deleteById = vi.fn()
      const service = createMediaService({
        mediaRepository: createRepository({
          findById: vi.fn().mockResolvedValue(storedRecord()),
          deleteById
        }),
        resolveStorageProvider: async () => null,
        resolveStorageProviderByKey: async () => null
      })

      await expect(service.remove('media-id', { force: true }, ['post:*']))
        .rejects.toMatchObject({ code: 'storage_unavailable', statusCode: 503 })
      expect(deleteById).not.toHaveBeenCalled()
    })

    it('deletes an external reference without touching object storage', async () => {
      const resolveStorageProviderByKey = vi.fn()
      const deleteById = vi.fn().mockResolvedValue(undefined)
      const service = createMediaService({
        mediaRepository: createRepository({
          findById: vi.fn().mockResolvedValue(storedRecord({
            referenceState: 'external',
            providerKey: null,
            storageKey: null,
            url: 'https://cdn.example.com/remote.png'
          })),
          deleteById
        }),
        resolveStorageProvider: async () => null,
        resolveStorageProviderByKey
      })

      await expect(service.remove('media-id', { force: true }, ['post:*']))
        .resolves.toEqual({ id: 'media-id', objectDeleted: true })
      expect(resolveStorageProviderByKey).not.toHaveBeenCalled()
      expect(deleteById).toHaveBeenCalledWith('media-id')
    })

    it('reports a missing media reference', async () => {
      const service = createMediaService({
        mediaRepository: createRepository(),
        resolveStorageProvider: async () => null,
        resolveStorageProviderByKey: async () => null
      })

      await expect(service.remove('missing', { force: false }, ['post:*']))
        .rejects.toMatchObject({ code: 'media_not_found', statusCode: 404 })
    })

    it('processes batch deletes independently and returns reference blockers', async () => {
      const storage = createStorage()
      storage.head.mockImplementation(async (key: string) => {
        const id = key.includes('media-2') ? 'media-2' : 'media-1'
        return {
          key,
          size: 8,
          contentType: 'image/png',
          uploadedAt: null,
          objectId: id
        }
      })
      const service = createMediaService({
        mediaRepository: createRepository({
          findById: vi.fn().mockImplementation(async (id: string) => storedRecord({
            id,
            url: `https://media.example/images/2026/07/${id}.png`,
            storageKey: `images/2026/07/${id}.png`
          })),
          findUsage: vi.fn().mockImplementation(async (url: string) => url.includes('media-2')
            ? [{ postId: 'post-2', title: 'Trip notes', slug: 'trip-notes', field: 'content' }]
            : [])
        }),
        resolveStorageProvider: async () => activeStorage(storage),
        resolveStorageProviderByKey: async () => storage
      })

      await expect(service.removeMany(['media-1', 'media-2'], { force: false }, ['post:*']))
        .resolves.toMatchObject({
          requested: 2,
          deleted: [{ id: 'media-1' }],
          blocked: [{ id: 'media-2', usage: [{ postId: 'post-2' }] }],
          failed: []
        })
    })
  })

  describe('deriveStorageKeyFromUrl', () => {
    const storage = {
      put: vi.fn(),
      head: vi.fn(),
      delete: vi.fn(),
      publicUrl: (key: string) => `https://media.example/uploads/${key}`
    }

    it('recovers a percent-encoded key that belongs to the provider', () => {
      expect(deriveStorageKeyFromUrl(storage, 'https://media.example/uploads/images/a%20b.png'))
        .toBe('images/a b.png')
    })

    it('returns null for a URL that does not belong to the provider', () => {
      expect(deriveStorageKeyFromUrl(storage, 'https://other.example/images/a.png')).toBeNull()
      expect(deriveStorageKeyFromUrl(storage, 'https://media.example/uploads/')).toBeNull()
    })

    it('returns null when the provider cannot compose a public URL', () => {
      expect(deriveStorageKeyFromUrl(
        { ...storage, publicUrl: () => { throw new Error('not configured') } },
        'https://media.example/uploads/images/a.png'
      )).toBeNull()
    })
  })
})
