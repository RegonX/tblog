<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, shallowRef, useTemplateRef } from 'vue'
import type { AdminMediaItemView } from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

interface Props {
  item: AdminMediaItemView
  hasPrevious: boolean
  hasNext: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  previous: []
  next: []
}>()

const { t } = useTblogI18n()
const stage = useTemplateRef<HTMLDivElement>('stage')
const zoom = shallowRef(1)
const spacePressed = shallowRef(false)
const pan = reactive({ x: 0, y: 0 })
const drag = reactive({
  active: false,
  pointerId: -1,
  startX: 0,
  startY: 0,
  startPanX: 0,
  startPanY: 0
})

const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`)
const imageStyle = computed(() => ({
  transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom.value})`
}))

function clampZoom(value: number) {
  return Math.min(4, Math.max(0.08, Number(value.toFixed(3))))
}

function resetPan() {
  pan.x = 0
  pan.y = 0
}

function setZoom(nextZoom: number, anchor?: { clientX: number; clientY: number }) {
  const currentZoom = zoom.value
  const safeZoom = clampZoom(nextZoom)
  if (safeZoom === currentZoom) return

  const bounds = stage.value?.getBoundingClientRect()
  if (anchor && bounds) {
    const offsetX = anchor.clientX - bounds.left - (bounds.width / 2) - pan.x
    const offsetY = anchor.clientY - bounds.top - (bounds.height / 2) - pan.y
    const ratio = safeZoom / currentZoom
    pan.x -= offsetX * (ratio - 1)
    pan.y -= offsetY * (ratio - 1)
  }
  zoom.value = safeZoom
}

function changeZoom(amount: number) {
  setZoom(zoom.value + amount)
}

function fitToStage() {
  zoom.value = 1
  resetPan()
}

function resetZoom() {
  zoom.value = 1
  resetPan()
}

function onWheel(event: WheelEvent) {
  setZoom(zoom.value * (event.deltaY > 0 ? 0.88 : 1.12), event)
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  drag.active = true
  drag.pointerId = event.pointerId
  drag.startX = event.clientX
  drag.startY = event.clientY
  drag.startPanX = pan.x
  drag.startPanY = pan.y
  stage.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!drag.active || drag.pointerId !== event.pointerId) return
  pan.x = drag.startPanX + event.clientX - drag.startX
  pan.y = drag.startPanY + event.clientY - drag.startY
}

function finishPan(event?: PointerEvent) {
  if (event && drag.pointerId === event.pointerId && stage.value?.hasPointerCapture(event.pointerId)) {
    stage.value.releasePointerCapture(event.pointerId)
  }
  drag.active = false
  drag.pointerId = -1
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
  if (event.key === 'ArrowLeft' && props.hasPrevious) emit('previous')
  if (event.key === 'ArrowRight' && props.hasNext) emit('next')
  if (event.key === '+' || event.key === '=') changeZoom(0.25)
  if (event.key === '-') changeZoom(-0.25)
  if (event.code === 'Space' && !event.repeat) {
    event.preventDefault()
    spacePressed.value = true
  }
}

function onKeyup(event: KeyboardEvent) {
  if (event.code === 'Space') spacePressed.value = false
}

function onImageLoad() {
  resetPan()
  fitToStage()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('keyup', onKeyup)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('keyup', onKeyup)
})
</script>

<template>
  <div class="media-lightbox" role="dialog" aria-modal="true" :aria-label="t('media.fullscreenPreview')" data-test="media-lightbox" @click.self="emit('close')">
    <div class="media-lightbox__topbar">
      <p class="media-lightbox__filename">{{ props.item.originalFilename ?? props.item.url }}</p>
      <div class="media-lightbox__tools">
        <button type="button" class="media-lightbox__tool" :title="t('media.zoomOut')" :aria-label="t('media.zoomOut')" data-test="media-lightbox-zoom-out" @click="changeZoom(-0.25)">
          <span class="media-lightbox__tool-icon media-lightbox__tool-icon--minus" aria-hidden="true"></span>
        </button>
        <span class="media-lightbox__zoom">{{ zoomLabel }}</span>
        <button type="button" class="media-lightbox__tool" :title="t('media.zoomIn')" :aria-label="t('media.zoomIn')" data-test="media-lightbox-zoom-in" @click="changeZoom(0.25)">
          <span class="media-lightbox__tool-icon media-lightbox__tool-icon--plus" aria-hidden="true"></span>
        </button>
        <button type="button" class="media-lightbox__tool" :title="t('media.fitImage')" :aria-label="t('media.fitImage')" data-test="media-lightbox-fit" @click="fitToStage">
          <span class="media-lightbox__tool-icon media-lightbox__tool-icon--fit" aria-hidden="true"></span>
        </button>
        <button type="button" class="media-lightbox__tool" :title="t('media.actualSize')" :aria-label="t('media.actualSize')" data-test="media-lightbox-reset" @click="resetZoom">
          <span class="media-lightbox__tool-icon media-lightbox__tool-icon--reset" aria-hidden="true"></span>
        </button>
        <button type="button" class="media-lightbox__tool media-lightbox__close" :title="t('media.close')" :aria-label="t('media.close')" data-test="media-lightbox-close" @click="emit('close')">
          <span class="media-lightbox__tool-icon media-lightbox__tool-icon--close" aria-hidden="true"></span>
        </button>
      </div>
    </div>

    <button v-if="props.hasPrevious" type="button" class="media-lightbox__nav media-lightbox__nav--previous" :title="t('media.previousImage')" :aria-label="t('media.previousImage')" data-test="media-lightbox-previous" @click="emit('previous')">
      <span aria-hidden="true">&lt;</span>
    </button>
    <div
      ref="stage"
      class="media-lightbox__stage"
      :class="{ 'media-lightbox__stage--dragging': drag.active || spacePressed }"
      data-test="media-lightbox-stage"
      @dblclick="resetZoom"
      @wheel.prevent="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="finishPan"
      @pointercancel="finishPan"
    >
      <img
        class="media-lightbox__image"
        :src="props.item.url"
        :alt="props.item.altText ?? ''"
        :style="imageStyle"
        draggable="false"
        @dragstart.prevent
        @load="onImageLoad"
      >
      <p class="media-lightbox__hint">{{ t('media.canvasHint') }}</p>
    </div>
    <button v-if="props.hasNext" type="button" class="media-lightbox__nav media-lightbox__nav--next" :title="t('media.nextImage')" :aria-label="t('media.nextImage')" data-test="media-lightbox-next" @click="emit('next')">
      <span aria-hidden="true">&gt;</span>
    </button>
  </div>
</template>

<style scoped>
.media-lightbox { position: fixed; z-index: 100; inset: 0; display: grid; grid-template-rows: auto 1fr; background: rgba(8, 11, 14, 0.95); color: #fff; }
.media-lightbox__topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.09); background: rgba(8, 12, 15, 0.82); backdrop-filter: blur(16px); }
.media-lightbox__filename { min-width: 0; margin: 0; overflow: hidden; color: rgba(255, 255, 255, 0.76); font-size: 0.8rem; text-overflow: ellipsis; white-space: nowrap; }
.media-lightbox__tools { display: flex; align-items: center; gap: 3px; padding: 3px; border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(255, 255, 255, 0.045); }
.media-lightbox__tool, .media-lightbox__nav { display: grid; place-items: center; border: 0; background: transparent; color: rgba(255, 255, 255, 0.72); cursor: pointer; }
.media-lightbox__tool { width: 31px; height: 31px; }
.media-lightbox__tool:hover, .media-lightbox__tool:focus-visible, .media-lightbox__nav:hover, .media-lightbox__nav:focus-visible { background: rgba(255, 255, 255, 0.13); color: #fff; outline: none; }
.media-lightbox__tool-icon { position: relative; display: block; width: 13px; height: 13px; }
.media-lightbox__tool-icon--minus::before, .media-lightbox__tool-icon--plus::before, .media-lightbox__tool-icon--plus::after { position: absolute; top: 6px; left: 1px; width: 11px; border-top: 1.5px solid currentColor; content: ''; }
.media-lightbox__tool-icon--plus::after { transform: rotate(90deg); }
.media-lightbox__tool-icon--fit { border: 1.5px solid currentColor; }
.media-lightbox__tool-icon--fit::before, .media-lightbox__tool-icon--fit::after { position: absolute; width: 4px; height: 4px; border-color: currentColor; content: ''; }
.media-lightbox__tool-icon--fit::before { top: -2px; left: -2px; border-top: 1.5px solid; border-left: 1.5px solid; }
.media-lightbox__tool-icon--fit::after { right: -2px; bottom: -2px; border-right: 1.5px solid; border-bottom: 1.5px solid; }
.media-lightbox__tool-icon--reset { border: 1.5px solid currentColor; border-left-color: transparent; border-radius: 50%; }
.media-lightbox__tool-icon--reset::after { position: absolute; top: -2px; left: -1px; width: 5px; height: 5px; border-top: 1.5px solid currentColor; border-left: 1.5px solid currentColor; content: ''; transform: rotate(8deg); }
.media-lightbox__tool-icon--close::before, .media-lightbox__tool-icon--close::after { position: absolute; top: 6px; left: 0; width: 13px; border-top: 1.5px solid currentColor; content: ''; transform: rotate(45deg); }
.media-lightbox__tool-icon--close::after { transform: rotate(-45deg); }
.media-lightbox__zoom { min-width: 46px; color: rgba(255, 255, 255, 0.82); font-size: 0.72rem; font-variant-numeric: tabular-nums; text-align: center; }
.media-lightbox__stage { position: relative; display: grid; min-height: 0; place-items: center; overflow: hidden; padding: 26px 72px 42px; background: linear-gradient(45deg, rgba(255, 255, 255, 0.035) 25%, transparent 25% 75%, rgba(255, 255, 255, 0.035) 75%), linear-gradient(45deg, rgba(255, 255, 255, 0.035) 25%, transparent 25% 75%, rgba(255, 255, 255, 0.035) 75%); background-position: 0 0, 18px 18px; background-size: 36px 36px; cursor: grab; touch-action: none; user-select: none; }
.media-lightbox__stage--dragging { cursor: grabbing; }
.media-lightbox__image { display: block; max-width: 100%; max-height: 100%; object-fit: contain; transform-origin: center; transition: transform 0.14s ease-out; will-change: transform; }
.media-lightbox__stage--dragging .media-lightbox__image { transition: none; }
.media-lightbox__hint { position: absolute; bottom: 16px; left: 20px; margin: 0; color: rgba(255, 255, 255, 0.5); font-size: 0.7rem; pointer-events: none; }
.media-lightbox__nav { position: absolute; top: 50%; z-index: 2; width: 42px; height: 58px; border: 1px solid rgba(255, 255, 255, 0.15); background: rgba(10, 14, 18, 0.62); transform: translateY(-50%); font-family: ui-monospace, monospace; font-size: 1.1rem; }
.media-lightbox__nav--previous { left: 16px; }
.media-lightbox__nav--next { right: 16px; }
@media (max-width: 640px) { .media-lightbox__topbar { padding: 9px 10px; } .media-lightbox__filename { display: none; } .media-lightbox__tools { margin-left: auto; } .media-lightbox__stage { padding: 14px 14px 54px; } .media-lightbox__hint { right: 14px; bottom: 18px; left: 14px; text-align: center; } .media-lightbox__nav { top: auto; bottom: 12px; width: 38px; height: 34px; transform: none; } .media-lightbox__nav--previous { left: 14px; } .media-lightbox__nav--next { right: 14px; } }
</style>
