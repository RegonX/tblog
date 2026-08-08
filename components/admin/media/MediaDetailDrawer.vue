<script setup lang="ts">
import type { AdminMediaItemView, AdminMediaUsageRef } from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'
import { formatMediaSize } from '~/utils/media'

interface Props {
  item: AdminMediaItemView
  notice: string
  error: string
  usageBlockers: AdminMediaUsageRef[]
  metadataSaving: boolean
  deleting: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  expand: []
  copy: [format: 'url' | 'markdown' | 'html' | 'bbcode']
  save: []
  delete: []
  forceDelete: []
  cancelUsage: []
}>()

const draftAltText = defineModel<string>('altText', { required: true })
const draftCaption = defineModel<string>('caption', { required: true })
const { t } = useTblogI18n()

function usageLabel(field: AdminMediaUsageRef['field']): string {
  if (field === 'cover') return t('media.usageCover')
  if (field === 'seoImage') return t('media.usageSeoImage')
  if (field === 'siteSettings' || field === 'profileSettings' || field === 'homeSettings') {
    return t('media.usageSettings')
  }
  return t('media.usageContent')
}

function usageTitle(usage: AdminMediaUsageRef): string {
  if (usage.field === 'siteSettings') return t('media.usageSiteSettings')
  if (usage.field === 'profileSettings') return t('media.usageProfileSettings')
  if (usage.field === 'homeSettings') return t('media.usageHomeSettings')
  return usage.title
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}
</script>

<template>
  <aside class="media-detail" data-test="media-detail" :aria-label="t('media.detailTitle')">
    <header class="media-detail__header">
      <div class="media-detail__heading">
        <h2 class="media-detail__title">{{ t('media.detailTitle') }}</h2>
        <p class="media-detail__subtitle">{{ props.item.originalFilename ?? props.item.url }}</p>
      </div>
      <button type="button" class="media-detail__close" data-test="media-detail-close" @click="emit('close')">
        {{ t('media.close') }}
      </button>
    </header>

    <div class="media-detail__preview-frame">
      <button type="button" class="media-detail__preview-button" :title="t('media.previewImage')" :aria-label="t('media.previewImage')" data-test="media-detail-expand" @click="emit('expand')">
        <img class="media-detail__preview" :src="props.item.url" :alt="props.item.altText ?? ''">
      </button>
    </div>

    <dl class="settings-readonly media-detail__facts">
      <div class="settings-readonly__row">
        <dt>{{ t('media.fieldFilename') }}</dt>
        <dd>{{ props.item.originalFilename ?? '-' }}</dd>
      </div>
      <div class="settings-readonly__row">
        <dt>{{ t('media.fieldType') }}</dt>
        <dd>{{ props.item.contentType ?? '-' }}</dd>
      </div>
      <div class="settings-readonly__row">
        <dt>{{ t('media.fieldSize') }}</dt>
        <dd>{{ props.item.sizeBytes === null ? t('media.sizeUnknown') : formatMediaSize(props.item.sizeBytes) }}</dd>
      </div>
      <div class="settings-readonly__row">
        <dt>{{ t('media.fieldUploaded') }}</dt>
        <dd>{{ formatTimestamp(props.item.createdAt) }}</dd>
      </div>
      <div class="settings-readonly__row">
        <dt>{{ t('media.fieldProvider') }}</dt>
        <dd>{{ props.item.providerKey ?? '-' }}</dd>
      </div>
    </dl>

    <div class="media-detail__copy">
      <span class="settings-field__label">{{ t('media.copy') }}</span>
      <div class="media-detail__copy-buttons">
        <button type="button" class="media-detail__copy-button" data-test="media-copy-url" @click="emit('copy', 'url')">
          {{ t('media.copyUrl') }}
        </button>
        <button type="button" class="media-detail__copy-button" data-test="media-copy-markdown" @click="emit('copy', 'markdown')">
          {{ t('media.copyMarkdown') }}
        </button>
        <button type="button" class="media-detail__copy-button" data-test="media-copy-html" @click="emit('copy', 'html')">
          {{ t('media.copyHtml') }}
        </button>
        <button type="button" class="media-detail__copy-button" data-test="media-copy-bbcode" @click="emit('copy', 'bbcode')">
          {{ t('media.copyBbcode') }}
        </button>
      </div>
    </div>

    <form class="settings-form media-detail__form" data-test="media-metadata-form" @submit.prevent="emit('save')">
      <label class="settings-field">
        <span class="settings-field__label">{{ t('media.altText') }}</span>
        <input v-model="draftAltText" class="settings-field__input" type="text" data-test="media-alt-input">
      </label>
      <label class="settings-field">
        <span class="settings-field__label">{{ t('media.caption') }}</span>
        <input v-model="draftCaption" class="settings-field__input" type="text" data-test="media-caption-input">
      </label>
      <div class="settings-panel__footer">
        <button type="submit" class="settings-panel__save" :disabled="props.metadataSaving" data-test="media-save-metadata">
          {{ t('media.saveMetadata') }}
        </button>
      </div>
    </form>

    <p v-if="props.notice" class="admin-muted" data-test="media-detail-notice">{{ props.notice }}</p>
    <p v-if="props.error" class="admin-alert" data-test="media-detail-error">{{ props.error }}</p>

    <section v-if="props.usageBlockers.length > 0" class="media-usage" data-test="media-usage">
      <h3 class="media-usage__title">{{ t('media.inUseTitle') }}</h3>
      <ul class="media-usage__list">
        <li v-for="usage in props.usageBlockers" :key="`${usage.postId}-${usage.field}`">
          <span class="media-usage__field">{{ usageLabel(usage.field) }}</span>
          <NuxtLink :to="usage.href || `/admin/posts/${usage.postId}`">{{ usageTitle(usage) }}</NuxtLink>
        </li>
      </ul>
      <p class="admin-muted">{{ t('media.inUseHint') }}</p>
      <div class="media-usage__actions">
        <button
          type="button"
          class="media-detail__delete"
          :disabled="props.deleting"
          data-test="media-force-delete"
          @click="emit('forceDelete')"
        >
          {{ props.deleting ? t('media.deleting') : t('media.inUseForceDelete') }}
        </button>
        <button type="button" class="settings-panel__sync" @click="emit('cancelUsage')">{{ t('media.cancel') }}</button>
      </div>
    </section>

    <div v-else class="media-detail__footer">
      <button
        type="button"
        class="media-detail__delete"
        :disabled="props.deleting"
        data-test="media-delete"
        @click="emit('delete')"
      >
        {{ props.deleting ? t('media.deleting') : t('media.delete') }}
      </button>
    </div>
  </aside>
</template>

<style scoped>
.media-detail {
  position: sticky;
  top: 18px;
  display: flex;
  max-height: calc(100vh - 36px);
  min-width: 0;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
  padding: 14px 10px 14px 14px;
  border: 1px solid var(--color-line);
  border-radius: 10px;
  background: rgba(var(--color-panel-rgb), 0.9);
  box-shadow: 0 16px 38px rgba(var(--color-text-rgb), 0.1);
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--color-text-rgb), 0.3) transparent;
}

.media-detail::-webkit-scrollbar { width: 6px; }
.media-detail::-webkit-scrollbar-track { background: transparent; }
.media-detail::-webkit-scrollbar-thumb { border-radius: 6px; background: rgba(var(--color-text-rgb), 0.28); }

.media-detail__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.media-detail__heading {
  min-width: 0;
}

.media-detail__title {
  margin: 0;
  color: var(--color-text);
  font-size: 1.02rem;
}

.media-detail__subtitle {
  overflow: hidden;
  margin: 2px 0 0;
  color: var(--color-muted);
  font-size: 0.76rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-detail__close {
  min-height: 30px;
  padding: 4px 10px;
  border: 1px solid var(--color-line);
  border-radius: 6px;
  background: transparent;
  color: var(--color-muted);
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.media-detail__preview-frame {
  display: grid;
  min-height: 124px;
  place-items: center;
  overflow: hidden;
  border-radius: 10px;
  background:
    linear-gradient(45deg, rgba(var(--color-accent-rgb), 0.08) 25%, transparent 25% 75%, rgba(var(--color-accent-rgb), 0.08) 75%),
    linear-gradient(45deg, rgba(var(--color-accent-rgb), 0.08) 25%, transparent 25% 75%, rgba(var(--color-accent-rgb), 0.08) 75%);
  background-position: 0 0, 10px 10px;
  background-size: 20px 20px;
}

.media-detail__preview {
  display: block;
  max-width: 100%;
  max-height: min(128px, 18vh);
  object-fit: contain;
}

.media-detail__preview-button {
  display: grid;
  max-width: 100%;
  max-height: min(128px, 18vh);
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: zoom-in;
}

.media-detail__preview-button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 4px;
}

.media-detail__facts {
  margin: 0;
  padding: 2px 0;
  border-top: 1px solid var(--color-line);
  border-bottom: 1px solid var(--color-line);
}

.media-detail__facts :deep(.settings-readonly__row) { display: grid; grid-template-columns: 78px minmax(0, 1fr); gap: 10px; padding: 7px 0; border: 0; }
.media-detail__facts :deep(dt) { color: var(--color-muted); font-size: 0.72rem; font-weight: 700; }
.media-detail__facts :deep(dd) { min-width: 0; overflow: hidden; color: var(--color-text); font-size: 0.76rem; font-weight: 750; text-align: end; text-overflow: ellipsis; white-space: nowrap; }

.media-detail__copy,
.media-detail__form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.media-detail__copy-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.media-detail__copy-button { min-height: 30px; padding: 4px 9px; border: 1px solid var(--color-line); border-radius: 6px; background: rgba(var(--color-page-rgb), 0.18); color: var(--color-muted); font: inherit; font-size: 0.72rem; font-weight: 750; cursor: pointer; }
.media-detail__copy-button:hover, .media-detail__copy-button:focus-visible { border-color: rgba(var(--color-accent-rgb), 0.62); background: rgba(var(--color-accent-rgb), 0.1); color: var(--color-accent); outline: none; }

.media-detail__form :deep(.settings-field) { gap: 5px; }
.media-detail__form :deep(.settings-field__label), .media-detail__copy > .settings-field__label { color: var(--color-muted); font-size: 0.7rem; font-weight: 800; }
.media-detail__form :deep(.settings-field__input) { min-height: 34px; border-radius: 6px; background: rgba(var(--color-page-rgb), 0.24); font-size: 0.78rem; }
.media-detail__form :deep(.settings-panel__footer) { margin-top: 0; }
.media-detail__form :deep(.settings-panel__save) { min-height: 34px; border-radius: 6px; }

.media-detail__footer,
.media-usage__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.media-detail__delete {
  min-height: 36px;
  padding: 8px 18px;
  border: 1px solid var(--color-accent-warm);
  border-radius: 8px;
  background: transparent;
  color: var(--color-accent-warm);
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.media-detail__delete:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.media-usage {
  padding: 12px 14px;
  border: 1px solid rgba(var(--color-accent-warm-rgb), 0.6);
  border-radius: 10px;
  background: rgba(var(--color-accent-warm-rgb), 0.06);
}

.media-usage__title {
  margin: 0 0 8px;
  color: var(--color-text);
  font-size: 0.9rem;
}

.media-usage__list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
  font-size: 0.82rem;
}

.media-usage__field {
  margin-inline-end: 8px;
  color: var(--color-muted);
  font-weight: 800;
}

@media (max-width: 1080px) {
  .media-detail {
    position: static;
    max-height: none;
  }
}
</style>
