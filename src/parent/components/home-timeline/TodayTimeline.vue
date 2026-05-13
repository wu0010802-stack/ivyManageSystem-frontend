<script setup>
import TodayTimelineItem from './TodayTimelineItem.vue'

defineProps({
  events: { type: Array, default: () => [] },
})

const emit = defineEmits(['navigate'])
</script>

<template>
  <ol v-if="events.length" class="timeline pt-stagger" aria-label="今日動態">
    <TodayTimelineItem
      v-for="(e, i) in events"
      :key="e.id"
      :event="e"
      :is-first="i === 0"
      :is-last="i === events.length - 1"
      @navigate="(p) => emit('navigate', p)"
    />
  </ol>
  <p v-else class="timeline-empty">今天目前沒有需要處理的事項</p>
</template>

<style scoped>
.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  position: relative;
}
.timeline-empty {
  padding: var(--space-12, 48px) var(--space-4, 16px);
  text-align: center;
  color: var(--pt-text-placeholder);
  font-size: var(--text-sm, 13px);
  font-weight: 500;
  margin: 0;
}
</style>
