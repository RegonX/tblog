import { authError } from '../domain/auth-errors'
import { DomainError } from '../domain/domain-error'
import { mediaError } from '../domain/media-errors'
import type { StorageProvider } from '../providers/storage/storage-provider'
import type {
  MediaLibrarySummary,
  MediaReferenceRecord,
  MediaReferenceRepository,
  MediaUsageReference
} from '../repositories/contracts/media-repositories'
import { allowedMediaTypes, MAX_MEDIA_UPLOAD_BYTES } from '../../utils/media'
import type { Permission } from './permissions'

// Re-exported so existing importers keep one media constant surface; the values themselves live in
// `utils/media` because the admin client enforces the same limits before it uploads.
export { allowedMediaTypes, MAX_MEDIA_UPLOAD_BYTES }

export const MAX_MEDIA_ALT_TEXT_BYTES = 1024
export const MAX_MEDIA_CAPTION_BYTES = 2048
export const MAX_MEDIA_FILENAME_BYTES = 255
export const MAX_MEDIA_MULTIPART_BYTES = MAX_MEDIA_UPLOAD_BYTES + 64 * 1024
export const MEDIA_IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'
export const MEDIA_THUMBNAIL_CONTENT_TYPE = 'image/webp'
export const MEDIA_THUMBNAIL_WIDTH = 480
export const MEDIA_THUMBNAIL_QUALITY = 78
/** Upper bound on the content and settings references reported by a blocked delete. */
export const MAX_MEDIA_USAGE_REFERENCES = 20

/** The storage backend currently accepting uploads, plus the key recorded on each stored object. */
export interface ActiveStorage {
  provider: StorageProvider
  providerKey: string
  /** Versioned, non-secret coordinates captured from the active integration configuration. */
  storageLocator: string
}

export interface MediaServiceDependencies {
  mediaRepository: MediaReferenceRepository
  resolveStorageProvider: () => Promise<ActiveStorage | null>
  /** Resolve the backend that holds an existing object, which may not be the active upload target. */
  resolveStorageProviderByKey: (
    providerKey: string,
    storageLocator: string | null
  ) => Promise<StorageProvider | null>
  /** Optional deployment-provided transformer. Uploads remain usable when image processing is unavailable. */
  createThumbnail?: (bytes: Uint8Array) => Promise<ArrayBuffer>
  now?: () => Date
  generateId?: () => string
}

export interface UploadMediaCommand {
  filename: string
  contentType: string
  bytes: Uint8Array
  altText?: string
}

export interface ListMediaQuery {
  offset: number
  limit: number
  q?: string
  contentType?: string
  from?: Date
  to?: Date
}

export interface UpdateMediaMetadataCommand {
  altText: string | null
  caption: string | null
}

export interface MediaItemView {
  id: string
  url: string
  altText: string | null
  caption: string | null
  width: number | null
  height: number | null
  providerKey: string | null
  referenceState: string
  contentType: string | null
  sizeBytes: number | null
  originalFilename: string | null
  thumbnailUrl: string | null
  createdAt: Date
  updatedAt: Date
}

export interface MediaStatsView extends MediaLibrarySummary {
  /** `null` when no storage integration is enabled, which disables uploads in the admin UI. */
  activeProviderKey: string | null
}

export interface DeleteMediaResult {
  id: string
  /** Stored rows are removed only after object deletion succeeds; external rows are already clean. */
  objectDeleted: boolean
}

export interface MediaBatchDeleteResult {
  requested: number
  deleted: DeleteMediaResult[]
  blocked: Array<{ id: string; usage: MediaUsageReference[] }>
  failed: Array<{ id: string; code: string; message: string }>
}

function hasBytes(bytes: Uint8Array, offset: number, expected: readonly number[]) {
  return expected.every((value, index) => bytes[offset + index] === value)
}

function hasAscii(bytes: Uint8Array, offset: number, expected: string) {
  return [...expected].every((value, index) => bytes[offset + index] === value.charCodeAt(0))
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function isAvif(bytes: Uint8Array) {
  if (bytes.byteLength < 16 || !hasAscii(bytes, 4, 'ftyp')) return false

  const boxSize = (
    bytes[0]! * 0x1000000
    + bytes[1]! * 0x10000
    + bytes[2]! * 0x100
    + bytes[3]!
  )
  if (boxSize < 16 || boxSize > bytes.byteLength) return false

  const isAvifBrand = (offset: number) => (
    hasAscii(bytes, offset, 'avif') || hasAscii(bytes, offset, 'avis')
  )
  if (isAvifBrand(8)) return true

  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    if (isAvifBrand(offset)) return true
  }
  return false
}

function hasExpectedImageSignature(contentType: keyof typeof allowedMediaTypes, bytes: Uint8Array) {
  switch (contentType) {
    case 'image/jpeg':
      return bytes.byteLength >= 3 && hasBytes(bytes, 0, [0xff, 0xd8, 0xff])
    case 'image/png':
      return bytes.byteLength >= 8 && hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/gif':
      return bytes.byteLength >= 6 && (hasAscii(bytes, 0, 'GIF87a') || hasAscii(bytes, 0, 'GIF89a'))
    case 'image/webp':
      return bytes.byteLength >= 12 && hasAscii(bytes, 0, 'RIFF') && hasAscii(bytes, 8, 'WEBP')
    case 'image/avif':
      return isAvif(bytes)
  }
}

function requirePostPermission(permissions: readonly Permission[]) {
  if (!permissions.includes('post:*')) throw authError('forbidden', 'Permission denied', 403)
}

async function removeUploadedObject(storage: StorageProvider, key: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await storage.delete(key)
      return true
    } catch {
      // R2 failures are often transient; retry before surfacing the upload failure.
    }
  }
  // There is no durable queue in the Version One stack. Keep the key in logs so deployment
  // maintenance can reconcile an exceptionally persistent orphan without exposing it publicly.
  console.error('Failed to remove orphaned media object', { key })
  return false
}

function toView(record: MediaReferenceRecord): MediaItemView {
  return {
    id: record.id,
    url: record.url,
    altText: record.altText,
    caption: record.caption,
    width: record.width,
    height: record.height,
    providerKey: record.providerKey,
    referenceState: record.referenceState,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    originalFilename: record.originalFilename,
    thumbnailUrl: record.thumbnailUrl,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  }
}

export function thumbnailStorageKey(originalKey: string): string {
  const segments = originalKey.split('/')
  const filename = segments.pop() ?? 'image'
  const stem = filename.replace(/\.[^.]+$/, '')
  const directory = segments[0] === 'images' ? segments.slice(1) : segments
  return ['thumbnails', ...directory, `${stem}.webp`].join('/')
}

/**
 * Recover the object key for rows stored before `storage_key` was tracked. `publicUrl('')` yields the
 * provider's public base plus its configured prefix, so the remainder of a stored URL is the encoded
 * key. Returns `null` when the URL does not belong to this provider — the caller then removes only the
 * database row and reports that the object was left behind, instead of deleting the wrong object.
 */
export function deriveStorageKeyFromUrl(storage: StorageProvider, url: string): string | null {
  let base: string
  try {
    base = storage.publicUrl('')
  } catch {
    return null
  }
  if (!url.startsWith(base)) return null
  const encoded = url.slice(base.length)
  if (!encoded) return null
  try {
    return encoded.split('/').map(decodeURIComponent).join('/')
  } catch {
    return null
  }
}

export function createMediaService(dependencies: MediaServiceDependencies) {
  const now = dependencies.now ?? (() => new Date())
  const generateId = dependencies.generateId ?? (() => crypto.randomUUID())

  async function resolveActiveStorage(): Promise<ActiveStorage> {
    let storage: ActiveStorage | null
    try {
      storage = await dependencies.resolveStorageProvider()
    } catch {
      throw mediaError('storage_unavailable', 'Media storage is temporarily unavailable', 503)
    }
    if (!storage) throw mediaError('storage_unavailable', 'Media storage is not configured', 503)
    return storage
  }

  const service = {
    async upload(command: UploadMediaCommand, permissions: readonly Permission[]) {
      requirePostPermission(permissions)
      const filename = command.filename.trim()
      if (!filename || utf8ByteLength(filename) > MAX_MEDIA_FILENAME_BYTES) {
        throw mediaError('invalid_media', 'Image filename is invalid', 422)
      }
      if (command.altText !== undefined && utf8ByteLength(command.altText) > MAX_MEDIA_ALT_TEXT_BYTES) {
        throw mediaError('invalid_media', 'Image alt text is too long', 422)
      }
      const extension = allowedMediaTypes[command.contentType as keyof typeof allowedMediaTypes]
      if (!extension) {
        throw mediaError('invalid_media', 'Unsupported image type', 422)
      }
      if (command.bytes.byteLength === 0 || command.bytes.byteLength > MAX_MEDIA_UPLOAD_BYTES) {
        throw mediaError('invalid_media', 'Image must be between 1 byte and 10 MiB', 422)
      }
      if (!hasExpectedImageSignature(command.contentType as keyof typeof allowedMediaTypes, command.bytes)) {
        throw mediaError('invalid_media', 'Image content does not match its declared type', 422)
      }

      const { provider: storage, providerKey, storageLocator } = await resolveActiveStorage()

      const timestamp = now()
      const year = timestamp.getUTCFullYear()
      const month = String(timestamp.getUTCMonth() + 1).padStart(2, '0')
      const id = generateId()
      const key = `images/${year}/${month}/${id}.${extension}`
      const body = command.bytes.buffer.slice(
        command.bytes.byteOffset,
        command.bytes.byteOffset + command.bytes.byteLength
      ) as ArrayBuffer
      const thumbnailPromise = dependencies.createThumbnail
        ? dependencies.createThumbnail(command.bytes).catch((error) => {
          console.warn('Failed to generate media thumbnail', { id, error })
          return null
        })
        : Promise.resolve(null)

      try {
        await storage.put({
          key,
          body,
          contentType: command.contentType,
          // Server-generated UUID keys are never overwritten, so public media can be cached safely.
          cacheControl: MEDIA_IMMUTABLE_CACHE_CONTROL,
          // Deletion verifies this identity before touching a key. It protects against a bucket,
          // binding, endpoint, or credential swap that happens to expose the same logical key.
          objectId: id
        })
        let thumbnailKey: string | null = null
        let attemptedThumbnailKey: string | null = null
        let thumbnailUrl: string | null = null
        let thumbnailSizeBytes: number | null = null
        try {
          const thumbnailBytes = await thumbnailPromise
          if (thumbnailBytes && thumbnailBytes.byteLength > 0) {
            thumbnailKey = thumbnailStorageKey(key)
            attemptedThumbnailKey = thumbnailKey
            const thumbnail = await storage.put({
              key: thumbnailKey,
              body: thumbnailBytes,
              contentType: MEDIA_THUMBNAIL_CONTENT_TYPE,
              cacheControl: MEDIA_IMMUTABLE_CACHE_CONTROL,
              objectId: `${id}:thumbnail`
            })
            thumbnailUrl = storage.publicUrl(thumbnailKey)
            thumbnailSizeBytes = thumbnail.size || thumbnailBytes.byteLength
          }
        } catch (error) {
          // A missing derivative must never discard a valid original upload.
          console.warn('Failed to store media thumbnail', { id, error })
          if (attemptedThumbnailKey) await removeUploadedObject(storage, attemptedThumbnailKey)
          thumbnailKey = null
          thumbnailUrl = null
          thumbnailSizeBytes = null
        }
        try {
          const url = storage.publicUrl(key)
          await dependencies.mediaRepository.create({
            id,
            url,
            altText: command.altText?.trim() || null,
            width: null,
            height: null,
            caption: null,
            providerKey,
            referenceState: 'stored',
            storageKey: key,
            storageLocator,
            contentType: command.contentType,
            sizeBytes: command.bytes.byteLength,
            originalFilename: filename,
            thumbnailUrl,
            thumbnailKey,
            thumbnailSizeBytes,
            createdAt: timestamp,
            updatedAt: timestamp
          })
          return {
            id,
            url,
            thumbnailUrl,
            contentType: command.contentType,
            size: command.bytes.byteLength
          }
        } catch (error) {
          if (thumbnailKey) await removeUploadedObject(storage, thumbnailKey)
          await removeUploadedObject(storage, key)
          throw error
        }
      } catch {
        throw mediaError('media_upload_failed', 'Media upload failed', 502)
      }
    },

    async list(query: ListMediaQuery, permissions: readonly Permission[]) {
      requirePostPermission(permissions)
      const page = await dependencies.mediaRepository.list(query)
      return { ...page, items: page.items.map(toView) }
    },

    async get(id: string, permissions: readonly Permission[]): Promise<MediaItemView> {
      requirePostPermission(permissions)
      const record = await dependencies.mediaRepository.findById(id)
      if (!record) throw mediaError('media_not_found', 'Image was not found', 404)
      return toView(record)
    },

    async updateMetadata(
      id: string,
      command: UpdateMediaMetadataCommand,
      permissions: readonly Permission[]
    ): Promise<MediaItemView> {
      requirePostPermission(permissions)
      if (command.altText !== null && utf8ByteLength(command.altText) > MAX_MEDIA_ALT_TEXT_BYTES) {
        throw mediaError('invalid_media', 'Image alt text is too long', 422)
      }
      if (command.caption !== null && utf8ByteLength(command.caption) > MAX_MEDIA_CAPTION_BYTES) {
        throw mediaError('invalid_media', 'Image caption is too long', 422)
      }
      const existing = await dependencies.mediaRepository.findById(id)
      if (!existing) throw mediaError('media_not_found', 'Image was not found', 404)

      const updated = await dependencies.mediaRepository.updateMetadata(id, {
        altText: command.altText?.trim() || null,
        caption: command.caption?.trim() || null,
        updatedAt: now()
      })
      if (!updated) throw mediaError('media_not_found', 'Image was not found', 404)
      return toView(updated)
    },

    async stats(permissions: readonly Permission[]): Promise<MediaStatsView> {
      requirePostPermission(permissions)
      // The database summary and provider readiness do not depend on each other; start them
      // together so the informational toolbar does not wait on two serial reads.
      const summaryPromise = dependencies.mediaRepository.summary()
      let activeProviderKey: string | null = null
      try {
        activeProviderKey = (await dependencies.resolveStorageProvider())?.providerKey ?? null
      } catch {
        // Storage readiness is informational here; the library still lists what is already recorded.
        activeProviderKey = null
      }
      const summary = await summaryPromise
      return { ...summary, activeProviderKey }
    },

    async remove(
      id: string,
      options: { force: boolean },
      permissions: readonly Permission[]
    ): Promise<DeleteMediaResult> {
      requirePostPermission(permissions)
      const record = await dependencies.mediaRepository.findById(id)
      if (!record) throw mediaError('media_not_found', 'Image was not found', 404)

      if (!options.force) {
        const usage: MediaUsageReference[] = await dependencies.mediaRepository.findUsage(
          record.url,
          MAX_MEDIA_USAGE_REFERENCES
        )
        if (usage.length > 0) {
          throw mediaError(
            'media_in_use',
            'Image is still referenced by content or settings',
            409,
            { posts: usage }
          )
        }
      }

      if (record.referenceState === 'stored') {
        if (!record.providerKey) {
          throw mediaError(
            'storage_unavailable',
            'The storage backend holding this image cannot be identified',
            503
          )
        }

        const storage = await dependencies.resolveStorageProviderByKey(
          record.providerKey,
          record.storageLocator
        )
        if (!storage) {
          // The immutable location may no longer be reachable with the deployment's current binding
          // or credentials. Keep the row so an operator never loses the coordinates of an orphan.
          throw mediaError(
            'storage_unavailable',
            'The storage backend holding this image is not configured',
            503
          )
        }

        let key = record.storageKey
        if (!record.storageLocator) {
          // Legacy rows have no immutable coordinates. Require today's public URL mapping to agree
          // with the recorded key before allowing a destructive request.
          const derivedKey = deriveStorageKeyFromUrl(storage, record.url)
          if (!derivedKey || (key && key !== derivedKey)) {
            throw mediaError(
              'storage_unavailable',
              'The original storage location for this image cannot be verified',
              503
            )
          }
          key ??= derivedKey
        } else if (!key) {
          key = deriveStorageKeyFromUrl(storage, record.url)
        }
        if (!key) {
          throw mediaError(
            'storage_unavailable',
            'The stored image key cannot be recovered safely',
            503
          )
        }

        if (record.storageLocator) {
          let object
          try {
            object = await storage.head(key)
          } catch {
            throw mediaError(
              'storage_unavailable',
              'The stored image could not be verified before deletion',
              503
            )
          }
          if (!object || object.objectId !== record.id) {
            // A missing or differently tagged object means the resolved bucket is not provably the
            // one used for this upload. Never issue DELETE against an unverified same-named object.
            throw mediaError(
              'storage_unavailable',
              'The stored image no longer matches its recorded storage location',
              503
            )
          }
        }

        if (record.thumbnailKey) {
          let thumbnail
          try {
            thumbnail = await storage.head(record.thumbnailKey)
          } catch {
            throw mediaError(
              'storage_unavailable',
              'The stored image thumbnail could not be verified before deletion',
              503
            )
          }
          if (thumbnail && thumbnail.objectId !== `${record.id}:thumbnail`) {
            throw mediaError(
              'storage_unavailable',
              'The stored image thumbnail no longer matches its recorded storage location',
              503
            )
          }
          if (thumbnail && !await removeUploadedObject(storage, record.thumbnailKey)) {
            throw mediaError('storage_unavailable', 'The image thumbnail could not be deleted', 503)
          }
        }

        if (!await removeUploadedObject(storage, key)) {
          throw mediaError('storage_unavailable', 'The stored image could not be deleted', 503)
        }
      }

      await dependencies.mediaRepository.deleteById(id)
      return { id, objectDeleted: true }
    },

    async removeMany(
      ids: string[],
      options: { force: boolean },
      permissions: readonly Permission[]
    ): Promise<MediaBatchDeleteResult> {
      requirePostPermission(permissions)
      const uniqueIds = [...new Set(ids)]
      const result: MediaBatchDeleteResult = {
        requested: uniqueIds.length,
        deleted: [],
        blocked: [],
        failed: []
      }

      for (const id of uniqueIds) {
        try {
          result.deleted.push(await service.remove(id, options, permissions))
        } catch (error) {
          if (error instanceof DomainError && error.code === 'media_in_use') {
            const usage = Array.isArray(error.details.posts)
              ? error.details.posts as MediaUsageReference[]
              : []
            result.blocked.push({ id, usage })
            continue
          }
          result.failed.push({
            id,
            code: error instanceof DomainError ? error.code : 'internal_error',
            message: error instanceof DomainError ? error.message : 'Unable to delete this image'
          })
        }
      }

      return result
    }
  }

  return service
}

export type MediaService = ReturnType<typeof createMediaService>
