<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import type { AdminMediaItemView } from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'
import { formatMediaSize } from '~/utils/media'

type LinkFormat = 'url' | 'thumbnail' | 'markdown' | 'html'

interface Props {
  items: AdminMediaItemView[]
  deleting?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  select: [item: AdminMediaItemView]
  copy: [item: AdminMediaItemView, format: LinkFormat]
  delete: [item: AdminMediaItemView]
}>()

const { t } = useTblogI18n()
const openLinkMenuId = shallowRef<string | null>(null)
const imageSource = (item: AdminMediaItemView) => item.thumbnailUrl ?? item.url
const fileType = (item: AdminMediaItemView) => (
  item.contentType?.split('/').pop()?.toUpperCase()
  ?? item.originalFilename?.split('.').pop()?.toUpperCase()
  ?? 'FILE'
)

function toggleLinkMenu(id: string) {
  openLinkMenuId.value = openLinkMenuId.value === id ? null : id
}

function copyLink(item: AdminMediaItemView, format: LinkFormat) {
  openLinkMenuId.value = null
  emit('copy', item, format)
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Element)) return
  if (!target.closest('.media-card__link-menu, .media-card__action--link')) openLinkMenuId.value = null
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <ul class="media-grid" data-test="media-grid">
    <li v-for="item in props.items" :key="item.id" class="media-grid__cell">
      <article class="media-card" data-test="media-card">
        <button type="button" class="media-card__preview" :aria-label="t('media.previewImage')" @click="emit('select', item)">
          <img
            class="media-card__image"
            :src="imageSource(item)"
            :alt="item.altText ?? ''"
            loading="lazy"
            decoding="async"
          >
          <span class="media-card__overlay">
            <span class="media-card__name">{{ item.originalFilename ?? item.url }}</span>
            <span class="media-card__meta">
              {{ item.sizeBytes === null ? t('media.sizeUnknown') : formatMediaSize(item.sizeBytes) }}
            </span>
          </span>
        </button>

        <span class="media-card__type">{{ fileType(item) }}</span>

        <div class="media-card__actions" @click.stop>
          <a
            class="media-card__action"
            :href="item.url"
            :download="item.originalFilename ?? ''"
            target="_blank"
            rel="noreferrer"
            :title="t('media.download')"
            :aria-label="t('media.download')"
            data-test="media-card-download"
            @click.stop
          >
            <span class="media-icon media-icon--download" aria-hidden="true"></span>
          </a>
          <button
            type="button"
            class="media-card__action media-card__action--link"
            :class="{ 'media-card__action--active': openLinkMenuId === item.id }"
            :title="t('media.copyLinks')"
            :aria-label="t('media.copyLinks')"
            :aria-expanded="openLinkMenuId === item.id"
            data-test="media-card-links"
            @click="toggleLinkMenu(item.id)"
          >
            <span class="media-icon media-icon--link" aria-hidden="true"></span>
          </button>
          <button
            type="button"
            class="media-card__action media-card__action--danger"
            :title="t('media.delete')"
            :aria-label="t('media.delete')"
            :disabled="props.deleting"
            data-test="media-card-delete"
            @click="emit('delete', item)"
          >
            <span class="media-icon media-icon--delete" aria-hidden="true"></span>
          </button>

          <div v-if="openLinkMenuId === item.id" class="media-card__link-menu" role="menu" :aria-label="t('media.copyLinks')">
            <p class="media-card__link-menu-title">{{ t('media.copyLinks') }}</p>
            <button type="button" role="menuitem" data-test="media-card-copy-url" @click="copyLink(item, 'url')">
              <span>{{ t('media.copyOriginalUrl') }}</span><small>{{ t('media.copy') }}</small>
            </button>
            <button type="button" role="menuitem" data-test="media-card-copy-thumbnail" @click="copyLink(item, 'thumbnail')">
              <span>{{ t('media.copyThumbnailUrl') }}</span><small>{{ t('media.copy') }}</small>
            </button>
            <button type="button" role="menuitem" data-test="media-card-copy-markdown" @click="copyLink(item, 'markdown')">
              <span>{{ t('media.copyMarkdown') }}</span><small>{{ t('media.copy') }}</small>
            </button>
            <button type="button" role="menuitem" data-test="media-card-copy-html" @click="copyLink(item, 'html')">
              <span>{{ t('media.copyHtml') }}</span><small>{{ t('media.copy') }}</small>
            </button>
          </div>
        </div>
      </article>
    </li>
  </ul>
</template>

<style scoped>
.media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(228px, 1fr)); gap: 18px 16px; margin: 0; padding: 0; list-style: none; }
.media-card { position: relative; display: flex; min-width: 0; flex-direction: column; width: 100%; overflow: visible; border: 1px solid var(--color-line); border-radius: 8px; background: var(--color-panel); box-shadow: none; cursor: pointer; text-align: start; transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease; }
.media-card:hover { border-color: rgba(var(--color-accent-rgb), 0.64); box-shadow: 0 10px 22px rgba(var(--color-text-rgb), 0.1); transform: translateY(-1px); }
.media-card__preview { position: relative; display: block; width: 100%; aspect-ratio: 1 / 0.64; overflow: hidden; padding: 0; border: 0; border-radius: 7px; background: var(--admin-subtle); color: inherit; cursor: pointer; text-align: start; }
.media-card__preview:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px; }
.media-card__image { display: block; width: 100%; height: 100%; background: var(--admin-subtle); object-fit: cover; transition: transform 0.26s ease; }
.media-card:hover .media-card__image { transform: scale(1.025); }
.media-card__overlay { position: absolute; right: 0; bottom: 0; left: 0; display: flex; min-height: 48px; flex-direction: column; justify-content: center; gap: 2px; padding: 9px 10px; background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.7) 42%, rgba(0, 0, 0, 0.86)); color: #fff; }
.media-card__type { position: absolute; top: 8px; left: 8px; z-index: 3; max-width: calc(100% - 16px); overflow: hidden; padding: 3px 7px; border: 1px solid rgba(45, 125, 82, 0.7); border-radius: 5px; background: rgba(25, 103, 56, 0.92); color: #e8fff0; font-size: 0.62rem; font-weight: 850; letter-spacing: 0.05em; text-overflow: ellipsis; white-space: nowrap; }
.media-card__actions { position: absolute; right: 9px; bottom: 9px; z-index: 4; display: flex; gap: 6px; opacity: 0; transform: translateY(3px); transition: opacity 0.16s ease, transform 0.16s ease; }
.media-card:hover .media-card__actions, .media-card:focus-within .media-card__actions { opacity: 1; transform: translateY(0); }
.media-card__action { display: grid; width: 30px; height: 30px; place-items: center; padding: 0; border: 1px solid rgba(255, 255, 255, 0.26); border-radius: 50%; background: rgba(var(--color-panel-rgb), 0.48); box-shadow: 0 3px 10px rgba(0, 0, 0, 0.12); color: rgba(255, 255, 255, 0.9); cursor: pointer; text-decoration: none; transition: border-color 0.14s ease, background 0.14s ease, color 0.14s ease, transform 0.14s ease; backdrop-filter: blur(5px); }
.media-card__action:hover, .media-card__action:focus-visible, .media-card__action--active { border-color: rgba(var(--color-accent-rgb), 0.84); background: rgba(var(--color-accent-rgb), 0.24); color: #fff; outline: none; transform: translateY(-1px); }
.media-card__action--danger:hover, .media-card__action--danger:focus-visible { border-color: rgba(var(--color-accent-warm-rgb), 0.8); background: rgba(var(--color-accent-warm-rgb), 0.2); color: #fff; }
.media-card__action:disabled { cursor: wait; opacity: 0.52; }
.media-icon { position: relative; display: inline-block; width: 14px; height: 14px; }
.media-icon--download::before { position: absolute; top: 0; left: 6px; height: 8px; border-left: 1.5px solid currentColor; content: ''; }
.media-icon--download::after { position: absolute; right: 1px; bottom: 0; left: 1px; height: 4px; border: 1.5px solid currentColor; border-top: 0; content: ''; }
.media-icon--download { border-bottom: 1.5px solid currentColor; }
.media-icon--link { width: 12px; height: 7px; border: 1.5px solid currentColor; border-radius: 6px; transform: rotate(-42deg); }
.media-icon--link::after { position: absolute; top: 2px; left: 8px; width: 7px; border-top: 1.5px solid currentColor; content: ''; }
.media-icon--delete::before, .media-icon--delete::after { position: absolute; top: 6px; left: 0; width: 14px; border-top: 1.5px solid currentColor; content: ''; transform: rotate(45deg); }
.media-icon--delete::after { transform: rotate(-45deg); }
.media-card__link-menu { position: absolute; right: 0; bottom: 39px; z-index: 5; width: 184px; overflow: hidden; border: 1px solid var(--color-line); border-radius: 8px; background: rgba(var(--color-panel-rgb), 0.96); box-shadow: 0 18px 34px rgba(var(--color-text-rgb), 0.24); backdrop-filter: blur(12px); }
.media-card__link-menu-title { margin: 0; padding: 9px 10px 7px; color: var(--color-accent); font-size: 0.66rem; font-weight: 900; letter-spacing: 0.08em; }
.media-card__link-menu button { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border: 0; border-top: 1px solid var(--color-line); background: transparent; color: var(--color-text); font: inherit; font-size: 0.72rem; text-align: start; cursor: pointer; }
.media-card__link-menu button:hover, .media-card__link-menu button:focus-visible { background: rgba(var(--color-accent-rgb), 0.09); color: var(--color-accent); outline: none; }
.media-card__link-menu small { color: var(--color-muted); font-size: 0.64rem; }
.media-card__name { overflow: hidden; font-size: 0.76rem; font-weight: 800; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
.media-card__meta { color: rgba(255, 255, 255, 0.74); font-size: 0.67rem; line-height: 1.2; }
@media (max-width: 640px) { .media-grid { grid-template-columns: repeat(auto-fill, minmax(142px, 1fr)); gap: 10px; } .media-card__preview { aspect-ratio: 1 / 0.78; } .media-card__actions { opacity: 1; transform: none; } .media-card__link-menu { width: min(184px, calc(100vw - 42px)); } }
</style>
