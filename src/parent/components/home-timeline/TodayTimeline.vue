<script setup lang="ts">
import TodayTimelineItem from './TodayTimelineItem.vue'

interface TimelineEvent {
  id: number | string
  [key: string]: unknown
}

interface TimelineBucket {
  key: string
  label: string
  items: TimelineEvent[]
}

withDefaults(defineProps<{
  buckets?: TimelineBucket[]
}>(), {
  buckets: () => [],
})

const emit = defineEmits<{
  'navigate': [path: string]
}>()
</script>

<template>
  <div v-if="buckets.length" class="timeline" aria-label="今日動態">
    <section
      v-for="b in buckets"
      :key="b.key"
      class="bucket"
      :aria-label="b.label"
    >
      <header class="bucket-head">
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
  background: var(--pt-surface-card, #fff);
  border-radius: var(--pt-card-radius, 26px);
  box-shadow: var(--pt-shadow-card);
  padding: 4px 12px;
}
.bucket + .bucket {
  margin-top: var(--space-4, 16px);
}

.bucket-head {
  display: flex;
  align-items: center;
  min-height: 28px;
  margin-bottom: var(--space-1, 4px);
  padding: 0 4px;
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
