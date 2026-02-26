<template>
  <div class="table-skeleton">
    <div class="table-skeleton__header">
      <div v-for="i in columns" :key="'h'+i" class="skeleton-cell skeleton-pulse" :style="{ width: getCellWidth(i) }" />
    </div>
    <div v-for="r in rows" :key="'r'+r" class="table-skeleton__row">
      <div v-for="i in columns" :key="'c'+i" class="skeleton-cell skeleton-pulse" :style="{ width: getCellWidth(i), animationDelay: `${r * 0.1}s` }" />
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  columns: { type: Number, default: 5 },
  rows: { type: Number, default: 5 }
})

const getCellWidth = (index) => {
  // First column narrower (ID), last wider (actions)
  if (index === 1) return '60px'
  if (index === props.columns) return '120px'
  return `${100 / (props.columns - 2)}%`
}
</script>

<style scoped>
.table-skeleton {
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.table-skeleton__header {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background-color: var(--bg-color);
}

.table-skeleton__row {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-color-light);
}

.skeleton-cell {
  height: 20px;
  min-width: 40px;
  flex-shrink: 0;
}

.table-skeleton__header .skeleton-cell {
  height: 16px;
  opacity: 0.7;
}
</style>
