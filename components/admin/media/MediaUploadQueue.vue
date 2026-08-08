<script setup lang="ts">
import { computed } from 'vue'
import { useTblogI18n } from '~/composables/useTblogI18n'

type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed'

interface UploadEntry {
  id: number
  file: File
  name: string
  status: UploadStatus
  error: string
}

interface Props {
  uploads: UploadEntry[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  retry: [entry: UploadEntry]
  remove: [id: number]
  clearDone: []
}>()

const { t } = useTblogI18n()
const activeUploads = computed(() => (
  props.uploads.filter((entry) => entry.status === 'queued' || entry.status === 'uploading')
))
const finishedUploads = computed(() => props.uploads.filter((entry) => entry.status === 'done'))
</script>

<template>
  <section class="media-queue" data-test="media-upload-queue">
    <div class="media-queue__heading">
      <h2 class="media-queue__title">{{ t('media.uploadQueue') }}</h2>
      <button
        v-if="finishedUploads.length > 0"
        type="button"
        class="media-queue__clear"
        data-test="media-upload-clear"
        @click="emit('clearDone')"
      >
        {{ t('media.uploadClearDone') }}
      </button>
    </div>
    <ul class="media-queue__list">
      <li v-for="entry in props.uploads" :key="entry.id" class="media-queue__item" :data-status="entry.status">
        <span class="media-queue__status-dot" aria-hidden="true"></span>
        <span class="media-queue__name">{{ entry.name }}</span>
        <span class="media-queue__status">
          <template v-if="entry.status === 'uploading'">{{ t('media.uploading') }}</template>
          <template v-else-if="entry.status === 'done'">{{ t('media.uploadSucceeded') }}</template>
          <template v-else-if="entry.status === 'failed'">{{ entry.error || t('media.uploadFailed') }}</template>
        </span>
        <button
          v-if="entry.status === 'failed'"
          type="button"
          class="media-queue__button"
          data-test="media-upload-retry"
          @click="emit('retry', entry)"
        >
          {{ t('media.uploadRetry') }}
        </button>
        <button
          v-if="entry.status !== 'uploading'"
          type="button"
          class="media-queue__button"
          @click="emit('remove', entry.id)"
        >
          {{ t('media.uploadRemove') }}
        </button>
      </li>
    </ul>
    <p v-if="activeUploads.length > 0" class="admin-muted media-queue__active" data-test="media-upload-active">
      {{ t('media.uploading') }}
    </p>
  </section>
</template>

<style scoped>
.media-queue {
  padding: 14px;
  border: 1px solid rgba(var(--color-accent-rgb), 0.16);
  border-radius: 14px;
  background: rgba(var(--color-panel-rgb), 0.78);
}

.media-queue__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.media-queue__title {
  margin: 0;
  color: var(--color-text);
  font-size: 0.94rem;
}

.media-queue__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.media-queue__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 9px;
  min-height: 34px;
  padding: 6px 0;
  border-top: 1px solid rgba(var(--color-accent-rgb), 0.1);
  font-size: 0.8rem;
}

.media-queue__status-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--color-muted);
}

.media-queue__item[data-status='uploading'] .media-queue__status-dot {
  background: var(--color-accent);
}

.media-queue__item[data-status='failed'] .media-queue__status-dot {
  background: var(--color-accent-warm);
}

.media-queue__item[data-status='done'] .media-queue__status-dot {
  background: var(--admin-success);
}

.media-queue__name {
  overflow: hidden;
  color: var(--color-text);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-queue__status {
  max-width: 220px;
  overflow: hidden;
  color: var(--color-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-queue__item[data-status='failed'] .media-queue__status {
  color: var(--color-accent-warm);
}

.media-queue__item[data-status='done'] .media-queue__status {
  color: var(--admin-success);
}

.media-queue__button,
.media-queue__clear {
  min-height: 28px;
  padding: 4px 10px;
  border: 1px solid var(--color-line);
  border-radius: 7px;
  background: rgba(var(--color-panel-rgb), 0.76);
  color: var(--color-text);
  font: inherit;
  font-size: 0.76rem;
  cursor: pointer;
}

.media-queue__active {
  margin: 10px 0 0;
}

@media (max-width: 700px) {
  .media-queue__item {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .media-queue__status,
  .media-queue__button {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
