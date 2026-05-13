<script setup>
import TodayTimelineItem from './TodayTimelineItem.vue'

defineProps({
  buckets: { type: Array, default: () => [] },
})

const emit = defineEmits(['navigate'])
</script>

<template>
  <div v-if="buckets.length" class="timeline pt-stagger" aria-label="今日動態">
    <section
      v-for="b in buckets"
      :key="b.key"
      class="bucket"
      :aria-label="b.label"
    >
      <header class="bucket-head">
        <span class="bucket-rail" aria-hidden="true">
          <span class="bucket-tick"></span>
        </span>
        <h2 class="bucket-label">{{ b.label }}</h2>
      </header>
      <ol class="bucket-items">
        <TodayTimelineItem
          v-for="(e, i) in b.items"
          :key="e.id"
          :event="e"
          :is-first="i === 0"
          :is-last="i === b.items.length - 1"
          @navigate="(p) => emit('navigate', p)"
        />
      </ol>
    </section>
  </div>
  <p v-else class="timeline-empty">今天目前沒有需要處理的事項</p>
</template>

<style scoped>
.timeline {
  position: relative;
}
.bucket + .bucket {
  margin-top: var(--space-5, 20px);
}

.bucket-head {
  display: grid;
  grid-template-columns: 56px 1fr;
  align-items: center;
  min-height: 28px;
  margin-bottom: var(--space-1, 4px);
}
.bucket-rail {
  display: flex;
  align-items: center;
  justify-content: center;
}
.bucket-tick {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--pt-text-disabled);
}
.bucket-label {
  margin: 0;
  font-size: var(--text-xs, 12px);
  font-weight: 800;
  letter-spacing: 0.16em;
  color: var(--pt-text-faint);
}

.bucket-items {
  list-style: none;
  margin: 0;
  padding: 0;
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
