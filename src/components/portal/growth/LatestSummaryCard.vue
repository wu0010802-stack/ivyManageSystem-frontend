<script setup>
import { computed } from 'vue'
import { gradeStyle, cycleLabel } from '@/composables/usePortalAppraisal'

const props = defineProps({
  item: { type: Object, required: true },
  delta: { type: Number, default: null },
})

const style = computed(() => gradeStyle(props.item.grade))
const label = computed(() =>
  cycleLabel(props.item.academic_year, props.item.semester),
)

const deltaText = computed(() => {
  if (props.delta === null) return '無上期可比較'
  const sign = props.delta > 0 ? '▲ +' : props.delta < 0 ? '▼ ' : '◆ '
  return `比上期 ${sign}${props.delta}`
})
const deltaClass = computed(() => {
  if (props.delta === null) return 'delta-none'
  return props.delta > 0
    ? 'delta-up'
    : props.delta < 0
      ? 'delta-down'
      : 'delta-flat'
})
</script>

<template>
  <section class="latest-card">
    <header>
      <span class="cycle">{{ label }}</span>
      <span class="status">最新一期</span>
    </header>
    <div class="score-row">
      <div class="score">{{ item.total_score }}</div>
      <div class="grade-chip" :class="style.className">{{ style.label }}等</div>
    </div>
    <div class="meta">
      <span class="bonus">獎金 ${{ Number(item.bonus_amount).toLocaleString() }}</span>
      <span class="delta" :class="deltaClass">{{ deltaText }}</span>
    </div>
  </section>
</template>

<style scoped>
.latest-card {
  background: var(--surface-card, #fff);
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-4, 16px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.06));
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}
header {
  display: flex;
  justify-content: space-between;
  color: var(--pt-text-muted, #6b7280);
  font-size: var(--text-sm, 13px);
}
.score-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-3, 12px);
}
.score {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--pt-text-strong, #111);
}
.grade-chip {
  padding: 4px 12px;
  border-radius: 999px;
  font-weight: 600;
  color: #fff;
}
.grade-outstanding { background: #1e7e34; }
.grade-good { background: #2563eb; }
.grade-pass { background: #a16207; }
.grade-warn { background: #c2410c; }
.grade-fail { background: #b91c1c; }
.grade-unknown { background: #6b7280; }
.meta {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-sm, 13px);
}
.bonus { color: var(--pt-text-muted, #6b7280); }
.delta-up { color: #1e7e34; font-weight: 600; }
.delta-down { color: #b91c1c; font-weight: 600; }
.delta-flat, .delta-none { color: var(--pt-text-muted, #6b7280); }
</style>
