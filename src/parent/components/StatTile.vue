<script setup lang="ts">
import { computed } from 'vue'
import M3Card from './m3/M3Card.vue'

const props = withDefaults(defineProps<{
  label: string
  value: string | number
  sub?: string
  icon?: string
  tone?: 'brand' | 'amber' | 'coral' | 'sky' | 'neutral'
  to?: string
}>(), {
  tone: 'neutral',
})

const ariaLabel = computed(() => `${props.label} ${props.value}`)
</script>

<template>
  <component
    :is="to ? 'router-link' : 'div'"
    :to="to"
    :aria-label="to ? ariaLabel : undefined"
    class="stat-tile-wrap"
  >
    <M3Card variant="elevated" :clickable="!!to" padding="12px" class="stat-tile" :class="`tone-${tone}`">
      <div class="stat-tile-head">
        <span class="stat-tile-label">{{ label }}</span>
        <span v-if="icon" class="stat-tile-icon material-symbols-rounded" aria-hidden="true">{{ icon }}</span>
      </div>
      <div class="stat-tile-value">{{ value }}</div>
      <div v-if="sub" class="stat-tile-sub">{{ sub }}</div>
    </M3Card>
  </component>
</template>

<style scoped>
.stat-tile-wrap { display: block; text-decoration: none; color: inherit; }
.stat-tile-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.stat-tile-label { font-size: var(--text-xs, 11px); font-weight: 600; color: var(--pt-text-soft, #64748b); }
.stat-tile-icon { font-size: 18px; color: var(--pt-text-faint, #94a3b8); }
.stat-tile-value { font-size: 19px; font-weight: 800; color: var(--pt-text-strong, #0f172a); margin-top: 4px; line-height: 1.2; }
.stat-tile-sub { font-size: var(--text-xs, 11px); color: var(--pt-text-faint, #94a3b8); margin-top: 3px; }
.tone-amber .stat-tile-value { color: var(--pt-warning-text, #c2740a); }
.tone-coral .stat-tile-value { color: var(--coral-700, #b14545); }
.tone-brand .stat-tile-value { color: var(--brand-primary, #0d9053); }
.tone-sky .stat-tile-value { color: var(--pt-info-text, #2d6f8e); }
</style>
