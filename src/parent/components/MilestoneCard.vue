<script setup>
defineProps({
  milestone: { type: Object, required: true },
})
</script>

<template>
  <div class="milestone-card">
    <div class="icon">{{ milestone.icon || '✨' }}</div>
    <div class="title">{{ milestone.title }}</div>
    <div class="date">{{ milestone.occurred_at || milestone.achieved_on }}</div>
    <div v-if="milestone.summary || milestone.description" class="desc">
      {{ milestone.summary || milestone.description }}
    </div>
  </div>
</template>

<style scoped>
.milestone-card {
  min-width: 160px;
  max-width: 200px;
  padding: 16px;
  background: linear-gradient(135deg, #fff6e8, #fef3c7);
  border-radius: 12px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.icon { font-size: 32px; }
.title { font-weight: 700; font-size: 15px; color: #0d9053; }
.date { font-size: 12px; color: #6b7280; }
.desc { font-size: 13px; color: #374151; }
</style>
