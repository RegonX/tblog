<script setup lang="ts">
import { useTblogI18n } from '~/composables/useTblogI18n'
import type { AdminMediaStatsView } from '~/composables/useAdminApi'
import { formatMediaSize } from '~/utils/media'

interface Props {
  stats: AdminMediaStatsView
  inline?: boolean
}

const props = defineProps<Props>()
const { t } = useTblogI18n()
</script>

<template>
  <dl class="media-stats" :class="{ 'media-stats--inline': props.inline }" data-test="media-stats">
    <div class="media-stats__item">
      <dt>{{ t('media.statsCount') }}</dt>
      <dd data-test="media-stats-count">{{ props.stats.totalCount }}</dd>
    </div>
    <div class="media-stats__item">
      <dt>{{ t('media.statsSize') }}</dt>
      <dd data-test="media-stats-size">{{ formatMediaSize(props.stats.totalBytes) }}</dd>
    </div>
    <div class="media-stats__item media-stats__item--provider">
      <dt>{{ t('media.statsProvider') }}</dt>
      <dd data-test="media-stats-provider">{{ props.stats.activeProviderKey ?? t('settings.noneConfigured') }}</dd>
    </div>
    <p v-if="props.stats.unknownSizeCount > 0" class="admin-muted media-stats__note">
      {{ t('media.statsUnknownSize', { count: props.stats.unknownSizeCount }) }}
    </p>
  </dl>
</template>

<style scoped>
.media-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  margin: 0;
  border: 1px solid rgba(var(--color-accent-rgb), 0.16);
  border-radius: 14px;
  background: rgba(var(--color-accent-rgb), 0.13);
  box-shadow: 0 16px 36px rgba(var(--color-text-rgb), 0.07);
}

.media-stats__item {
  min-width: 0;
  padding: 15px 16px;
  background:
    linear-gradient(180deg, rgba(var(--color-panel-rgb), 0.92), rgba(var(--color-panel-rgb), 0.74)),
    var(--color-panel);
}

.media-stats__item dt {
  overflow: hidden;
  color: var(--color-muted);
  font-size: 0.7rem;
  font-weight: 800;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.media-stats__item dd {
  overflow: hidden;
  margin: 4px 0 0;
  color: var(--color-text);
  font-size: 1.1rem;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-stats__item--provider dd {
  font-size: 0.92rem;
}

.media-stats__note {
  grid-column: 1 / -1;
  margin: 0;
  padding: 10px 16px;
  background: rgba(var(--color-panel-rgb), 0.72);
}

.media-stats--inline {
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.media-stats--inline .media-stats__item {
  padding: 5px 16px;
  background: transparent;
}

.media-stats--inline .media-stats__item + .media-stats__item {
  border-inline-start: 1px solid var(--color-line);
}

.media-stats--inline .media-stats__note {
  padding: 5px 16px;
  background: transparent;
}

@media (max-width: 720px) {
  .media-stats {
    grid-template-columns: 1fr;
  }
}
</style>
