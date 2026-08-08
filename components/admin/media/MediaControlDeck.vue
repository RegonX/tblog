<script setup lang="ts">
import { shallowRef } from 'vue'
import MediaDropzone from '~/components/admin/media/MediaDropzone.vue'
import MediaFilterBar from '~/components/admin/media/MediaFilterBar.vue'
import type { AdminMediaStatsView } from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

interface Props {
  stats: AdminMediaStatsView | null
  uploadsDisabled: boolean
  accept: string[]
  contentTypes: string[]
}

const props = defineProps<Props>()
const { t } = useTblogI18n()
const activePanel = shallowRef<'upload' | null>(null)
const emit = defineEmits<{
  files: [files: FileList | null]
  apply: []
  reset: []
}>()

const q = defineModel<string>('q', { required: true })
const contentType = defineModel<string>('contentType', { required: true })
const from = defineModel<string>('from', { required: true })
const to = defineModel<string>('to', { required: true })

function toggleUpload() {
  activePanel.value = activePanel.value === 'upload' ? null : 'upload'
}
</script>

<template>
  <section class="media-control-deck" data-test="media-control-deck">
    <div class="media-control-deck__bar">
      <div class="media-control-deck__location">
        <span class="media-control-deck__location-icon" aria-hidden="true"></span>
        <span>{{ t('media.title') }}</span>
      </div>

      <span class="media-control-deck__count" :title="t('media.statsCount')" data-test="media-stats-count">
        {{ props.stats?.totalCount ?? '-' }}
      </span>

      <button
        class="media-control-deck__command media-control-deck__command--primary"
        :class="{ 'media-control-deck__command--active': activePanel === 'upload' }"
        type="button"
        data-test="media-upload-toggle"
        :aria-expanded="activePanel === 'upload'"
        @click="toggleUpload"
      >
        {{ t('media.openUpload') }}
      </button>
    </div>

    <div class="media-control-deck__filters">
      <MediaFilterBar
        v-model:q="q"
        v-model:content-type="contentType"
        v-model:from="from"
        v-model:to="to"
        :content-types="props.contentTypes"
        embedded
        @apply="emit('apply')"
        @reset="emit('reset')"
      />
    </div>

    <div v-if="activePanel === 'upload'" class="media-control-deck__panel" data-test="media-upload-panel">
      <p v-if="props.uploadsDisabled" class="admin-alert media-storage-missing" data-test="media-storage-missing">
        <span>{{ t('media.storageMissing') }}</span>
        <NuxtLink class="media-storage-missing__link" to="/admin/settings">{{ t('media.storageSettingsLink') }}</NuxtLink>
      </p>
      <MediaDropzone v-else :accept="props.accept" @files="emit('files', $event)" />
    </div>

  </section>
</template>

<style scoped>
.media-control-deck { border: 1px solid var(--color-line); border-radius: 10px; background: rgba(var(--color-panel-rgb), 0.58); box-shadow: 0 14px 30px rgba(var(--color-text-rgb), 0.045); }
.media-control-deck__bar { display: flex; min-height: 50px; align-items: center; gap: 10px; padding: 8px 12px 6px; }
.media-control-deck__location { display: inline-flex; align-items: center; gap: 8px; min-width: 126px; padding: 0 5px; color: var(--color-text); font-size: 0.82rem; font-weight: 850; white-space: nowrap; }
.media-control-deck__location-icon { position: relative; width: 16px; height: 13px; border: 1.5px solid currentColor; border-radius: 2px; color: var(--color-accent); }
.media-control-deck__location-icon::after { position: absolute; right: 1px; bottom: 2px; left: 1px; height: 5px; border-top: 1.5px solid currentColor; content: ''; transform: skewY(-26deg); }
.media-control-deck__count { display: grid; min-width: 32px; height: 28px; place-items: center; margin-left: auto; padding: 0 8px; border: 1px solid var(--color-line); border-radius: 14px; color: var(--color-muted); font-size: 0.72rem; font-variant-numeric: tabular-nums; }
.media-control-deck__command { min-height: 36px; padding: 0 12px; border: 1px solid var(--color-line); border-radius: 6px; background: transparent; color: var(--color-muted); font: inherit; font-size: 0.76rem; font-weight: 750; cursor: pointer; }
.media-control-deck__command:hover, .media-control-deck__command:focus-visible, .media-control-deck__command--active { border-color: rgba(var(--color-accent-rgb), 0.68); background: rgba(var(--color-accent-rgb), 0.09); color: var(--color-accent); outline: none; }
.media-control-deck__command--primary { border-color: rgba(var(--color-accent-rgb), 0.5); background: rgba(var(--color-accent-rgb), 0.14); color: var(--color-accent); }
.media-control-deck__filters { padding: 0 12px 12px; }
.media-control-deck__panel { padding: 12px; border-top: 1px solid var(--color-line); background: rgba(var(--color-page-rgb), 0.22); }
.media-storage-missing { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; }
.media-storage-missing__link { color: var(--color-accent); font-weight: 800; }
@media (max-width: 900px) { .media-control-deck__location { min-width: auto; } .media-control-deck__count { display: none; } }
@media (max-width: 640px) { .media-control-deck__location { display: none; } }
</style>
