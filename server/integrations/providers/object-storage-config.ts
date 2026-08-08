import { z } from 'zod'

/**
 * Validation shared by every object-storage provider registration. The public base URL and key prefix
 * rules are identical whether objects live in R2 or an S3-compatible bucket, so both registrations
 * compose these schemas instead of restating the rules.
 */

function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

export function normalizePublicBaseUrl(value: string): string {
  const url = new URL(value)
  const pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '')
  return `${url.origin}${pathname === '/' ? '' : pathname}`
}

export function isSafeKeyPrefix(value: string): boolean {
  const withoutTrailingSlash = value.replace(/\/+$/, '')
  if (!withoutTrailingSlash) return false
  const segments = withoutTrailingSlash.split('/')
  return segments.every(
    (segment) => segment !== '.' && segment !== '..' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment)
  )
}

/** https-only, credential-free, query-free browser-facing URL. */
export const publicBaseUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .superRefine((value, context) => {
    const url = parseUrl(value)
    if (!url || url.protocol !== 'https:' || !url.hostname) {
      context.addIssue({ code: 'custom', message: 'Public base URL must be an https URL' })
      return
    }
    if (url.username || url.password) {
      context.addIssue({ code: 'custom', message: 'Public base URL must not include credentials' })
    }
    if (url.search || url.hash) {
      context.addIssue({ code: 'custom', message: 'Public base URL must not include a query or fragment' })
    }
  })
  .transform(normalizePublicBaseUrl)

/** Normalized to a single trailing slash so providers can concatenate it with an object key. */
export const keyPrefixSchema = z
  .string()
  .trim()
  .max(128)
  .refine(isSafeKeyPrefix, 'Key prefix must contain only safe path segments')
  .transform((value) => `${value.replace(/\/+$/, '')}/`)
