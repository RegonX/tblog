export interface CreateMediaReferenceInput {
  id: string
  url: string
  altText: string | null
  width: number | null
  height: number | null
  caption: string | null
  providerKey: string
  referenceState: string
  /** Logical object key handed to the storage provider, without its configured key prefix. */
  storageKey: string | null
  /** Versioned, non-secret coordinates used to reconstruct the upload's original storage location. */
  storageLocator: string | null
  contentType: string | null
  sizeBytes: number | null
  originalFilename: string | null
  thumbnailUrl: string | null
  thumbnailKey: string | null
  thumbnailSizeBytes: number | null
  createdAt: Date
  updatedAt: Date
}

export interface MediaReferenceRecord {
  id: string
  url: string
  altText: string | null
  width: number | null
  height: number | null
  caption: string | null
  providerKey: string | null
  referenceState: string
  storageKey: string | null
  storageLocator: string | null
  contentType: string | null
  sizeBytes: number | null
  originalFilename: string | null
  thumbnailUrl: string | null
  thumbnailKey: string | null
  thumbnailSizeBytes: number | null
  createdAt: Date
  updatedAt: Date
}

export interface MediaListQuery {
  offset: number
  limit: number
  /** Matched against the original filename, alt text, caption, and URL. */
  q?: string
  contentType?: string
  /** Inclusive lower bound on `createdAt`. */
  from?: Date
  /** Inclusive upper bound on `createdAt`. */
  to?: Date
}

export interface MediaListPage {
  items: MediaReferenceRecord[]
  total: number
  offset: number
  limit: number
}

export interface UpdateMediaMetadataInput {
  altText: string | null
  caption: string | null
  updatedAt: Date
}

export interface MediaUsageReference {
  postId: string
  title: string
  slug: string
  /** Direct admin destination for non-post references; posts fall back to their editor route. */
  href?: string
  /** Where the URL was found, so administrators know what a forced delete will break. */
  field: 'content' | 'cover' | 'seoImage' | 'siteSettings' | 'profileSettings' | 'homeSettings'
}

export interface MediaLibrarySummary {
  totalCount: number
  totalBytes: number
  /** Rows uploaded before size tracking existed; excluded from `totalBytes` rather than counted as 0. */
  unknownSizeCount: number
}

export interface MediaReferenceRepository {
  create(input: CreateMediaReferenceInput): Promise<void>
  list(query: MediaListQuery): Promise<MediaListPage>
  findById(id: string): Promise<MediaReferenceRecord | null>
  updateMetadata(id: string, input: UpdateMediaMetadataInput): Promise<MediaReferenceRecord | null>
  deleteById(id: string): Promise<void>
  summary(): Promise<MediaLibrarySummary>
  findUsage(url: string, limit: number): Promise<MediaUsageReference[]>
}
