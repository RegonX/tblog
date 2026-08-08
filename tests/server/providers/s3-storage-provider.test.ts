import { vi } from 'vitest'
import { createS3StorageProvider } from '../../../server/providers/storage/s3-storage-provider'

const BASE_OPTIONS = {
  endpoint: 'https://s3.us-east-1.amazonaws.com',
  region: 'us-east-1',
  bucket: 'media-bucket',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  publicBaseUrl: 'https://media.example.com',
  now: () => new Date('2026-07-15T00:00:00.000Z')
}

function fetchStub(response: Response) {
  return vi.fn().mockResolvedValue(response)
}

function lastCall(stub: ReturnType<typeof fetchStub>) {
  const [url, init] = stub.mock.calls.at(-1) as [string, RequestInit]
  return { url, init, headers: init.headers as Record<string, string> }
}

describe('S3 storage provider', () => {
  it('writes objects to a virtual-hosted URL with signed headers', async () => {
    const fetchImpl = fetchStub(new Response(null, { status: 200 }))
    const provider = createS3StorageProvider({ ...BASE_OPTIONS, fetchImpl })

    const result = await provider.put({
      key: 'images/2026/07/photo.png',
      body: new TextEncoder().encode('binary').buffer as ArrayBuffer,
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
      objectId: 'media-1'
    })

    const { url, init, headers } = lastCall(fetchImpl)
    expect(init.method).toBe('PUT')
    expect(url).toBe('https://media-bucket.s3.us-east-1.amazonaws.com/images/2026/07/photo.png')
    expect(headers['content-type']).toBe('image/png')
    expect(headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(headers['x-amz-meta-tblog-object-id']).toBe('media-1')
    expect(headers['x-amz-content-sha256']).toMatch(/^[0-9a-f]{64}$/)
    expect(headers['x-amz-date']).toBe('20260715T000000Z')
    expect(headers.Authorization).toContain('Credential=AKIDEXAMPLE/20260715/us-east-1/s3/aws4_request')
    expect(headers.Authorization).toContain('x-amz-content-sha256')
    // Runtimes own content-length for a fixed-length body; signing it risks a mismatch at the server.
    expect(headers).not.toHaveProperty('content-length')
    expect(headers.Authorization).not.toContain('content-length')
    expect(result).toMatchObject({
      key: 'images/2026/07/photo.png', size: 6, contentType: 'image/png', objectId: 'media-1'
    })
  })

  it('puts the bucket in the path when path-style addressing is enabled', async () => {
    const fetchImpl = fetchStub(new Response(null, { status: 200 }))
    const provider = createS3StorageProvider({
      ...BASE_OPTIONS,
      endpoint: 'https://minio.example.com',
      forcePathStyle: true,
      fetchImpl
    })

    await provider.put({ key: 'a.png', body: new ArrayBuffer(1) })

    expect(lastCall(fetchImpl).url).toBe('https://minio.example.com/media-bucket/a.png')
  })

  it('prepends the configured key prefix to stored objects and public URLs', async () => {
    const fetchImpl = fetchStub(new Response(null, { status: 200 }))
    const provider = createS3StorageProvider({ ...BASE_OPTIONS, keyPrefix: 'uploads/', fetchImpl })

    await provider.put({ key: 'images/a.png', body: new ArrayBuffer(1) })

    expect(lastCall(fetchImpl).url).toContain('/uploads/images/a.png')
    expect(provider.publicUrl('images/a.png')).toBe('https://media.example.com/uploads/images/a.png')
  })

  it('percent-encodes each key segment in the public URL', () => {
    const provider = createS3StorageProvider({ ...BASE_OPTIONS, fetchImpl: fetchStub(new Response()) })

    expect(provider.publicUrl('images/a b.png')).toBe('https://media.example.com/images/a%20b.png')
  })

  it('reads object metadata from a HEAD response', async () => {
    const fetchImpl = fetchStub(new Response(null, {
      status: 200,
      headers: {
        'content-length': '2048',
        'content-type': 'image/webp',
        'last-modified': 'Wed, 15 Jul 2026 00:00:00 GMT',
        'x-amz-meta-tblog-object-id': 'media-1'
      }
    }))
    const provider = createS3StorageProvider({ ...BASE_OPTIONS, fetchImpl })

    await expect(provider.head('images/a.webp')).resolves.toEqual({
      key: 'images/a.webp',
      size: 2048,
      contentType: 'image/webp',
      uploadedAt: new Date('2026-07-15T00:00:00.000Z'),
      objectId: 'media-1'
    })
  })

  it('reports a missing object as null rather than an error', async () => {
    const fetchImpl = fetchStub(new Response(null, { status: 404 }))
    const provider = createS3StorageProvider({ ...BASE_OPTIONS, fetchImpl })

    await expect(provider.head('images/missing.png')).resolves.toBeNull()
  })

  it('treats a delete of an already-absent object as success', async () => {
    const fetchImpl = fetchStub(new Response(null, { status: 404 }))
    const provider = createS3StorageProvider({ ...BASE_OPTIONS, fetchImpl })

    await expect(provider.delete('images/gone.png')).resolves.toBeUndefined()
    expect(lastCall(fetchImpl).init.method).toBe('DELETE')
  })

  it('surfaces write failures so an upload is never silently lost', async () => {
    const fetchImpl = fetchStub(new Response('AccessDenied', { status: 403 }))
    const provider = createS3StorageProvider({ ...BASE_OPTIONS, fetchImpl })

    await expect(provider.put({ key: 'a.png', body: new ArrayBuffer(1) })).rejects.toThrow(/403/)
    await expect(provider.delete('a.png')).rejects.toThrow(/403/)
    await expect(provider.head('a.png')).rejects.toThrow(/403/)
  })

  it('signs a session token when one is configured', async () => {
    const fetchImpl = fetchStub(new Response(null, { status: 200 }))
    const provider = createS3StorageProvider({ ...BASE_OPTIONS, sessionToken: 'temp-token', fetchImpl })

    await provider.put({ key: 'a.png', body: new ArrayBuffer(1) })

    const { headers } = lastCall(fetchImpl)
    expect(headers['x-amz-security-token']).toBe('temp-token')
    expect(headers.Authorization).toContain('x-amz-security-token')
  })
})
