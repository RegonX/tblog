/**
 * AWS Signature Version 4 for S3-compatible object storage, implemented on Web Crypto so it runs
 * unchanged on Cloudflare Workers. Pure functions with no IO: the caller hashes the payload, builds
 * the request, and applies the returned headers, which keeps the signing rules unit-testable against
 * the published AWS test vectors.
 */

const ALGORITHM = 'AWS4-HMAC-SHA256'
const encoder = new TextEncoder()

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data
  const view = bytes instanceof Uint8Array
    ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    : bytes
  return toHex(await crypto.subtle.digest('SHA-256', view as ArrayBuffer))
}

async function hmac(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
}

function bytesOf(value: string): ArrayBuffer {
  const encoded = encoder.encode(value)
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer
}

/**
 * RFC 3986 encoding. `encodeURIComponent` leaves `!'()*` unescaped, which AWS requires to be escaped;
 * a mismatch here produces a signature the service silently rejects as `SignatureDoesNotMatch`.
 */
export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

/** Each path segment is encoded once; S3 does not use the double-encoded canonical URI form. */
export function canonicalUri(pathname: string): string {
  if (!pathname || pathname === '/') return '/'
  return pathname.split('/').map(encodeRfc3986).join('/')
}

export function canonicalQueryString(searchParams: URLSearchParams): string {
  return [...searchParams]
    .map(([name, value]) => [encodeRfc3986(name), encodeRfc3986(value)] as const)
    .sort((left, right) => (left[0] === right[0] ? (left[1] < right[1] ? -1 : 1) : left[0] < right[0] ? -1 : 1))
    .map(([name, value]) => `${name}=${value}`)
    .join('&')
}

/** `YYYYMMDDTHHMMSSZ` — the ISO 8601 basic format AWS expects in `x-amz-date`. */
export function amzDate(date: Date): string {
  return `${date.toISOString().replace(/[:-]|\.\d{3}/g, '')}`
}

export interface SignAwsV4Input {
  method: string
  url: URL
  /**
   * Headers to sign. `host` and `x-amz-date` are added here; anything service-specific — including
   * S3's required `x-amz-content-sha256` — is the caller's to supply, which keeps this function the
   * plain SigV4 algorithm.
   */
  headers: Record<string, string>
  /** Hex SHA-256 of the request body, or the literal `UNSIGNED-PAYLOAD`. */
  payloadHash: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  region: string
  service: string
  date: Date
}

/** Returns the complete header set to send, including `Authorization`. */
export async function signAwsV4(input: SignAwsV4Input): Promise<Record<string, string>> {
  const timestamp = amzDate(input.date)
  const dateStamp = timestamp.slice(0, 8)

  const headers: Record<string, string> = {
    ...input.headers,
    host: input.url.host,
    'x-amz-date': timestamp
  }
  if (input.sessionToken) headers['x-amz-security-token'] = input.sessionToken

  const normalized = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, ' ')] as const)
    .sort((left, right) => (left[0] < right[0] ? -1 : 1))
  const signedHeaders = normalized.map(([name]) => name).join(';')
  const canonicalHeaders = normalized.map(([name, value]) => `${name}:${value}\n`).join('')

  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalUri(input.url.pathname),
    canonicalQueryString(input.url.searchParams),
    canonicalHeaders,
    signedHeaders,
    input.payloadHash
  ].join('\n')

  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`
  const stringToSign = [
    ALGORITHM,
    timestamp,
    scope,
    await sha256Hex(canonicalRequest)
  ].join('\n')

  const dateKey = await hmac(bytesOf(`AWS4${input.secretAccessKey}`), dateStamp)
  const regionKey = await hmac(dateKey, input.region)
  const serviceKey = await hmac(regionKey, input.service)
  const signingKey = await hmac(serviceKey, 'aws4_request')
  const signature = toHex(await hmac(signingKey, stringToSign))

  return {
    ...headers,
    Authorization: `${ALGORITHM} Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  }
}
