<script setup lang="ts">
interface Category {
  id: number | string
  label: string
  icon: string
  color: string
}

defineProps<{
  category: Category
}>()
defineEmits<{
  'click': [category: Category]
}>()
</script>

<template>
  <button
    class="chip"
    :style="{ '--chip-color': category.color }"
    @click="$emit('click', category)"
  >
    <span class="material-symbols-rounded">{{ category.icon }}</span>
    <span>{{ category.label }}</span>
  </button>
</template>

<style scoped>
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px;
  border: 1.5px solid var(--chip-color);
  border-radius: 999px;
  background: #fff;
  color: var(--chip-color);
  font-size: 14px; font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.chip:active { background: color-mix(in oklab, var(--chip-color) 10%, #fff); }
.material-symbols-rounded { font-size: 18px; }
</style>
