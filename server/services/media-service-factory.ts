import type { H3Event } from 'h3'
import { getDatabaseClient } from '../database/client'
import {
  resolveStorageProviderByKey,
  resolveStorageProviderForEvent
} from '../providers/storage/storage-provider-factory'
import { createCloudflareImageThumbnail } from '../providers/image/cloudflare-image-thumbnail'
import { createMediaReferenceRepository } from '../repositories/media-reference-repository'
import { createMediaService } from './media-service'

export function createMediaServiceForEvent(event: H3Event) {
  const images = event.context.cloudflare?.env?.IMAGES
  return createMediaService({
    mediaRepository: createMediaReferenceRepository(getDatabaseClient(event)),
    resolveStorageProvider: () => resolveStorageProviderForEvent(event),
    resolveStorageProviderByKey: (providerKey, storageLocator) => (
      resolveStorageProviderByKey(event, providerKey, storageLocator)
    ),
    createThumbnail: images ? createCloudflareImageThumbnail(images) : undefined
  })
}
