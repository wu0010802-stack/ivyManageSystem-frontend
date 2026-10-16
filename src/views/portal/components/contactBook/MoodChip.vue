<script setup lang="ts">
/**
 * 聯絡簿心情色塊（教師端）。取代原本的 emoji 臉譜：文字直接可讀，不靠平台 emoji 字型，
 * 色系只是輔助（AA：每個 tone 的 fg 都是深色文字疊淺色底）。
 * 未知／空值一律渲染中性「未記錄」，不丟例外。
 */
import { computed } from 'vue'
import { MOOD_META, type MoodKey } from './moods'

const props = withDefaults(
  defineProps<{
    mood?: string | null
    size?: 'sm' | 'md'
  }>(),
  { mood: null, size: 'sm' },
)

const meta = computed(() => (props.mood ? MOOD_META[props.mood as MoodKey] ?? null : null))
</script>

<template>
  <span
    class="mood-chip"
    :class="[`is-${size}`, meta ? `tone-${meta.tone}` : 'tone-empty']"
    data-test="mood-chip"
  >
    {{ meta ? meta.label : '未記錄' }}
  </span>
</template>

<style scoped>
.mood-chip {
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-full);
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}
.is-sm {
  padding: 4px 10px;
  font-size: var(--text-xs);
}
.is-md {
  padding: 6px 12px;
  font-size: var(--text-sm);
}

.tone-sun     { background: var(--color-tint-announcement); color: var(--color-tint-announcement-fg); }
.tone-neutral { background: var(--bg-color-soft); color: var(--pt-text-muted); }
.tone-grape   { background: var(--color-tint-medication); color: var(--color-tint-medication-fg); }
.tone-sky     { background: var(--color-tint-message); color: var(--color-tint-message-fg); }
.tone-rose    { background: var(--color-tint-activity); color: var(--color-tint-activity-fg); }
.tone-empty   { background: transparent; color: var(--pt-text-faint); font-weight: 500; }
</style>
