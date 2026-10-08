<script setup lang="ts">
import { computed } from 'vue'
import M3Card from './m3/M3Card.vue'

const props = withDefaults(defineProps<{
  label: string
  value: string | number
  sub?: string
  icon?: string
  tone?: 'brand' | 'amber' | 'coral' | 'sky' | 'leaf' | 'neutral'
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
        <span v-if="icon" class="stat-tile-icon-wrap">
          <span class="stat-tile-icon material-symbols-rounded" aria-hidden="true">{{ icon }}</span>
        </span>
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
.stat-tile-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 10px;
  background: var(--pt-icon-chip-bg, rgba(255, 255, 255, 0.55));
}
.stat-tile-icon { font-size: 17px; color: var(--pt-text-faint, #94a3b8); }
.stat-tile-value { font-size: 19px; font-weight: 800; color: var(--pt-text-strong, #0f172a); margin-top: 4px; line-height: 1.2; }
.stat-tile-sub { font-size: var(--text-xs, 11px); color: var(--pt-text-faint, #94a3b8); margin-top: 3px; }

/* 童彩 tonal 配對：透過覆寫 M3Card 消費的 --m3-surface-container-low 換底色，
   不直接對子元件寫 CSS specificity 戰爭（同一 DOM 節點上自訂屬性層疊即生效）。 */
.tone-amber { --m3-surface-container-low: var(--pt-accent-sun-container); }
.tone-coral { --m3-surface-container-low: var(--pt-accent-coral-container); }
.tone-sky   { --m3-surface-container-low: var(--pt-accent-sky-container); }
.tone-leaf  { --m3-surface-container-low: var(--pt-accent-leaf-container); }
.tone-brand { --m3-surface-container-low: var(--m3-primary-container); }

.tone-amber .stat-tile-value, .tone-amber .stat-tile-icon { color: var(--pt-accent-sun-on); }
.tone-coral .stat-tile-value, .tone-coral .stat-tile-icon { color: var(--pt-accent-coral-on); }
.tone-sky .stat-tile-value, .tone-sky .stat-tile-icon { color: var(--pt-accent-sky-on); }
.tone-leaf .stat-tile-value, .tone-leaf .stat-tile-icon { color: var(--pt-accent-leaf-on); }
.tone-brand .stat-tile-value, .tone-brand .stat-tile-icon { color: var(--m3-on-primary-container); }
</style>
