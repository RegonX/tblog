<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'
import { fetchAdminMediaStats } from '~/composables/useAdminApi'
import { useTblogI18n } from '~/composables/useTblogI18n'

const { t } = useTblogI18n()

const activeProviderKey = shallowRef<string | null>(null)
const statsLoaded = shallowRef(false)

onMounted(async () => {
  try {
    activeProviderKey.value = (await fetchAdminMediaStats()).data.activeProviderKey
    statsLoaded.value = true
  } catch {
    // Storage readiness is a hint here, not a gate. Leaving it unloaded keeps this panel quiet
    // rather than showing a scary error next to configuration that is still perfectly usable.
    statsLoaded.value = false
  }
})
</script>

<template>
  <div class="settings-form" data-test="settings-media-policy">
    <p class="admin-muted">{{ t('settings.externalUrlsAlwaysAvailable') }}</p>
    <p class="admin-muted">{{ t('settings.mediaIntegrationNotice') }}</p>
    <p class="admin-muted">{{ t('settings.mediaLibraryNotice') }}</p>
    <p v-if="statsLoaded" class="admin-muted" data-test="settings-media-active-storage">
      {{ activeProviderKey
        ? t('settings.mediaActiveStorage', { provider: activeProviderKey })
        : t('settings.mediaNoActiveStorage') }}
    </p>
    <NuxtLink class="settings-media__link" to="/admin/media" data-test="settings-media-library-link">
      {{ t('settings.mediaLibraryLink') }}
    </NuxtLink>
  </div>
</template>

<style scoped>
.settings-media__link {
  align-self: flex-start;
  min-height: 36px;
  padding: 8px 18px;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  color: var(--color-accent);
  font-weight: 700;
}

.settings-media__link:hover {
  border-color: var(--color-accent);
  background: rgba(var(--color-accent-rgb), 0.08);
}
</style>
