import { describe, expect, it } from 'vitest'
import {
  createStorageProviderFromLocator,
  createStorageProvider,
  parseStorageLocator,
  resolveR2StorageOptions,
  serializeStorageLocator,
  selectActiveStorageRow
} from '../../../server/providers/storage/storage-provider-factory'
import type { R2BucketLike, R2ObjectLike } from '../../../server/providers/storage/r2-storage-provider'
import type { StoredIntegration } from '../../../server/repositories/contracts/integration-repositories'

function fakeBucket(): R2BucketLike {
  return {
    async put(key): Promise<R2ObjectLike> {
      return { key, size: 0 }
    },
    async head() {
      return null
    },
    async delete() {}
  }
}

const config = { publicBaseUrl: 'https://media.example.com', keyPrefix: 'uploads/' }

describe('storage provider factory readiness gating', () => {
  it('rebuilds an upload adapter from its captured location instead of mutable current config', () => {
    const locator = serializeStorageLocator('cloudflare-r2', {
      publicBaseUrl: 'https://old-media.example.com',
      keyPrefix: 'old-prefix/'
    })
    const provider = createStorageProviderFromLocator(
      'cloudflare-r2',
      locator,
      { MEDIA_R2: fakeBucket() }
    )

    expect(parseStorageLocator(locator, 'cloudflare-r2')).toEqual({
      publicBaseUrl: 'https://old-media.example.com',
      keyPrefix: 'old-prefix/'
    })
    expect(provider?.publicUrl('image.png')).toBe(
      'https://old-media.example.com/old-prefix/image.png'
    )
  })

  it('rejects malformed or cross-provider storage locators instead of falling back', () => {
    const locator = serializeStorageLocator('cloudflare-r2', config)

    expect(parseStorageLocator(locator, 's3-compatible')).toBeNull()
    expect(createStorageProviderFromLocator('cloudflare-r2', '{bad json', {
      MEDIA_R2: fakeBucket()
    })).toBeNull()
  })

  it('returns null options when the R2 binding is absent', () => {
    expect(resolveR2StorageOptions(config, {})).toBeNull()
  })

  it('returns null options when the public base URL is missing', () => {
    expect(resolveR2StorageOptions({}, { MEDIA_R2: fakeBucket() })).toBeNull()
  })

  it.each([
    { publicBaseUrl: 'https://media.example.com?token=x' },
    { publicBaseUrl: 'https://media.example.com', keyPrefix: '../private/' },
    { publicBaseUrl: 123 }
  ])('returns null options for invalid persisted config %#', (invalidConfig) => {
    expect(resolveR2StorageOptions(invalidConfig, { MEDIA_R2: fakeBucket() })).toBeNull()
  })

  it('resolves options when both the binding and public base URL are present', () => {
    const options = resolveR2StorageOptions(config, { MEDIA_R2: fakeBucket() })

    expect(options).toMatchObject({ publicBaseUrl: 'https://media.example.com', keyPrefix: 'uploads/' })
    expect(options?.bucket).toBeDefined()
  })

  it('yields a working R2 provider when enabled with a binding and config', async () => {
    const provider = createStorageProvider({ enabled: true, config, env: { MEDIA_R2: fakeBucket() } })

    await expect(provider.put({ key: 'a.png', body: 'x' })).resolves.toMatchObject({ key: 'uploads/a.png' })
    expect(provider.publicUrl('a.png')).toBe('https://media.example.com/uploads/a.png')
  })

  it('yields the unconfigured no-op when storage is disabled', async () => {
    const provider = createStorageProvider({ enabled: false, config, env: { MEDIA_R2: fakeBucket() } })

    await expect(provider.put({ key: 'a.png', body: 'x' })).rejects.toThrow(/not configured/)
    await expect(provider.head('a.png')).resolves.toBeNull()
  })

  it('yields the unconfigured no-op when the binding is missing', async () => {
    const provider = createStorageProvider({ enabled: true, config, env: {} })

    await expect(provider.put({ key: 'a.png', body: 'x' })).rejects.toThrow(/not configured/)
  })
})

describe('active storage row selection', () => {
  function storageRow(providerKey: string, enabled: boolean): StoredIntegration {
    return {
      capability: 'storage',
      providerKey,
      enabled,
      publicConfigJson: '{}',
      status: enabled ? 'configured' : 'disabled',
      lastCheckedAt: null,
      lastError: null,
      updatedAt: new Date('2026-07-15T00:00:00.000Z')
    }
  }

  it('selects the single enabled storage row', () => {
    const row = storageRow('cloudflare-r2', true)

    expect(selectActiveStorageRow([row, storageRow('s3-compatible', false)])).toBe(row)
  })

  it('ignores rows from other capabilities', () => {
    const row = storageRow('s3-compatible', true)
    const otherCapability = { ...storageRow('cloudflare-kv', true), capability: 'cache' }

    expect(selectActiveStorageRow([otherCapability, row])).toBe(row)
  })

  it('fails closed rather than guessing between zero or several enabled backends', () => {
    expect(selectActiveStorageRow([])).toBeNull()
    expect(selectActiveStorageRow([storageRow('cloudflare-r2', false)])).toBeNull()
    // Enabling a storage provider disables the others, so two enabled rows means unexpected state.
    expect(selectActiveStorageRow([
      storageRow('cloudflare-r2', true),
      storageRow('s3-compatible', true)
    ])).toBeNull()
  })
})
