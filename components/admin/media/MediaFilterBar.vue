<script setup lang="ts">
import { useTblogI18n } from '~/composables/useTblogI18n'

interface Props {
  contentTypes: string[]
  embedded?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{ apply: []; reset: [] }>()
const q = defineModel<string>('q', { required: true })
const contentType = defineModel<string>('contentType', { required: true })
const from = defineModel<string>('from', { required: true })
const to = defineModel<string>('to', { required: true })
const { t } = useTblogI18n()
</script>

<template>
  <form class="media-filters" :class="{ 'media-filters--embedded': props.embedded }" data-test="media-filters" @submit.prevent="emit('apply')">
    <label class="media-filters__search">
      <span class="media-filters__visually-hidden">{{ t('media.searchLabel') }}</span>
      <span class="media-filters__search-shell">
        <span class="media-filters__search-icon" aria-hidden="true"></span>
        <input
          v-model="q"
          class="settings-field__input media-filters__input"
          type="search"
          :placeholder="t('media.searchPlaceholder')"
          data-test="media-filter-q"
        >
      </span>
    </label>
    <label class="media-filters__field">
      <span class="media-filters__visually-hidden">{{ t('media.typeLabel') }}</span>
      <select v-model="contentType" class="settings-field__input media-filters__input" :aria-label="t('media.typeLabel')" data-test="media-filter-type">
        <option value="">{{ t('media.typeAll') }}</option>
        <option v-for="type in props.contentTypes" :key="type" :value="type">{{ type }}</option>
      </select>
    </label>
    <label class="media-filters__date-field">
      <span class="media-filters__date-label" aria-hidden="true">{{ t('media.fromLabel').slice(0, 1) }}</span>
      <span class="media-filters__visually-hidden">{{ t('media.fromLabel') }}</span>
      <input v-model="from" class="settings-field__input media-filters__input" type="date" :aria-label="t('media.fromLabel')" data-test="media-filter-from">
    </label>
    <label class="media-filters__date-field">
      <span class="media-filters__date-label" aria-hidden="true">{{ t('media.toLabel').slice(0, 1) }}</span>
      <span class="media-filters__visually-hidden">{{ t('media.toLabel') }}</span>
      <input v-model="to" class="settings-field__input media-filters__input" type="date" :aria-label="t('media.toLabel')" data-test="media-filter-to">
    </label>
    <div class="media-filters__actions">
      <button class="media-filters__apply" type="submit" data-test="media-filter-apply">{{ t('media.filterApply') }}</button>
      <button class="media-filters__reset" type="button" data-test="media-filter-reset" @click="emit('reset')">
        {{ t('media.filterReset') }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.media-filters {
  display: grid;
  grid-template-columns: minmax(250px, 1.8fr) minmax(135px, 0.72fr) minmax(132px, 0.68fr) minmax(132px, 0.68fr) auto;
  align-items: end;
  gap: 10px;
  padding: 8px;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  background: rgba(var(--color-page-rgb), 0.26);
}

.media-filters__search,
.media-filters__field,
.media-filters__date-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0;
}

.media-filters__date-field { position: relative; }

.media-filters__date-label { position: absolute; top: 50%; left: 9px; z-index: 1; color: var(--color-muted); font-size: 0.7rem; font-weight: 800; pointer-events: none; transform: translateY(-50%); }

.media-filters__date-field .media-filters__input { padding-inline-start: 26px; }

.media-filters__input {
  height: 36px;
  min-width: 0;
  border-radius: 6px;
  font-size: 0.76rem;
}

.media-filters__visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }

.media-filters__search-shell {
  position: relative;
  display: block;
}

.media-filters__search-shell .media-filters__input {
  width: 100%;
  padding-inline-start: 34px;
}

.media-filters__search-icon {
  position: absolute;
  top: 50%;
  left: 12px;
  z-index: 1;
  width: 12px;
  height: 12px;
  border: 1.5px solid var(--color-muted);
  border-radius: 50%;
  pointer-events: none;
  transform: translateY(-58%);
}

.media-filters__search-icon::after {
  position: absolute;
  right: -4px;
  bottom: -2px;
  width: 5px;
  border-top: 1.5px solid var(--color-muted);
  content: '';
  transform: rotate(45deg);
}

.media-filters__actions {
  display: flex;
  gap: 8px;
}

.media-filters--embedded {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.media-filters--embedded .media-filters__input {
  border-color: transparent;
  background: rgba(var(--color-panel-rgb), 0.84);
  transition: border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
}

.media-filters--embedded .media-filters__input:focus {
  border-color: rgba(var(--color-accent-rgb), 0.58);
  background: var(--color-panel);
  box-shadow: 0 0 0 3px rgba(var(--color-accent-rgb), 0.1);
  outline: none;
}

.media-filters--embedded .media-filters__search-shell:focus-within .media-filters__search-icon {
  border-color: var(--color-accent);
}

.media-filters--embedded .media-filters__search-shell:focus-within .media-filters__search-icon::after {
  border-color: var(--color-accent);
}

.media-filters__apply, .media-filters__reset { min-height: 36px; padding: 0 13px; border-radius: 6px; font: inherit; font-size: 0.76rem; font-weight: 800; cursor: pointer; transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease; }
.media-filters__apply { border: 1px solid rgba(var(--color-accent-rgb), 0.7); background: rgba(var(--color-accent-rgb), 0.18); color: var(--color-accent); }
.media-filters__apply:hover, .media-filters__apply:focus-visible { border-color: var(--color-accent); background: rgba(var(--color-accent-rgb), 0.28); outline: none; }
.media-filters__reset { border: 1px solid transparent; background: transparent; color: var(--color-muted); }
.media-filters__reset:hover, .media-filters__reset:focus-visible { border-color: var(--color-line); background: rgba(var(--color-panel-rgb), 0.72); color: var(--color-text); outline: none; }

@media (max-width: 1180px) {
  .media-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .media-filters__actions {
    grid-column: 1 / -1;
  }
}

@media (max-width: 640px) {
  .media-filters {
    grid-template-columns: 1fr;
  }

  .media-filters__actions {
    flex-wrap: wrap;
  }
}
</style>
