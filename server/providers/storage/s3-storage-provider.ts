import { signAwsV4, sha256Hex } from './aws-sigv4'
import type { StorageProvider, StoragePutInput, StoredObjectMetadata } from './storage-provider'

export interface S3StorageProviderOptions {
  /** Bucket service endpoint, e.g. `https://s3.us-west-1.amazonaws.com` or a MinIO host. */
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  /** Public base URL browsers use to read objects (CDN or bucket custom domain). */
  publicBaseUrl: string
  keyPrefix?: string
  /** `true` puts the bucket in the path (MinIO and most self-hosted gateways). */
  forcePathStyle?: boolean
  fetchImpl?: typeof fetch
  now?: () => Date
}

function encodeKeyPath(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}

function parseSize(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 0
  const size = Number(value)
  return Number.isSafeInteger(size) ? size : 0
}

function parseUploadedAt(value: string | null): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

async function toBytes(body: ArrayBuffer | ReadableStream | string): Promise<Uint8Array> {
  if (typeof body === 'string') return new TextEncoder().encode(body)
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  // SigV4 signs a payload hash, so a stream has to be materialized before it can be signed. Media
  // uploads are already bounded by MAX_MEDIA_UPLOAD_BYTES, so this stays within the Worker's memory.
  return new Uint8Array(await new Response(body).arrayBuffer())
}

/**
 * `StorageProvider` over any S3-compatible object store (AWS S3, MinIO, Aliyun OSS, Tencent COS,
 * Backblaze B2, R2's S3 API). Requests are signed with SigV4 using credentials the deployment supplies
 * as Worker secrets — nothing is read from persisted configuration. Errors propagate so an admin upload
 * flow reports a clear failure instead of silently losing the object.
 */
export function createS3StorageProvider(options: S3StorageProviderOptions): StorageProvider {
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? (() => new Date())
  const prefix = options.keyPrefix ?? ''
  const endpoint = new URL(options.endpoint)

  function fullKey(key: string): string {
    return prefix ? `${prefix}${key}` : key
  }

  function objectUrl(key: string): URL {
    const encodedKey = encodeKeyPath(fullKey(key))
    const basePath = endpoint.pathname.replace(/\/+$/, '')
    const url = new URL(endpoint.toString())
    if (options.forcePathStyle) {
      url.pathname = `${basePath}/${encodeURIComponent(options.bucket)}/${encodedKey}`
    } else {
      url.host = `${options.bucket}.${endpoint.host}`
      url.pathname = `${basePath}/${encodedKey}`
    }
    return url
  }

  async function send(
    method: string,
    key: string,
    body?: Uint8Array,
    extraHeaders: Record<string, string> = {}
  ): Promise<Response> {
    const url = objectUrl(key)
    const payloadHash = await sha256Hex(body ?? '')
    const headers = await signAwsV4({
      method,
      url,
      headers: {
        ...extraHeaders,
        // S3 requires the payload hash as a signed header on every request. `content-length` is
        // deliberately not signed: runtimes set it themselves for a fixed-length body and may
        // normalize or drop an explicit one, which would silently invalidate the signature.
        'x-amz-content-sha256': payloadHash
      },
      payloadHash,
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      sessionToken: options.sessionToken,
      region: options.region,
      service: 's3',
      date: now()
    })
    return fetchImpl(url.toString(), {
      method,
      headers,
      ...(body ? { body: body as unknown as BodyInit } : {})
    })
  }

  return {
    async put(input: StoragePutInput): Promise<StoredObjectMetadata> {
      const bytes = await toBytes(input.body)
      const response = await send('PUT', input.key, bytes, {
        ...(input.contentType ? { 'content-type': input.contentType } : {}),
        ...(input.cacheControl ? { 'cache-control': input.cacheControl } : {}),
        ...(input.objectId ? { 'x-amz-meta-tblog-object-id': input.objectId } : {})
      })
      if (!response.ok) {
        throw new Error(`S3 storage put failed with status ${response.status}`)
      }
      return {
        key: fullKey(input.key),
        size: bytes.byteLength,
        contentType: input.contentType ?? null,
        uploadedAt: now(),
        objectId: input.objectId ?? null
      }
    },

    async head(key: string): Promise<StoredObjectMetadata | null> {
      const response = await send('HEAD', key)
      if (response.status === 404) return null
      if (!response.ok) {
        throw new Error(`S3 storage head failed with status ${response.status}`)
      }
      return {
        key: fullKey(key),
        size: parseSize(response.headers.get('content-length')),
        contentType: response.headers.get('content-type'),
        uploadedAt: parseUploadedAt(response.headers.get('last-modified')),
        objectId: response.headers.get('x-amz-meta-tblog-object-id')
      }
    },

    async delete(key: string): Promise<void> {
      const response = await send('DELETE', key)
      // S3 returns 204 for a successful delete and treats a missing key as success.
      if (!response.ok && response.status !== 404) {
        throw new Error(`S3 storage delete failed with status ${response.status}`)
      }
    },

    publicUrl(key: string): string {
      return `${options.publicBaseUrl.replace(/\/+$/, '')}/${encodeKeyPath(fullKey(key))}`
    }
  }
}
