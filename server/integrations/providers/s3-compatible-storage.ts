import { z } from 'zod'
import { createS3StorageProvider } from '../../providers/storage/s3-storage-provider'
import type { StorageProvider } from '../../providers/storage/storage-provider'
import type { ProviderRegistration } from '../registry'
import { keyPrefixSchema, publicBaseUrlSchema } from './object-storage-config'

export const S3_COMPATIBLE_STORAGE_PROVIDER_KEY = 's3-compatible'
export const S3_ACCESS_KEY_ID_SECRET = 'S3_ACCESS_KEY_ID'
export const S3_SECRET_ACCESS_KEY_SECRET = 'S3_SECRET_ACCESS_KEY'
/** Optional; only STS-issued temporary credentials need it. */
export const S3_SESSION_TOKEN_SECRET = 'S3_SESSION_TOKEN'

/** Service endpoint: https only, no credentials, no query or fragment. */
const endpointSchema = z
  .string()
  .trim()
  .max(2048)
  .superRefine((value, context) => {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      context.addIssue({ code: 'custom', message: 'Endpoint must be an https URL' })
      return
    }
    if (url.protocol !== 'https:' || !url.hostname) {
      context.addIssue({ code: 'custom', message: 'Endpoint must be an https URL' })
    }
    if (url.username || url.password) {
      context.addIssue({ code: 'custom', message: 'Endpoint must not include credentials' })
    }
    if (url.search || url.hash) {
      context.addIssue({ code: 'custom', message: 'Endpoint must not include a query or fragment' })
    }
  })
  .transform((value) => {
    const url = new URL(value)
    const pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '')
    return `${url.origin}${pathname === '/' ? '' : pathname}`
  })

/** DNS-compatible bucket name, so virtual-hosted-style addressing stays valid. */
const bucketSchema = z
  .string()
  .trim()
  .min(3)
  .max(63)
  .refine(
    (value) => /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(value) && !value.includes('..'),
    'Bucket must contain only lowercase letters, digits, dots, and dashes'
  )

const regionSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(value), 'Region must be a plain region identifier')

export const s3CompatibleStorageConfigSchema = z
  .object({
    endpoint: endpointSchema.optional(),
    region: regionSchema.optional(),
    bucket: bucketSchema.optional(),
    publicBaseUrl: publicBaseUrlSchema.optional(),
    keyPrefix: keyPrefixSchema.optional(),
    // Checkbox inputs arrive as strings from the integration form renderer.
    forcePathStyle: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((value) => value === true || value === 'true')
      .optional()
  })
  .strip()

export type S3CompatibleStorageConfig = z.infer<typeof s3CompatibleStorageConfigSchema>

export function validateS3CompatibleStorageConfig(config: Record<string, unknown>): string | null {
  const parsed = s3CompatibleStorageConfigSchema.safeParse(config)
  if (parsed.success) return null
  return parsed.error.issues[0]?.message ?? 'Invalid S3-compatible storage configuration'
}

function readSecret(env: Record<string, unknown>, key: string): string | null {
  const value = env[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

export interface S3StorageOptions {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  publicBaseUrl: string
  keyPrefix: string
  forcePathStyle: boolean
}

/**
 * Resolve complete S3 options from public config + deployment secrets, or `null` when anything is
 * missing. Single source of truth for "is S3 upload storage usable"; credentials come only from `env`.
 */
export function resolveS3StorageOptions(
  config: unknown,
  env: Record<string, unknown>
): S3StorageOptions | null {
  const parsed = s3CompatibleStorageConfigSchema.safeParse(config)
  if (!parsed.success) return null
  const validated = parsed.data as S3CompatibleStorageConfig
  if (!validated.endpoint || !validated.region || !validated.bucket || !validated.publicBaseUrl) {
    return null
  }
  const accessKeyId = readSecret(env, S3_ACCESS_KEY_ID_SECRET)
  const secretAccessKey = readSecret(env, S3_SECRET_ACCESS_KEY_SECRET)
  if (!accessKeyId || !secretAccessKey) return null

  return {
    endpoint: validated.endpoint,
    region: validated.region,
    bucket: validated.bucket,
    accessKeyId,
    secretAccessKey,
    sessionToken: readSecret(env, S3_SESSION_TOKEN_SECRET) ?? undefined,
    publicBaseUrl: validated.publicBaseUrl,
    keyPrefix: validated.keyPrefix ?? '',
    forcePathStyle: validated.forcePathStyle ?? false
  }
}

/**
 * S3-compatible object storage. One adapter covers AWS S3, MinIO, Aliyun OSS, Tencent COS, Backblaze
 * B2, and R2's S3 endpoint. Access keys are deployment secrets (`wrangler secret put`) and are never
 * persisted in D1; public config only carries the endpoint, region, bucket, public base URL, and key
 * prefix. Objects are written over signed HTTPS requests, so no Cloudflare binding is required.
 */
export const s3CompatibleStorageRegistration: ProviderRegistration = {
  capability: 'storage',
  providerKey: S3_COMPATIBLE_STORAGE_PROVIDER_KEY,
  displayName: 'S3-Compatible Storage',
  configSchema: s3CompatibleStorageConfigSchema,
  validate: validateS3CompatibleStorageConfig,
  checkStatus(config, env) {
    const validationError = validateS3CompatibleStorageConfig(config)
    if (validationError) {
      return { status: 'misconfigured', error: validationError }
    }
    const missingFields = (['endpoint', 'region', 'bucket', 'publicBaseUrl'] as const).filter(
      (key) => !config[key]
    )
    if (missingFields.length > 0) {
      return { status: 'misconfigured', error: `Missing required fields: ${missingFields.join(', ')}` }
    }
    const missingSecrets = [S3_ACCESS_KEY_ID_SECRET, S3_SECRET_ACCESS_KEY_SECRET].filter(
      (key) => !readSecret(env, key)
    )
    if (missingSecrets.length > 0) {
      return { status: 'unavailable', error: `Missing required secrets: ${missingSecrets.join(', ')}` }
    }
    // Configuration and credentials are present. This deliberately does not perform a live bucket
    // request, so it never claims the bucket is reachable or that the key has write permission.
    return { status: 'configured' }
  },
  publicProjection(config) {
    return {
      endpoint: (config.endpoint as string | undefined) ?? null,
      region: (config.region as string | undefined) ?? null,
      bucket: (config.bucket as string | undefined) ?? null,
      publicBaseUrl: (config.publicBaseUrl as string | undefined) ?? null,
      keyPrefix: (config.keyPrefix as string | undefined) ?? null,
      forcePathStyle: (config.forcePathStyle as boolean | undefined) ?? false
    }
  },
  createStorageProvider(config, env): StorageProvider | null {
    const options = resolveS3StorageOptions(config, env)
    return options ? createS3StorageProvider(options) : null
  },
  requiredSecrets: [S3_ACCESS_KEY_ID_SECRET, S3_SECRET_ACCESS_KEY_SECRET],
  requiredBindings: [],
  formMeta: [
    {
      key: 'endpoint',
      label: 'Endpoint',
      type: 'url',
      placeholder: 'https://s3.us-west-1.amazonaws.com',
      help: 'Bucket service endpoint. Use the provider-specific host, for example https://oss-cn-hangzhou.aliyuncs.com or your MinIO gateway.',
      required: true
    },
    {
      key: 'region',
      label: 'Region',
      type: 'text',
      placeholder: 'us-east-1',
      help: 'Region identifier used when signing. Providers without regions usually accept us-east-1.',
      required: true
    },
    {
      key: 'bucket',
      label: 'Bucket',
      type: 'text',
      placeholder: 'my-media-bucket',
      help: 'Target bucket name.',
      required: true
    },
    {
      key: 'publicBaseUrl',
      label: 'Public base URL',
      type: 'url',
      placeholder: 'https://media.example.com',
      help: 'Browser-facing base URL for stored objects — a CDN or bucket custom domain. Uploads are signed server-side; this URL only has to be publicly readable.',
      required: true
    },
    {
      key: 'keyPrefix',
      label: 'Key prefix',
      type: 'text',
      placeholder: 'uploads/',
      help: 'Optional safe path prefix prepended to every stored object key, for example uploads/2026/.',
      required: false
    },
    {
      key: 'forcePathStyle',
      label: 'Use path-style addressing',
      type: 'boolean',
      help: 'Enable for MinIO and most self-hosted gateways, which expect https://endpoint/bucket/key instead of a bucket subdomain.',
      required: false
    }
  ],
  actions: [{ key: 'test', label: 'Check configuration and credentials' }]
}
