<script setup lang="ts">
import { shallowRef, useTemplateRef } from 'vue'
import { useTblogI18n } from '~/composables/useTblogI18n'

interface Props {
  accept: string[]
  compact?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{ files: [files: FileList | null] }>()
const { t } = useTblogI18n()
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const dragActive = shallowRef(false)

function openPicker() {
  fileInput.value?.click()
}

function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  emit('files', input.files)
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragActive.value = false
  emit('files', event.dataTransfer?.files ?? null)
}

function onDragOver() {
  dragActive.value = true
}
</script>

<template>
  <div
    class="media-dropzone"
    :class="{ 'media-dropzone--active': dragActive, 'media-dropzone--compact': props.compact }"
    data-test="media-dropzone"
    role="button"
    tabindex="0"
    @click="openPicker"
    @keydown.enter.prevent="openPicker"
    @keydown.space.prevent="openPicker"
    @dragover.prevent="onDragOver"
    @dragleave="dragActive = false"
    @drop.prevent="onDrop"
  >
    <span class="media-dropzone__glyph" aria-hidden="true"></span>
    <span class="media-dropzone__body">
      <span class="media-dropzone__text">{{ dragActive ? t('media.dropzoneActive') : t('media.dropzone') }}</span>
      <span class="media-dropzone__hint">JPEG / PNG / GIF / WebP / AVIF</span>
    </span>
    <span class="media-dropzone__action">{{ t('media.selectFiles') }}</span>
    <input
      ref="fileInput"
      class="media-dropzone__input"
      type="file"
      multiple
      :accept="props.accept.join(',')"
      data-test="media-file-input"
      @change="onFilesSelected"
    >
  </div>
</template>

<style scoped>
.media-dropzone {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  min-height: 104px;
  padding: 20px;
  border: 1px dashed rgba(var(--color-accent-rgb), 0.5);
  border-radius: 12px;
  background:
    linear-gradient(105deg, rgba(var(--color-accent-rgb), 0.12), transparent 42%),
    rgba(var(--color-panel-rgb), 0.82);
  color: var(--color-muted);
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(var(--color-accent-rgb), 0.04), 0 10px 24px rgba(var(--color-text-rgb), 0.045);
  transition: border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.media-dropzone--active {
  border-color: var(--color-accent);
  background:
    linear-gradient(105deg, rgba(var(--color-accent-rgb), 0.18), transparent 52%),
    rgba(var(--color-panel-rgb), 0.88);
  box-shadow: 0 0 0 4px rgba(var(--color-accent-rgb), 0.1), 0 14px 28px rgba(var(--color-text-rgb), 0.07);
  transform: translateY(-1px);
}

.media-dropzone--compact {
  min-height: 68px;
  padding: 8px 0 8px 18px;
  border: 0;
  border-inline-start: 1px solid var(--color-line);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.media-dropzone--compact.media-dropzone--active {
  background: rgba(var(--color-accent-rgb), 0.08);
  box-shadow: inset 0 0 0 2px rgba(var(--color-accent-rgb), 0.12);
}

.media-dropzone:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(var(--color-accent-rgb), 0.2);
}

.media-dropzone__glyph {
  position: relative;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid rgba(var(--color-accent-rgb), 0.42);
  border-radius: 11px;
  background:
    linear-gradient(135deg, rgba(var(--color-accent-rgb), 0.18), rgba(var(--color-accent-warm-rgb), 0.08)),
    rgba(var(--color-panel-rgb), 0.85);
}

.media-dropzone__glyph::before {
  width: 12px;
  height: 10px;
  border: 1.5px solid currentColor;
  border-top: 0;
  border-radius: 2px;
  color: var(--color-accent);
  content: '';
}

.media-dropzone__glyph::after {
  position: absolute;
  top: 10px;
  width: 7px;
  height: 7px;
  border-top: 1.5px solid var(--color-accent);
  border-left: 1.5px solid var(--color-accent);
  transform: rotate(45deg);
  content: '';
}

.media-dropzone__body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.media-dropzone__text {
  overflow-wrap: anywhere;
  color: var(--color-text);
  font-size: 0.92rem;
  font-weight: 750;
}

.media-dropzone__hint {
  color: var(--color-muted);
  font-size: 0.76rem;
}

.media-dropzone__action {
  min-height: 36px;
  padding: 8px 15px;
  border: 1px solid rgba(var(--color-accent-rgb), 0.38);
  border-radius: 8px;
  background: rgba(var(--color-accent-rgb), 0.09);
  color: var(--color-accent);
  font-size: 0.82rem;
  font-weight: 800;
  white-space: nowrap;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.media-dropzone:hover .media-dropzone__action {
  border-color: rgba(var(--color-accent-rgb), 0.65);
  background: rgba(var(--color-accent-rgb), 0.15);
}

.media-dropzone__input {
  display: none;
}

@media (max-width: 640px) {
  .media-dropzone {
    grid-template-columns: auto minmax(0, 1fr);
    min-height: 116px;
    padding: 16px;
  }

  .media-dropzone__action {
    grid-column: 1 / -1;
    text-align: center;
  }
}
</style>
