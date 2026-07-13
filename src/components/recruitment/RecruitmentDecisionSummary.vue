<template>
  <div class="decision-summary">
    <div class="decision-summary-header">
      <div>
        <div class="decision-title">主管決策摘要</div>
        <div class="decision-subtitle">參考月份：{{ referenceMonth || '尚未指定' }}</div>
      </div>
      <div class="mom-badge" :class="momClass">
        <span class="mom-arrow" aria-hidden="true">{{ momArrow }}</span>
        月比預繳率 {{ formatDelta(momDelta) }}
      </div>
    </div>

    <div class="decision-grid">
      <div
        v-for="item in cards"
        :key="item.key"
        class="decision-card"
        :class="`decision-card--${item.key}`"
      >
        <div class="dc-label">{{ item.label }}</div>

        <div class="dc-main">
          <span class="dc-value">{{ item.snapshot.visit ?? 0 }}</span>
          <span class="dc-unit">人次</span>
        </div>

        <div class="dc-rates">
          <div class="dc-rate-item">
            <span class="dc-rate-label">預繳率</span>
            <span class="dc-rate-value" :class="rateClass(item.snapshot)">
              {{ rateText(item.snapshot, 'visit_to_deposit_rate') }}
            </span>
          </div>
          <div class="dc-rate-item">
            <span class="dc-rate-label">註冊率</span>
            <span class="dc-rate-value" :class="rateClass(item.snapshot, 'visit_to_enrolled_rate')">
              {{ rateText(item.snapshot, 'visit_to_enrolled_rate') }}
            </span>
          </div>
        </div>

        <div class="dc-sub">
          <span>預繳 <strong>{{ item.snapshot.deposit ?? 0 }}</strong></span>
          <span class="dc-sub-sep">·</span>
          <span>註冊 <strong>{{ item.snapshot.enrolled ?? 0 }}</strong></span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  summary: Record<string, unknown>
  referenceMonth?: string | null
  monthOverMonth?: Record<string, unknown>
  fmtRate: (...args: unknown[]) => unknown
}>(), {
  referenceMonth: null,
  monthOverMonth: () => ({}),
})

const cards = computed(() => ([
  { key: 'current_month', label: '本月',    snapshot: (props.summary?.current_month as Record<string, unknown>) || {} },
  { key: 'rolling_30d',   label: '近 30 天', snapshot: (props.summary?.rolling_30d as Record<string, unknown>)   || {} },
  { key: 'rolling_90d',   label: '近 90 天', snapshot: (props.summary?.rolling_90d as Record<string, unknown>)   || {} },
  { key: 'ytd',           label: '年度累計', snapshot: (props.summary?.ytd as Record<string, unknown>)            || {} },
]))

const formatDelta = (value: unknown) => {
  const num = Number(value || 0)
  const sign = num > 0 ? '+' : ''
  return `${sign}${num.toFixed(1)}pt`
}

const momOverMonth = props.monthOverMonth as { visit_to_deposit_rate?: { delta?: number } }
const momDelta   = computed(() => Number((momOverMonth?.visit_to_deposit_rate?.delta) || 0))
const momArrow   = computed(() => momDelta.value > 0 ? '▲' : momDelta.value < 0 ? '▼' : '–')
const momClass   = computed(() => momDelta.value > 0 ? 'mom-badge--up' : momDelta.value < 0 ? 'mom-badge--down' : '')

const hasVolume = (snapshot: Record<string, unknown>) => Number(snapshot.visit || 0) > 0

/** 沒有參觀人次（分母為零）時比率無意義，顯示「—」避免假警訊的紅色 0% */
const rateText = (snapshot: Record<string, unknown>, key: string) =>
  hasVolume(snapshot) ? props.fmtRate(snapshot[key]) : '—'

const rateClass = (snapshot: Record<string, unknown>, key = 'visit_to_deposit_rate') => {
  if (!hasVolume(snapshot)) return 'dc-rate-value--none'
  const n = Number(snapshot[key] || 0)
  if (n >= 60) return 'dc-rate-value--high'
  if (n >= 30) return 'dc-rate-value--mid'
  return 'dc-rate-value--low'
}
</script>

<style scoped>
.decision-summary {
  margin-bottom: 20px;
}

/* ── Header ── */
.decision-summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.decision-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-primary);
}

.decision-subtitle {
  font-size: 0.78rem;
  color: var(--text-secondary);
  margin-top: 2px;
}

/* ── MoM Badge ── */
.mom-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  background: var(--bg-color-soft);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}
.mom-badge--up   { background: var(--color-success-soft); color: var(--color-success-darker); border-color: var(--color-success-soft); }
.mom-badge--down { background: var(--color-danger-soft); color: var(--color-danger-darker); border-color: var(--color-danger-soft); }
.mom-arrow { font-size: 0.7rem; }

/* ── Grid ── */
.decision-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  gap: 12px;
}

/* ── Card：中性髮絲線卡，期間由 label 區分，不用裝飾色條 ── */
.decision-card {
  background: var(--neutral-0);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px 16px 14px;
  transition: border-color 0.18s ease;
  cursor: default;
}

.decision-card:hover {
  border-color: var(--neutral-300);
}

/* ── Label ── */
.dc-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 8px;
}

/* ── Main value ── */
.dc-main {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 10px;
}

.dc-value {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 2.1rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.dc-unit {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  padding-bottom: 2px;
}

/* ── Rates ── */
.dc-rates {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.dc-rate-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.dc-rate-label {
  font-size: 0.68rem;
  color: var(--text-tertiary);
}

.dc-rate-value {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 0.9rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.dc-rate-value--high { color: var(--color-success-darker); }
.dc-rate-value--mid  { color: var(--color-warning-hover); }
.dc-rate-value--low  { color: var(--color-danger-hover); }
.dc-rate-value--none { color: var(--text-tertiary); font-weight: 500; }

/* ── Sub row ── */
.dc-sub {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  color: var(--text-secondary);
}
.dc-sub strong {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.dc-sub-sep {
  color: var(--neutral-300);
}
</style>
