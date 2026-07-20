<script setup lang="ts">
defineProps<{
  item: Record<string, unknown>
}>()
</script>

<template>
  <div class="timeline-item" :class="{ highlight: item.is_highlight }">
    <div class="icon">{{ item.icon }}</div>
    <div class="body">
      <div class="row-top">
        <span class="title">{{ item.title }}</span>
        <span v-if="item.is_highlight" class="badge">亮點</span>
        <span class="date">{{ item.occurred_at }}</span>
      </div>
      <div v-if="item.summary" class="summary">{{ item.summary }}</div>
    </div>
  </div>
</template>

<style scoped>
.timeline-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-left: 3px solid var(--el-border-color);
  background: var(--el-fill-color-blank);
  border-radius: 4px;
}
.timeline-item.highlight { border-left-color: var(--el-color-warning); }
.icon { font-size: 24px; }
.body { flex: 1; }
.row-top { display: flex; gap: 8px; align-items: baseline; margin-bottom: 4px; }
.title { font-weight: 600; }
.badge {
  font-size: 12px;
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
  padding: 0 6px;
  border-radius: 4px;
}
.date {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.summary { font-size: 14px; color: var(--el-text-color-regular); }
</style>
