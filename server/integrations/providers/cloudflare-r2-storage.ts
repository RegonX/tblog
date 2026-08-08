import { z } from 'zod'
import { createR2StorageProvider, type R2BucketLike } from '../../providers/storage/r2-storage-provider'
import type { StorageProvider } from '../../providers/storage/storage-provider'
import type { ProviderRegistration } from '../registry'
import { keyPrefixSchema, publicBaseUrlSchema } from './object-storage-config'

export const CLOUDFLARE_R2_STORAGE_PROVIDER_KEY = 'cloudflare-r2'
export const MEDIA_R2_BINDING = 'MEDIA_R2'

/** Keep registry readiness and runtime provider resolution on the same binding contract. */
export function isR2BucketBinding(binding: unknown): binding is R2BucketLike {
  return Boolean(
    binding
    && typeof (binding as R2BucketLike).put === 'function'
    && typeof (binding as R2BucketLike).head === 'function'
    && typeof (binding as R2BucketLike).delete === 'function'
  )
}

export const cloudflareR2StorageConfigSchema = z
  .object({
    publicBaseUrl: publicBaseUrlSchema.optional(),
    keyPrefix: keyPrefixSchema.optional()
  })
  .strip()

export type CloudflareR2StorageConfig = z.infer<typeof cloudflareR2StorageConfigSchema>

export function validateCloudflareR2StorageConfig(config: Record<string, unknown>): string | null {
  const parsed = cloudflareR2StorageConfigSchema.safeParse(config)
  if (parsed.success) return null
  return parsed.error.issues[0]?.message ?? 'Invalid R2 storage configuration'
}

export interface R2StorageOptions {
  bucket: R2BucketLike
  publicBaseUrl: string
  keyPrefix: string
}

/**
 * Resolve complete R2 options from public config + the `MEDIA_R2` binding, or `null` when the binding
 * or the public base URL is missing. Single source of truth for "is upload storage usable". The bucket
 * is only ever read from `env` (Cloudflare), never from persisted config.
 */
export function resolveR2StorageOptions(
  config: unknown,
  env: Record<string, unknown>
): R2StorageOptions | null {
  const binding = env[MEDIA_R2_BINDING]
  if (!isR2BucketBinding(binding)) {
    return null
  }
  const parsed = cloudflareR2StorageConfigSchema.safeParse(config)
  if (!parsed.success) return null
  const validated = parsed.data as CloudflareR2StorageConfig
  if (validateCloudflareR2StorageConfig(validated as Record<string, unknown>)) return null
  if (!validated.publicBaseUrl) return null
  return {
    bucket: binding,
    publicBaseUrl: validated.publicBaseUrl,
    keyPrefix: validated.keyPrefix ?? ''
  }
}

/**
 * Cloudflare R2 storage. Optional upload storage bound as `MEDIA_R2`; public config is the bucket's
 * public base URL and an optional key prefix. R2 write access is the binding itself — no secret is
 * stored. When the binding is absent, uploads stay disabled and external image URL insertion remains
 * the default media model.
 */
export const cloudflareR2StorageRegistration: ProviderRegistration = {
  capability: 'storage',
  providerKey: CLOUDFLARE_R2_STORAGE_PROVIDER_KEY,
  displayName: 'Cloudflare R2 Storage',
  configSchema: cloudflareR2StorageConfigSchema,
  validate: validateCloudflareR2StorageConfig,
  checkStatus(config, env) {
    if (!isR2BucketBinding(env[MEDIA_R2_BINDING])) {
      return { status: 'unavailable', error: `Missing or invalid ${MEDIA_R2_BINDING} binding` }
    }
    const validationError = validateCloudflareR2StorageConfig(config)
    if (validationError) {
      return { status: 'misconfigured', error: validationError }
    }
    if (!config.publicBaseUrl) {
      return { status: 'misconfigured', error: 'Public base URL is not set' }
    }
    // This non-destructive check proves only configuration and binding presence. It intentionally
    // does not claim that the configured custom domain/r2.dev URL is publicly reachable.
    return { status: 'configured' }
  },
  publicProjection(config) {
    return {
      publicBaseUrl: (config.publicBaseUrl as string | undefined) ?? null,
      keyPrefix: (config.keyPrefix as string | undefined) ?? null
    }
  },
  createStorageProvider(config, env): StorageProvider | null {
    const options = resolveR2StorageOptions(config, env)
    return options ? createR2StorageProvider(options) : null
  },
  requiredSecrets: [],
  requiredBindings: [MEDIA_R2_BINDING],
  formMeta: [
    {
      key: 'publicBaseUrl',
      label: 'Public base URL',
      type: 'url',
      placeholder: 'https://media.example.com',
      help: 'Use an R2 custom domain in production. r2.dev is rate-limited for development only; disable it after connecting a custom domain so it cannot bypass WAF or Access.',
      required: true
    },
    {
      key: 'keyPrefix',
      label: 'Key prefix',
      type: 'text',
      placeholder: 'uploads/',
      help: 'Optional safe path prefix prepended to every stored object key, for example uploads/2026/.',
      required: false
    }
  ],
  actions: [{ key: 'test', label: 'Check configuration and binding' }]
}
