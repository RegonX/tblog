<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import CommentPagination from '~/components/admin/CommentPagination.vue'
import MediaDetailDrawer from '~/components/admin/media/MediaDetailDrawer.vue'
import MediaControlDeck from '~/components/admin/media/MediaControlDeck.vue'
import MediaGrid from '~/components/admin/media/MediaGrid.vue'
import MediaLightbox from '~/components/admin/media/MediaLightbox.vue'
import MediaUploadQueue from '~/components/admin/media/MediaUploadQueue.vue'
import {
  apiErrorCode,
  apiErrorMessage,
  deleteMedia,
  fetchAdminMediaStats,
  mediaUsageFromError,
  updateMediaMetadata,
  uploadMedia,
  useAdminMedia,
  type AdminMediaItemView,
  type AdminMediaQuery,
  type AdminMediaStatsView,
  type AdminMediaUsageRef
} from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'
import { allowedMediaTypeValues, isAllowedMediaType, MAX_MEDIA_UPLOAD_BYTES } from '~/utils/media'

const { t } = useTblogI18n()

const PAGE_SIZE = 24
/** Concurrent uploads. The API takes one file per request, so the queue paces itself here. */
const UPLOAD_CONCURRENCY = 3

const filters = reactive({ q: '', contentType: '', from: '', to: '' })
const appliedFilters = ref<Omit<AdminMediaQuery, 'offset' | 'limit'>>({})
const offset = shallowRef(0)

const query = computed<AdminMediaQuery>(() => ({
  ...appliedFilters.value,
  offset: offset.value,
  limit: PAGE_SIZE
}))
const { data, pending, error, refresh } = useAdminMedia(query)

const items = computed<AdminMediaItemView[]>(() => data.value?.data ?? [])
const total = computed(() => data.value?.meta.total ?? 0)
const readError = computed(() => (error.value ? apiErrorMessage(error.value, t('media.loadError')) : ''))
const hasActiveFilters = computed(() => Object.keys(appliedFilters.value).length > 0)

watch(total, (currentTotal) => {
  const lastPageOffset = currentTotal === 0 ? 0 : Math.floor((currentTotal - 1) / PAGE_SIZE) * PAGE_SIZE
  if (offset.value > lastPageOffset) offset.value = lastPageOffset
})

function applyFilters() {
  appliedFilters.value = {
    ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
    ...(filters.contentType ? { contentType: filters.contentType } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {})
  }
  offset.value = 0
}

function resetFilters() {
  filters.q = ''
  filters.contentType = ''
  filters.from = ''
  filters.to = ''
  appliedFilters.value = {}
  offset.value = 0
}

function previousPage() {
  offset.value = Math.max(0, offset.value - PAGE_SIZE)
}

function nextPage() {
  if (offset.value + PAGE_SIZE < total.value) offset.value += PAGE_SIZE
}

const stats = shallowRef<AdminMediaStatsView | null>(null)
const uploadsDisabled = computed(() => stats.value !== null && stats.value.activeProviderKey === null)

async function loadStats() {
  try {
    stats.value = (await fetchAdminMediaStats()).data
  } catch {
    // The library still renders what is already recorded; only the summary strip is unavailable.
    stats.value = null
  }
}

onMounted(loadStats)

type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed'

interface UploadEntry {
  id: number
  file: File
  name: string
  status: UploadStatus
  error: string
}

let uploadSequence = 0
const uploads = ref<UploadEntry[]>([])
const uploadRunning = shallowRef(false)

function rejectionReason(file: File): string {
  if (!isAllowedMediaType(file.type)) return t('media.uploadRejectedType')
  if (file.size > MAX_MEDIA_UPLOAD_BYTES) return t('media.uploadRejectedSize')
  return ''
}

function enqueue(files: FileList | File[] | null | undefined) {
  if (!files) return
  for (const file of Array.from(files)) {
    uploadSequence += 1
    const reason = rejectionReason(file)
    uploads.value.push({
      id: uploadSequence,
      file,
      name: file.name,
      // Reject locally with the same rules the API enforces, so an oversized file never leaves
      // the browser only to come back as a 422.
      status: reason ? 'failed' : 'queued',
      error: reason
    })
  }
  void runQueue()
}

async function runQueue() {
  if (uploadRunning.value || uploadsDisabled.value) return
  uploadRunning.value = true
  try {
    let uploadedAny = false
    while (uploads.value.some((entry) => entry.status === 'queued')) {
      const batch = uploads.value.filter((entry) => entry.status === 'queued').slice(0, UPLOAD_CONCURRENCY)
      await Promise.all(batch.map(async (entry) => {
        entry.status = 'uploading'
        entry.error = ''
        try {
          await uploadMedia(entry.file)
          entry.status = 'done'
          uploadedAny = true
        } catch (uploadError) {
          entry.status = 'failed'
          entry.error = apiErrorMessage(uploadError, t('media.uploadFailed'))
        }
      }))
    }
    if (uploadedAny) {
      offset.value = 0
      await Promise.all([refresh(), loadStats()])
    }
  } finally {
    uploadRunning.value = false
  }
  // Files added while the post-upload refresh was in flight arrive after the loop has exited and
  // would otherwise sit queued forever, so drain them in a fresh pass.
  if (uploads.value.some((entry) => entry.status === 'queued')) void runQueue()
}

function retryUpload(entry: UploadEntry) {
  const reason = rejectionReason(entry.file)
  if (reason) {
    entry.error = reason
    return
  }
  entry.status = 'queued'
  entry.error = ''
  void runQueue()
}

function removeUpload(id: number) {
  uploads.value = uploads.value.filter((entry) => entry.id !== id)
}

function clearFinishedUploads() {
  uploads.value = uploads.value.filter((entry) => entry.status !== 'done')
}

function onPaste(event: ClipboardEvent) {
  if (uploadsDisabled.value) return
  const files = Array.from(event.clipboardData?.files ?? [])
  if (files.length === 0) return
  event.preventDefault()
  enqueue(files)
}

onMounted(() => window.addEventListener('paste', onPaste))
onBeforeUnmount(() => window.removeEventListener('paste', onPaste))

const selected = shallowRef<AdminMediaItemView | null>(null)
const draftAltText = shallowRef('')
const draftCaption = shallowRef('')
const metadataSaving = shallowRef(false)
const detailNotice = shallowRef('')
const detailError = shallowRef('')
/** Outcomes that outlive the detail drawer, such as a delete that closes it. */
const pageNotice = shallowRef('')
const deleting = shallowRef(false)
const usageBlockers = ref<AdminMediaUsageRef[]>([])
const lightboxItem = shallowRef<AdminMediaItemView | null>(null)

const lightboxIndex = computed(() => (
  lightboxItem.value ? items.value.findIndex(item => item.id === lightboxItem.value?.id) : -1
))

function openLightbox(item: AdminMediaItemView) {
  lightboxItem.value = item
}

function closeLightbox() {
  lightboxItem.value = null
}

function moveLightbox(direction: -1 | 1) {
  const next = items.value[lightboxIndex.value + direction]
  if (next) lightboxItem.value = next
}

function openDetail(item: AdminMediaItemView) {
  selected.value = item
  draftAltText.value = item.altText ?? ''
  draftCaption.value = item.caption ?? ''
  detailNotice.value = ''
  detailError.value = ''
  pageNotice.value = ''
  usageBlockers.value = []
}

function closeDetail() {
  selected.value = null
  usageBlockers.value = []
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Markdown link text breaks on unescaped brackets, so alt text is escaped per target format. */
function copyValue(item: AdminMediaItemView, format: 'url' | 'thumbnail' | 'markdown' | 'html' | 'bbcode'): string {
  const alt = item.altText ?? ''
  switch (format) {
    case 'thumbnail':
      return item.thumbnailUrl ?? item.url
    case 'markdown':
      return `![${alt.replace(/([[\]])/g, '\\$1')}](${item.url})`
    case 'html':
      return `<img src="${escapeHtmlAttribute(item.url)}" alt="${escapeHtmlAttribute(alt)}">`
    case 'bbcode':
      return `[img]${item.url}[/img]`
    default:
      return item.url
  }
}

async function copyToClipboard(item: AdminMediaItemView, format: 'url' | 'markdown' | 'html' | 'bbcode') {
  detailError.value = ''
  try {
    await navigator.clipboard.writeText(copyValue(item, format))
    detailNotice.value = t('media.copied')
  } catch {
    detailNotice.value = ''
    detailError.value = t('media.copyFailed')
  }
}

async function copyCardValue(item: AdminMediaItemView, format: 'url' | 'thumbnail' | 'markdown' | 'html') {
  try {
    await navigator.clipboard.writeText(copyValue(item, format))
    pageNotice.value = t('media.copied')
  } catch {
    pageNotice.value = t('media.copyFailed')
  }
}

function replaceVisibleItem(updated: AdminMediaItemView) {
  if (!data.value) return
  data.value = {
    ...data.value,
    data: data.value.data.map((row) => (row.id === updated.id ? updated : row))
  }
}

async function saveMetadata() {
  const item = selected.value
  if (!item) return
  metadataSaving.value = true
  detailNotice.value = ''
  detailError.value = ''
  try {
    const result = await updateMediaMetadata(item.id, {
      altText: draftAltText.value.trim() || null,
      caption: draftCaption.value.trim() || null
    })
    selected.value = result.data
    replaceVisibleItem(result.data)
    detailNotice.value = t('media.metadataSaved')
  } catch (saveError) {
    detailError.value = apiErrorMessage(saveError, t('media.metadataError'))
  } finally {
    metadataSaving.value = false
  }
}

async function runDelete(id: string, force: boolean) {
  deleting.value = true
  detailNotice.value = ''
  detailError.value = ''
  pageNotice.value = ''
  try {
    const result = await deleteMedia(id, force)
    closeDetail()
    // The drawer is gone by now, so the orphaned-object warning has to live on the page itself.
    pageNotice.value = result.data.objectDeleted ? t('media.deleted') : t('media.deleteObjectMissing')
    await Promise.all([refresh(), loadStats()])
    return true
  } catch (removeError) {
    if (apiErrorCode(removeError) === 'media_in_use') {
      usageBlockers.value = mediaUsageFromError(removeError)
      return false
    }
    detailError.value = apiErrorMessage(removeError, t('media.deleteError'))
    return false
  } finally {
    deleting.value = false
  }
}

async function requestDelete() {
  const item = selected.value
  if (!item || !confirm(t('media.deleteConfirm'))) return
  await runDelete(item.id, false)
}

async function requestCardDelete(item: AdminMediaItemView) {
  if (!confirm(t('media.deleteConfirm'))) return
  deleting.value = true
  pageNotice.value = ''
  try {
    const result = await deleteMedia(item.id, false)
    if (selected.value?.id === item.id) closeDetail()
    pageNotice.value = result.data.objectDeleted ? t('media.deleted') : t('media.deleteObjectMissing')
    await Promise.all([refresh(), loadStats()])
  } catch (removeError) {
    if (apiErrorCode(removeError) === 'media_in_use') {
      openDetail(item)
      usageBlockers.value = mediaUsageFromError(removeError)
      return
    }
    pageNotice.value = apiErrorMessage(removeError, t('media.deleteError'))
  } finally {
    deleting.value = false
  }
}

async function confirmForcedDelete() {
  const item = selected.value
  if (!item) return
  await runDelete(item.id, true)
}

</script>

<template>
  <section class="admin-media">
    <MediaControlDeck
      v-model:q="filters.q"
      v-model:content-type="filters.contentType"
      v-model:from="filters.from"
      v-model:to="filters.to"
      :stats="stats"
      :uploads-disabled="uploadsDisabled"
      :accept="allowedMediaTypeValues"
      :content-types="allowedMediaTypeValues"
      @files="enqueue"
      @apply="applyFilters"
      @reset="resetFilters"
    />

    <MediaUploadQueue
      v-if="uploads.length > 0"
      :uploads="uploads"
      @retry="retryUpload"
      @remove="removeUpload"
      @clear-done="clearFinishedUploads"
    />

    <p v-if="pageNotice" class="admin-muted" data-test="media-page-notice">{{ pageNotice }}</p>

    <div class="admin-media__workspace" :class="{ 'admin-media__workspace--detail': selected }">
      <div class="admin-media__main">
        <p v-if="pending && items.length === 0" class="admin-muted admin-media__state">{{ t('common.loading') }}</p>
        <div v-else-if="readError" class="media-load-error">
          <p class="admin-alert" data-test="media-load-error">{{ readError }}</p>
          <button class="settings-panel__sync" type="button" data-test="media-retry" :disabled="pending" @click="refresh()">
            {{ t('media.retry') }}
          </button>
        </div>
        <p v-else-if="items.length === 0" class="admin-muted admin-media__empty" data-test="media-empty">
          {{ hasActiveFilters ? t('media.emptyFiltered') : t('media.empty') }}
        </p>

        <MediaGrid
          v-if="items.length > 0"
          :items="items"
          :deleting="deleting"
          @select="openDetail"
          @copy="copyCardValue"
          @delete="requestCardDelete"
        />

        <CommentPagination
          v-if="total > 0"
          :total="total"
          :offset="offset"
          :limit="PAGE_SIZE"
          :disabled="pending"
          @prev="previousPage"
          @next="nextPage"
        />
      </div>

      <MediaDetailDrawer
        v-if="selected"
        v-model:alt-text="draftAltText"
        v-model:caption="draftCaption"
        :item="selected"
        :notice="detailNotice"
        :error="detailError"
        :usage-blockers="usageBlockers"
        :metadata-saving="metadataSaving"
        :deleting="deleting"
        @close="closeDetail"
        @expand="openLightbox(selected)"
        @copy="copyToClipboard(selected, $event)"
        @save="saveMetadata"
        @delete="requestDelete"
        @force-delete="confirmForcedDelete"
        @cancel-usage="usageBlockers = []"
      />
    </div>

    <MediaLightbox
      v-if="lightboxItem"
      :item="lightboxItem"
      :has-previous="lightboxIndex > 0"
      :has-next="lightboxIndex >= 0 && lightboxIndex < items.length - 1"
      @close="closeLightbox"
      @previous="moveLightbox(-1)"
      @next="moveLightbox(1)"
    />
  </section>
</template>

<style scoped>
.admin-media {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.admin-media__workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.admin-media__workspace--detail {
  grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);
}

.admin-media__main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 14px;
}

.media-load-error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.admin-media__state,
.admin-media__empty {
  margin: 0;
  padding: 22px;
  border: 1px solid rgba(var(--color-accent-rgb), 0.14);
  border-radius: 14px;
  background: rgba(var(--color-panel-rgb), 0.68);
}

@media (max-width: 1080px) {
  .admin-media__workspace--detail {
    grid-template-columns: 1fr;
  }
}

</style>
