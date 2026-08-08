import { flushPromises, mount } from '@vue/test-utils'
import { shallowRef, toValue, type MaybeRefOrGetter } from 'vue'
import MediaLibraryView from '../../../components/admin/MediaLibraryView.vue'
import type { AdminMediaItemView, AdminMediaQuery } from '../../../composables/useAdminApi'

const api = vi.hoisted(() => ({
  useAdminMedia: vi.fn(),
  fetchAdminMediaStats: vi.fn(),
  updateMediaMetadata: vi.fn(),
  deleteMedia: vi.fn(),
  uploadMedia: vi.fn(),
  apiErrorMessage: vi.fn((error: unknown, fallback: string) => {
    const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
    return message || fallback
  }),
  apiErrorCode: vi.fn((error: unknown) => (
    (error as { data?: { error?: { code?: string } } })?.data?.error?.code ?? null
  )),
  mediaUsageFromError: vi.fn((error: unknown) => (
    (error as { data?: { error?: { details?: { posts?: unknown[] } } } })?.data?.error?.details?.posts ?? []
  ))
}))

vi.mock('~/composables/useAdminApi', () => api)

const NuxtLink = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>'
}

function mediaView(overrides: Partial<AdminMediaItemView> = {}): AdminMediaItemView {
  return {
    id: 'media-1',
    url: 'https://media.example/images/media-1.png',
    altText: 'Hero image',
    caption: null,
    width: null,
    height: null,
    providerKey: 'cloudflare-r2',
    referenceState: 'stored',
    contentType: 'image/png',
    sizeBytes: 2048,
    originalFilename: 'hero.png',
    thumbnailUrl: 'https://media.example/thumbnails/media-1.webp',
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    ...overrides
  }
}

function setupList(options: { rows?: AdminMediaItemView[]; total?: number; error?: unknown; pending?: boolean } = {}) {
  let querySource!: MaybeRefOrGetter<AdminMediaQuery>
  const refresh = vi.fn().mockResolvedValue(undefined)
  const data = shallowRef({
    data: options.rows ?? [mediaView()],
    meta: { total: options.total ?? 1, offset: 0, limit: 24 }
  })
  api.useAdminMedia.mockImplementation((received: typeof querySource) => {
    querySource = received
    return {
      data,
      pending: shallowRef(options.pending ?? false),
      error: shallowRef(options.error ?? null),
      refresh
    }
  })
  return { get query() { return toValue(querySource) }, data, refresh }
}

function setupStats(activeProviderKey: string | null = 'cloudflare-r2') {
  api.fetchAdminMediaStats.mockResolvedValue({
    data: { totalCount: 1, totalBytes: 2048, unknownSizeCount: 0, activeProviderKey },
    meta: {}
  })
}

async function mountView() {
  const wrapper = mount(MediaLibraryView, { global: { stubs: { NuxtLink } } })
  await flushPromises()
  return wrapper
}

async function openUpload(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-test="media-upload-toggle"]').trigger('click')
}

describe('MediaLibraryView', () => {
  const writeText = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.resetAllMocks()
    writeText.mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('confirm', vi.fn(() => true))
    setupStats()
  })

  afterEach(() => vi.unstubAllGlobals())

  it('requests the first page with the default limit and renders the library', async () => {
    const list = setupList()
    const wrapper = await mountView()

    expect(list.query).toMatchObject({ offset: 0, limit: 24 })
    expect(wrapper.get('[data-test="media-card"] img').attributes('src')).toBe('https://media.example/thumbnails/media-1.webp')
  })

  it('blocks uploads and points at the settings page when no storage is enabled', async () => {
    setupStats(null)
    setupList()
    const wrapper = await mountView()
    await openUpload(wrapper)

    expect(wrapper.find('[data-test="media-storage-missing"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="media-dropzone"]').exists()).toBe(false)
  })

  it('keeps upload collapsed while the filter bar stays available', async () => {
    setupList()
    const wrapper = await mountView()

    expect(wrapper.find('[data-test="media-dropzone"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="media-filters"]').exists()).toBe(true)

    await openUpload(wrapper)
    expect(wrapper.find('[data-test="media-dropzone"]').exists()).toBe(true)

  })

  it('applies filters on submit and resets them back to an unfiltered query', async () => {
    const list = setupList()
    const wrapper = await mountView()
    await wrapper.get('[data-test="media-filter-q"]').setValue('  hero  ')
    await wrapper.get('[data-test="media-filter-type"]').setValue('image/png')
    await wrapper.get('[data-test="media-filter-from"]').setValue('2026-07-01')
    await wrapper.get('[data-test="media-filters"]').trigger('submit')

    expect(list.query).toMatchObject({
      q: 'hero',
      contentType: 'image/png',
      from: '2026-07-01',
      offset: 0,
      limit: 24
    })

    await wrapper.get('[data-test="media-filter-reset"]').trigger('click')

    expect(list.query).toEqual({ offset: 0, limit: 24 })
  })

  it('rejects files the API would refuse before uploading them', async () => {
    setupList()
    const wrapper = await mountView()
    await openUpload(wrapper)
    const oversized = new File(['x'], 'huge.png', { type: 'image/png' })
    Object.defineProperty(oversized, 'size', { value: 20 * 1024 * 1024 })

    const input = wrapper.get('[data-test="media-file-input"]')
    Object.defineProperty(input.element, 'files', {
      value: [new File(['x'], 'notes.txt', { type: 'text/plain' }), oversized],
      configurable: true
    })
    await input.trigger('change')
    await flushPromises()

    expect(api.uploadMedia).not.toHaveBeenCalled()
    const queue = wrapper.get('[data-test="media-upload-queue"]')
    expect(queue.text()).toContain('notes.txt')
    expect(queue.text()).toContain('huge.png')
  })

  it('uploads accepted files and refreshes the library afterwards', async () => {
    const list = setupList()
    api.uploadMedia.mockResolvedValue({ data: mediaView(), meta: {} })
    const wrapper = await mountView()
    await openUpload(wrapper)

    const input = wrapper.get('[data-test="media-file-input"]')
    Object.defineProperty(input.element, 'files', {
      value: [new File(['x'], 'hero.png', { type: 'image/png' })],
      configurable: true
    })
    await input.trigger('change')
    await flushPromises()

    expect(api.uploadMedia).toHaveBeenCalledTimes(1)
    expect(list.refresh).toHaveBeenCalled()
  })

  it('retries a failed upload on demand', async () => {
    setupList()
    api.uploadMedia.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ data: mediaView(), meta: {} })
    const wrapper = await mountView()
    await openUpload(wrapper)

    const input = wrapper.get('[data-test="media-file-input"]')
    Object.defineProperty(input.element, 'files', {
      value: [new File(['x'], 'hero.png', { type: 'image/png' })],
      configurable: true
    })
    await input.trigger('change')
    await flushPromises()

    await wrapper.get('[data-test="media-upload-retry"]').trigger('click')
    await flushPromises()

    expect(api.uploadMedia).toHaveBeenCalledTimes(2)
  })

  it('does not report a failed upload as still active', async () => {
    setupList()
    api.uploadMedia.mockRejectedValue(new Error('network'))
    const wrapper = await mountView()
    await openUpload(wrapper)

    const input = wrapper.get('[data-test="media-file-input"]')
    Object.defineProperty(input.element, 'files', {
      value: [new File(['x'], 'hero.png', { type: 'image/png' })],
      configurable: true
    })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.find('[data-test="media-upload-active"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="media-upload-queue"]').text()).toContain('hero.png')
  })

  it('copies the selected image in each supported link format', async () => {
    setupList()
    const wrapper = await mountView()

    await wrapper.get('[data-test="media-card"] .media-card__preview').trigger('click')
    await wrapper.get('[data-test="media-copy-url"]').trigger('click')
    await wrapper.get('[data-test="media-copy-markdown"]').trigger('click')
    await wrapper.get('[data-test="media-copy-html"]').trigger('click')
    await wrapper.get('[data-test="media-copy-bbcode"]').trigger('click')

    expect(writeText.mock.calls.map(([value]) => value)).toEqual([
      'https://media.example/images/media-1.png',
      '![Hero image](https://media.example/images/media-1.png)',
      '<img src="https://media.example/images/media-1.png" alt="Hero image">',
      '[img]https://media.example/images/media-1.png[/img]'
    ])
  })

  it('opens the original image in the fullscreen preview layer', async () => {
    setupList()
    const wrapper = await mountView()

    await wrapper.get('[data-test="media-card"] .media-card__preview').trigger('click')
    await wrapper.get('[data-test="media-detail-expand"]').trigger('click')

    expect(wrapper.find('[data-test="media-lightbox"]').element).toBeTruthy()
    expect(wrapper.get('[data-test="media-lightbox"] img').attributes('src')).toBe('https://media.example/images/media-1.png')

    await wrapper.get('[data-test="media-lightbox-close"]').trigger('click')
    expect(wrapper.findAll('[data-test="media-lightbox"]').length).toBe(0)
  })

  it('opens the card link menu and copies the selected link format', async () => {
    setupList()
    const wrapper = await mountView()

    await wrapper.get('[data-test="media-card-links"]').trigger('click')
    expect(wrapper.find('[data-test="media-card-copy-thumbnail"]').exists()).toBe(true)

    await wrapper.get('[data-test="media-card-copy-thumbnail"]').trigger('click')
    expect(writeText).toHaveBeenLastCalledWith('https://media.example/thumbnails/media-1.webp')

    await wrapper.get('[data-test="media-card-links"]').trigger('click')
    await wrapper.get('[data-test="media-card-copy-html"]').trigger('click')
    expect(writeText).toHaveBeenLastCalledWith('<img src="https://media.example/images/media-1.png" alt="Hero image">')
  })

  it('saves edited alt text and caption for the selected image', async () => {
    setupList()
    api.updateMediaMetadata.mockResolvedValue({ data: mediaView({ altText: 'Sunset' }), meta: {} })
    const wrapper = await mountView()

    await wrapper.get('[data-test="media-card"] .media-card__preview').trigger('click')
    await wrapper.get('[data-test="media-alt-input"]').setValue('Sunset')
    await wrapper.get('[data-test="media-caption-input"]').setValue('On the pier')
    await wrapper.get('[data-test="media-metadata-form"]').trigger('submit')
    await flushPromises()

    expect(api.updateMediaMetadata).toHaveBeenCalledWith('media-1', {
      altText: 'Sunset',
      caption: 'On the pier'
    })
  })

  it('deletes an unreferenced image after confirmation', async () => {
    const list = setupList()
    api.deleteMedia.mockResolvedValue({ data: { id: 'media-1', objectDeleted: true }, meta: {} })
    const wrapper = await mountView()

    await wrapper.get('[data-test="media-card"] .media-card__preview').trigger('click')
    await wrapper.get('[data-test="media-delete"]').trigger('click')
    await flushPromises()

    expect(api.deleteMedia).toHaveBeenCalledWith('media-1', false)
    expect(list.refresh).toHaveBeenCalled()
    expect(wrapper.find('[data-test="media-detail"]').exists()).toBe(false)
  })

  it('lists the referencing posts and only forces the delete after a second confirmation', async () => {
    setupList()
    api.deleteMedia
      .mockRejectedValueOnce({
        data: {
          error: {
            code: 'media_in_use',
            details: { posts: [{ postId: 'post-1', title: 'Trip notes', slug: 'trip-notes', field: 'content' }] }
          }
        }
      })
      .mockResolvedValueOnce({ data: { id: 'media-1', objectDeleted: true }, meta: {} })
    const wrapper = await mountView()

    await wrapper.get('[data-test="media-card"] .media-card__preview').trigger('click')
    await wrapper.get('[data-test="media-delete"]').trigger('click')
    await flushPromises()

    const usage = wrapper.get('[data-test="media-usage"]')
    expect(usage.text()).toContain('Trip notes')
    expect(api.deleteMedia).toHaveBeenCalledTimes(1)
    expect(api.deleteMedia).toHaveBeenLastCalledWith('media-1', false)

    await wrapper.get('[data-test="media-force-delete"]').trigger('click')
    await flushPromises()

    expect(api.deleteMedia).toHaveBeenLastCalledWith('media-1', true)
  })

  it('links settings references to the admin screen that owns them', async () => {
    setupList()
    api.deleteMedia.mockRejectedValue({
      data: {
        error: {
          code: 'media_in_use',
          details: {
            posts: [{
              postId: 'settings:site',
              title: 'Site settings',
              slug: '',
              href: '/admin/settings',
              field: 'siteSettings'
            }]
          }
        }
      }
    })
    const wrapper = await mountView()

    await wrapper.get('[data-test="media-card"] .media-card__preview').trigger('click')
    await wrapper.get('[data-test="media-delete"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="media-usage"] a').attributes('href')).toBe('/admin/settings')
  })

  it('warns when the record was removed but its stored object was not', async () => {
    setupList()
    api.deleteMedia.mockResolvedValue({ data: { id: 'media-1', objectDeleted: false }, meta: {} })
    const wrapper = await mountView()

    await wrapper.get('[data-test="media-card"] .media-card__preview').trigger('click')
    await wrapper.get('[data-test="media-delete"]').trigger('click')
    await flushPromises()

    // The suite runs under the default zh-CN locale, so assert the message the operator actually sees.
    expect(wrapper.get('[data-test="media-page-notice"]').text()).toContain('存储中的文件未能移除')
  })

  it('surfaces a load failure with a retry control', async () => {
    const list = setupList({ error: { data: { error: { message: 'Media list unavailable' } } }, rows: [] })
    const wrapper = await mountView()

    expect(wrapper.get('[data-test="media-load-error"]').text()).toBe('Media list unavailable')

    await wrapper.get('[data-test="media-retry"]').trigger('click')

    expect(list.refresh).toHaveBeenCalled()
  })
})
