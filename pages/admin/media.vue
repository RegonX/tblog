<script setup lang="ts">
import MediaLibraryView from '~/components/admin/MediaLibraryView.vue'

definePageMeta({ layout: 'admin', middleware: 'admin' })
</script>

<template>
  <MediaLibraryView />
</template>
