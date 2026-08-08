<script setup lang="ts">
import { computed } from 'vue'

interface TagOption {
  id: string
  name: string
}

interface Props {
  modelValue: string[]
  tags: TagOption[]
  emptyLabel: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const selectedTags = computed(() => props.tags.filter((tag) => props.modelValue.includes(tag.id)))

function toggleTag(tagId: string, checked: boolean) {
  const selected = new Set(props.modelValue)
  if (checked) {
    selected.add(tagId)
  } else {
    selected.delete(tagId)
  }
  emit('update:modelValue', Array.from(selected))
}
</script>

<template>
  <details class="post-tag-select">
    <summary class="post-tag-select__summary" data-test="metadata-tag-select">
      <span v-if="selectedTags.length" class="post-tag-select__values">
        <span v-for="tag in selectedTags" :key="tag.id" class="post-tag-select__value">{{ tag.name }}</span>
      </span>
      <span v-else class="post-tag-select__placeholder">{{ emptyLabel }}</span>
      <span class="post-tag-select__indicator" aria-hidden="true"></span>
    </summary>

    <div class="post-tag-select__options">
      <label v-for="tag in tags" :key="tag.id" class="post-tag-select__option">
        <input
          type="checkbox"
          :data-test="`metadata-tag-${tag.id}`"
          :checked="modelValue.includes(tag.id)"
          @change="toggleTag(tag.id, ($event.target as HTMLInputElement).checked)"
        >
        <span>{{ tag.name }}</span>
      </label>
    </div>
  </details>
</template>
