/**
 * Media constants shared by the admin client and the server media service. Keeping the accepted types
 * and the size ceiling in one module means the browser rejects a file for exactly the reason the API
 * would, instead of drifting into a client that permits uploads the server refuses.
 */

export const MAX_MEDIA_UPLOAD_BYTES = 10 * 1024 * 1024

export const allowedMediaTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif'
} as const

export type AllowedMediaType = keyof typeof allowedMediaTypes

export const allowedMediaTypeValues = Object.keys(allowedMediaTypes) as AllowedMediaType[]

export function isAllowedMediaType(value: string): value is AllowedMediaType {
  return value in allowedMediaTypes
}

/** Binary units, matching how object stores report bucket usage. */
export function formatMediaSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`
}
