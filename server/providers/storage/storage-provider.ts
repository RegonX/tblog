export interface StoragePutInput {
  key: string
  body: ArrayBuffer | ReadableStream | string
  contentType?: string
  cacheControl?: string
  /** Stable application identity written as provider metadata and checked before deletion. */
  objectId?: string
}

export interface StoredObjectMetadata {
  key: string
  size: number
  contentType: string | null
  uploadedAt: Date | null
  objectId: string | null
}

/**
 * Optional object-storage capability (e.g. Cloudflare R2). Write access comes from the binding itself;
 * `publicUrl` composes a browser-facing URL from public configuration. Providers own no publishing or
 * authorization rules — an admin upload flow gates on availability and permissions before using one.
 */
export interface StorageProvider {
  put(input: StoragePutInput): Promise<StoredObjectMetadata>
  head(key: string): Promise<StoredObjectMetadata | null>
  delete(key: string): Promise<void>
  publicUrl(key: string): string
}
