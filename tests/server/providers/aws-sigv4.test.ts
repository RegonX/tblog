import { createHash, createHmac } from 'node:crypto'
import {
  amzDate,
  canonicalQueryString,
  canonicalUri,
  encodeRfc3986,
  sha256Hex,
  signAwsV4
} from '../../../server/providers/storage/aws-sigv4'

/**
 * Signatures are verified two ways so a failure is diagnosable. `referenceSignature` is an
 * independent node:crypto implementation written straight from the AWS specification, which catches
 * bugs in the Web Crypto implementation; the published get-vanilla test-suite value additionally
 * catches a shared misreading of the spec. If only the published-vector assertion fails, the constant
 * is wrong; if both fail, the implementation is.
 */
const CREDENTIALS = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  service: 'service',
  date: new Date('2015-08-30T12:36:00.000Z')
}

/**
 * Independent SigV4 over node:crypto, used only as a cross-check of the shipped implementation.
 * Deliberately minimal: it assumes no query string and an already-safe path, so only pass it requests
 * that satisfy both — otherwise it would agree with a broken canonicalization for the wrong reason.
 */
function referenceSignature(input: {
  method: string
  url: URL
  headers: Record<string, string>
  payloadHash: string
  accessKeyId: string
  secretAccessKey: string
  region: string
  service: string
  date: Date
}): string {
  const timestamp = input.date.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = timestamp.slice(0, 8)
  const headers = Object.entries({ ...input.headers, host: input.url.host, 'x-amz-date': timestamp })
    .map(([name, value]) => [name.toLowerCase(), value.trim()] as const)
    .sort((left, right) => (left[0] < right[0] ? -1 : 1))

  const canonicalRequest = [
    input.method,
    input.url.pathname,
    '',
    `${headers.map(([name, value]) => `${name}:${value}`).join('\n')}\n`,
    headers.map(([name]) => name).join(';'),
    input.payloadHash
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    `${dateStamp}/${input.region}/${input.service}/aws4_request`,
    createHash('sha256').update(canonicalRequest).digest('hex')
  ].join('\n')

  const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest()
  const signingKey = ['aws4_request'].reduce(
    (key, part) => hmac(key, part),
    hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, dateStamp), input.region), input.service)
  )
  return hmac(signingKey, stringToSign).toString('hex')
}

function signatureOf(authorization: string): string {
  return /Signature=([0-9a-f]{64})$/.exec(authorization)?.[1] ?? ''
}

describe('AWS SigV4', () => {
  it('formats the timestamp in ISO 8601 basic format', () => {
    expect(amzDate(new Date('2015-08-30T12:36:00.000Z'))).toBe('20150830T123600Z')
  })

  it('escapes the characters encodeURIComponent leaves alone', () => {
    expect(encodeRfc3986("a!b'c(d)e*f")).toBe('a%21b%27c%28d%29e%2Af')
    expect(encodeRfc3986('a b+c/d')).toBe('a%20b%2Bc%2Fd')
  })

  it('encodes each path segment once and keeps the separators', () => {
    expect(canonicalUri('/')).toBe('/')
    expect(canonicalUri('/images/2026/07/a b.png')).toBe('/images/2026/07/a%20b.png')
  })

  it('sorts and encodes query parameters', () => {
    expect(canonicalQueryString(new URLSearchParams('b=2&a=1&a=0'))).toBe('a=0&a=1&b=2')
    expect(canonicalQueryString(new URLSearchParams('key=a b'))).toBe('key=a%20b')
  })

  it('hashes an empty payload to the well-known SHA-256 of the empty string', async () => {
    await expect(sha256Hex('')).resolves.toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
  })

  it('matches an independent node:crypto implementation of the same algorithm', async () => {
    const request = {
      method: 'PUT',
      url: new URL('https://bucket.s3.example.com/images/2026/07/a.png'),
      headers: { 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD', 'content-type': 'image/png' },
      payloadHash: 'UNSIGNED-PAYLOAD',
      ...CREDENTIALS
    }

    const headers = await signAwsV4(request)

    expect(signatureOf(headers.Authorization!)).toBe(referenceSignature(request))
  })

  it('matches the get-vanilla test-suite signature', async () => {
    const headers = await signAwsV4({
      method: 'GET',
      url: new URL('https://example.amazonaws.com/'),
      headers: {},
      payloadHash: await sha256Hex(''),
      ...CREDENTIALS
    })

    expect(headers.Authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, '
      + 'SignedHeaders=host;x-amz-date, '
      + 'Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31'
    )
  })

  it('signs the headers it was given and leaves service conventions to the caller', async () => {
    const headers = await signAwsV4({
      method: 'PUT',
      url: new URL('https://bucket.s3.example.com/images/a.png'),
      headers: { 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD', 'content-type': 'image/png' },
      payloadHash: 'UNSIGNED-PAYLOAD',
      ...CREDENTIALS
    })

    expect(headers.Authorization).toContain('SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date')
    expect(headers.host).toBe('bucket.s3.example.com')
    expect(headers['x-amz-date']).toBe('20150830T123600Z')
  })

  it('signs a session token when temporary credentials are used', async () => {
    const headers = await signAwsV4({
      method: 'GET',
      url: new URL('https://example.amazonaws.com/'),
      headers: {},
      payloadHash: await sha256Hex(''),
      sessionToken: 'session-token',
      ...CREDENTIALS
    })

    expect(headers['x-amz-security-token']).toBe('session-token')
    expect(headers.Authorization).toContain('SignedHeaders=host;x-amz-date;x-amz-security-token')
  })

  it('produces a different signature when any signed input changes', async () => {
    const base = await signAwsV4({
      method: 'GET',
      url: new URL('https://example.amazonaws.com/'),
      headers: {},
      payloadHash: await sha256Hex(''),
      ...CREDENTIALS
    })
    const otherPath = await signAwsV4({
      method: 'GET',
      url: new URL('https://example.amazonaws.com/other'),
      headers: {},
      payloadHash: await sha256Hex(''),
      ...CREDENTIALS
    })

    expect(signatureOf(otherPath.Authorization!)).not.toBe(signatureOf(base.Authorization!))
  })
})
