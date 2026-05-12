<script setup>
defineProps({ item: { type: Object, required: true } })
</script>

<template>
  <div class="timeline-item">
    <div class="icon">{{ item.icon }}</div>
    <div class="body">
      <div class="row-top">
        <span class="title">{{ item.title }}</span>
        <span v-if="item.is_highlight" class="badge">✨</span>
        <span class="date">{{ item.occurred_at }}</span>
      </div>
      <div v-if="item.summary" class="summary">{{ item.summary }}</div>
    </div>
  </div>
</template>

<style scoped>
.timeline-item {
  display: flex;
  gap: 10px;
  padding: 10px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.icon { font-size: 20px; }
.body { flex: 1; min-width: 0; }
.row-top { display: flex; gap: 6px; align-items: baseline; margin-bottom: 2px; }
.title { font-weight: 600; font-size: 14px; }
.badge { color: #f59e0b; font-size: 12px; }
.date { margin-left: auto; font-size: 11px; color: #9ca3af; flex-shrink: 0; }
.summary { font-size: 13px; color: #4b5563; line-height: 1.4; }
</style>
