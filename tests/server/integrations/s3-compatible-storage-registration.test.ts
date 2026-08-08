import {
  resolveS3StorageOptions,
  s3CompatibleStorageConfigSchema,
  s3CompatibleStorageRegistration,
  S3_ACCESS_KEY_ID_SECRET,
  S3_SECRET_ACCESS_KEY_SECRET
} from '../../../server/integrations/providers/s3-compatible-storage'

const COMPLETE_CONFIG = {
  endpoint: 'https://s3.us-east-1.amazonaws.com',
  region: 'us-east-1',
  bucket: 'media-bucket',
  publicBaseUrl: 'https://media.example.com'
}

const SECRETS = {
  [S3_ACCESS_KEY_ID_SECRET]: 'AKIDEXAMPLE',
  [S3_SECRET_ACCESS_KEY_SECRET]: 'secret'
}

describe('S3-compatible storage registration', () => {
  it('normalizes the endpoint, public base URL, and key prefix', () => {
    expect(s3CompatibleStorageConfigSchema.parse({
      endpoint: 'https://s3.example.com/gateway///',
      region: 'us-east-1',
      bucket: 'media-bucket',
      publicBaseUrl: 'https://media.example.com/assets///',
      keyPrefix: 'uploads/2026',
      forcePathStyle: 'true'
    })).toEqual({
      endpoint: 'https://s3.example.com/gateway',
      region: 'us-east-1',
      bucket: 'media-bucket',
      publicBaseUrl: 'https://media.example.com/assets',
      keyPrefix: 'uploads/2026/',
      forcePathStyle: true
    })
  })

  it.each([
    'http://s3.example.com',
    'https://key:secret@s3.example.com',
    'https://s3.example.com?token=secret',
    'https://s3.example.com#fragment',
    'not-a-url'
  ])('rejects unsafe endpoint %s', (endpoint) => {
    expect(s3CompatibleStorageConfigSchema.safeParse({ endpoint }).success).toBe(false)
  })

  it.each(['UPPERCASE', 'a', 'bucket_name', 'bucket..name', '-leading'])(
    'rejects bucket name %s that breaks virtual-hosted addressing',
    (bucket) => {
      expect(s3CompatibleStorageConfigSchema.safeParse({ bucket }).success).toBe(false)
    }
  )

  it.each(['/uploads/', '../uploads/', 'uploads/../private/', 'uploads?variant=large/'])(
    'rejects unsafe key prefix %s',
    (keyPrefix) => {
      expect(s3CompatibleStorageConfigSchema.safeParse({ keyPrefix }).success).toBe(false)
    }
  )

  it('declares the access key pair as deployment secrets rather than stored config', () => {
    expect(s3CompatibleStorageRegistration.requiredSecrets).toEqual([
      S3_ACCESS_KEY_ID_SECRET,
      S3_SECRET_ACCESS_KEY_SECRET
    ])
    expect(s3CompatibleStorageRegistration.requiredBindings).toEqual([])
    expect(s3CompatibleStorageRegistration.formMeta.map((field) => field.key)).not.toContain(
      S3_ACCESS_KEY_ID_SECRET
    )
  })

  it('never projects credentials into the public configuration', () => {
    const projection = s3CompatibleStorageRegistration.publicProjection({
      ...COMPLETE_CONFIG,
      accessKeyId: 'leaked',
      secretAccessKey: 'leaked'
    })

    expect(projection).not.toHaveProperty('accessKeyId')
    expect(projection).not.toHaveProperty('secretAccessKey')
    expect(projection).toMatchObject({ bucket: 'media-bucket', publicBaseUrl: 'https://media.example.com' })
  })

  it('reports misconfigured until the required public fields are set', () => {
    expect(s3CompatibleStorageRegistration.checkStatus({}, SECRETS)).toMatchObject({
      status: 'misconfigured'
    })
    expect(s3CompatibleStorageRegistration.checkStatus(
      { endpoint: 'https://s3.us-east-1.amazonaws.com' },
      SECRETS
    )).toMatchObject({ status: 'misconfigured' })
  })

  it('reports unavailable when the deployment has not supplied the credentials', () => {
    expect(s3CompatibleStorageRegistration.checkStatus(COMPLETE_CONFIG, {})).toMatchObject({
      status: 'unavailable',
      error: expect.stringContaining(S3_ACCESS_KEY_ID_SECRET)
    })
  })

  it('reports configured with complete configuration and credentials', () => {
    expect(s3CompatibleStorageRegistration.checkStatus(COMPLETE_CONFIG, SECRETS)).toEqual({
      status: 'configured'
    })
  })

  describe('resolveS3StorageOptions', () => {
    it('resolves credentials from the environment and defaults the optional fields', () => {
      expect(resolveS3StorageOptions(COMPLETE_CONFIG, SECRETS)).toEqual({
        ...COMPLETE_CONFIG,
        accessKeyId: 'AKIDEXAMPLE',
        secretAccessKey: 'secret',
        sessionToken: undefined,
        keyPrefix: '',
        forcePathStyle: false
      })
    })

    it('returns null when configuration or credentials are incomplete', () => {
      expect(resolveS3StorageOptions(COMPLETE_CONFIG, {})).toBeNull()
      expect(resolveS3StorageOptions({ ...COMPLETE_CONFIG, bucket: undefined }, SECRETS)).toBeNull()
      expect(resolveS3StorageOptions({ endpoint: 'http://insecure.example.com' }, SECRETS)).toBeNull()
    })
  })

  it('builds a storage provider only when everything resolves', () => {
    expect(s3CompatibleStorageRegistration.createStorageProvider?.(COMPLETE_CONFIG, SECRETS)).not.toBeNull()
    expect(s3CompatibleStorageRegistration.createStorageProvider?.(COMPLETE_CONFIG, {})).toBeNull()
  })
})
