<script setup>
import MilestoneReactionBar from './MilestoneReactionBar.vue'

defineProps({
  milestone: { type: Object, required: true },
})
const emit = defineEmits(['react'])
</script>

<template>
  <div class="milestone-card">
    <div class="icon">{{ milestone.icon || '✨' }}</div>
    <div class="title">{{ milestone.title }}</div>
    <div class="date">{{ milestone.achieved_on || milestone.occurred_at }}</div>
    <div v-if="milestone.summary || milestone.description" class="desc">
      {{ milestone.summary || milestone.description }}
    </div>
    <MilestoneReactionBar
      :current="milestone.parent_reaction"
      @select="(reaction) => emit('react', reaction)"
    />
  </div>
</template>

<style scoped>
.milestone-card {
  min-width: 180px;
  max-width: 220px;
  padding: 16px;
  background: var(--m3-tertiary-container, linear-gradient(135deg, #fff6e8, #fef3c7));
  border-radius: 16px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.icon { font-size: 32px; }
.title { font-weight: 700; font-size: 15px; color: var(--m3-primary, #0d9053); }
.date { font-size: 12px; color: var(--m3-on-surface-variant, #6b7280); }
.desc { font-size: 13px; color: var(--m3-on-surface, #374151); }
</style>
