import type { H3Event } from 'h3'
import {
  resolveR2StorageOptions,
  type R2StorageOptions
} from '../../integrations/providers/cloudflare-r2-storage'
import { findRegistration } from '../../integrations/registry'
import { getDatabaseClient } from '../../database/client'
import { createIntegrationSettingsRepository } from '../../repositories/integration-settings-repository'
import type { StoredIntegration } from '../../repositories/contracts/integration-repositories'
import { mergeCloudflareRuntimeEnv } from '../../utils/runtime-env'
import { createR2StorageProvider } from './r2-storage-provider'
import type { StorageProvider } from './storage-provider'
import { createUnconfiguredStorageProvider } from './unconfigured-storage-provider'

// Re-exported from the R2 registration, which owns the config schema this resolution depends on.
export { resolveR2StorageOptions, type R2StorageOptions }

export interface CreateStorageProviderParams {
  enabled: boolean
  config: unknown
  env: Record<string, unknown>
}

/**
 * Resolve the R2 storage provider from explicit parameters. Returns the unconfigured no-op when
 * storage is disabled or its binding/config is incomplete, so external URL insertion stays the default
 * and an ungated caller fails loudly rather than silently dropping an upload.
 */
export function createStorageProvider(params: CreateStorageProviderParams): StorageProvider {
  if (!params.enabled) {
    return createUnconfiguredStorageProvider()
  }
  const options = resolveR2StorageOptions(params.config, params.env)
  return options ? createR2StorageProvider(options) : createUnconfiguredStorageProvider()
}

export interface ActiveStorageProvider {
  provider: StorageProvider
  providerKey: string
  /** Immutable, non-secret coordinates for the location receiving this upload. */
  storageLocator: string
}

const STORAGE_LOCATOR_VERSION = 1
const MAX_STORAGE_LOCATOR_BYTES = 16 * 1024

interface StorageLocatorV1 {
  version: typeof STORAGE_LOCATOR_VERSION
  providerKey: string
  config: Record<string, unknown>
}

/** Capture the normalized public provider configuration that determines an object's location. */
export function serializeStorageLocator(
  providerKey: string,
  config: Record<string, unknown>
): string {
  const locator: StorageLocatorV1 = {
    version: STORAGE_LOCATOR_VERSION,
    providerKey,
    config
  }
  return JSON.stringify(locator)
}

/** Parse a persisted locator without ever falling back to mutable current configuration. */
export function parseStorageLocator(
  raw: string,
  expectedProviderKey: string
): Record<string, unknown> | null {
  if (!raw || new TextEncoder().encode(raw).byteLength > MAX_STORAGE_LOCATOR_BYTES) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StorageLocatorV1> | null
    if (
      !parsed
      || parsed.version !== STORAGE_LOCATOR_VERSION
      || parsed.providerKey !== expectedProviderKey
      || !parsed.config
      || typeof parsed.config !== 'object'
      || Array.isArray(parsed.config)
    ) {
      return null
    }
    return parsed.config as Record<string, unknown>
  } catch {
    return null
  }
}

function createRegisteredStorageProvider(
  providerKey: string,
  rawConfig: Record<string, unknown>,
  env: Record<string, unknown>
): StorageProvider | null {
  const registration = findRegistration('storage', providerKey)
  if (!registration?.createStorageProvider) return null
  const parsed = registration.configSchema.safeParse(rawConfig)
  if (!parsed.success) return null
  const config = parsed.data as Record<string, unknown>
  if (registration.validate(config)) return null
  return registration.createStorageProvider(config, env)
}

/** Rebuild an adapter from one upload's coordinates, never from the provider's current row. */
export function createStorageProviderFromLocator(
  providerKey: string,
  storageLocator: string,
  env: Record<string, unknown>
): StorageProvider | null {
  const config = parseStorageLocator(storageLocator, providerKey)
  return config ? createRegisteredStorageProvider(providerKey, config, env) : null
}

function parseConfig(raw: string | null): Record<string, unknown> | null {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return null
  }
}

/**
 * Pick the one storage integration that receives new uploads. Enabling a storage provider writes the
 * row exclusively, so more than one enabled row means the table is in an unexpected state — fail
 * closed rather than guess which bucket an upload belongs in.
 */
export function selectActiveStorageRow(
  rows: readonly StoredIntegration[]
): StoredIntegration | null {
  const enabled = rows.filter((row) => row.capability === 'storage' && row.enabled)
  return enabled.length === 1 ? enabled[0]! : null
}

/**
 * Resolve the active storage provider for an authenticated write path; `null` keeps uploads optional.
 * Provider-agnostic: whichever storage registration is enabled builds its own adapter, so adding a
 * backend means adding a registration rather than editing this resolver. The returned `providerKey` is
 * recorded on each media reference so a later delete routes back to the store that holds the object.
 */
export async function resolveStorageProviderForEvent(
  event: H3Event
): Promise<ActiveStorageProvider | null> {
  const repository = createIntegrationSettingsRepository(getDatabaseClient(event))
  const row = selectActiveStorageRow(await repository.list())
  if (!row) return null

  const registration = findRegistration(row.capability, row.providerKey)
  if (!registration?.createStorageProvider) return null

  const rawConfig = parseConfig(row.publicConfigJson)
  if (!rawConfig) return null
  const parsed = registration.configSchema.safeParse(rawConfig)
  if (!parsed.success) return null
  const config = parsed.data as Record<string, unknown>
  if (registration.validate(config)) return null

  const env = mergeCloudflareRuntimeEnv(process.env, event.context.cloudflare?.env)
  const provider = registration.createStorageProvider(config, env)
  return provider
    ? {
        provider,
        providerKey: row.providerKey,
        storageLocator: serializeStorageLocator(row.providerKey, config)
      }
    : null
}

/**
 * Resolve the storage provider that holds an already-stored object. Deleting a media reference has to
 * reach the store it was uploaded to, which is not necessarily the one currently accepting uploads.
 */
export async function resolveStorageProviderByKey(
  event: H3Event,
  providerKey: string,
  storageLocator?: string | null
): Promise<StorageProvider | null> {
  const env = mergeCloudflareRuntimeEnv(process.env, event.context.cloudflare?.env)

  if (storageLocator !== undefined && storageLocator !== null) {
    // A locator belongs to one immutable upload location. If it is malformed or names another
    // provider, fail closed instead of silently routing the delete through today's configuration.
    return createStorageProviderFromLocator(providerKey, storageLocator, env)
  }

  // Rows created before location snapshots existed can only use the currently persisted config.
  const repository = createIntegrationSettingsRepository(getDatabaseClient(event))
  const row = await repository.findByCapabilityAndProvider('storage', providerKey)
  if (!row) return null
  const rawConfig = parseConfig(row.publicConfigJson)
  if (!rawConfig) return null
  return createRegisteredStorageProvider(providerKey, rawConfig, env)
}
