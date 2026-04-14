<template>
  <div class="decision-summary">
    <div class="decision-summary-header">
      <div>
        <div class="decision-title">主管決策摘要</div>
        <div class="decision-subtitle">參考月份：{{ referenceMonth || '尚未指定' }}</div>
      </div>
      <div class="mom-badge" :class="momClass">
        <span class="mom-arrow" aria-hidden="true">{{ momArrow }}</span>
        月比預繳率 {{ formatDelta(monthOverMonth?.visit_to_deposit_rate?.delta) }}
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
            <span class="dc-rate-value" :class="rateClass(item.snapshot.visit_to_deposit_rate)">
              {{ fmtRate(item.snapshot.visit_to_deposit_rate) }}
            </span>
          </div>
          <div class="dc-rate-item">
            <span class="dc-rate-label">註冊率</span>
            <span class="dc-rate-value" :class="rateClass(item.snapshot.visit_to_enrolled_rate)">
              {{ fmtRate(item.snapshot.visit_to_enrolled_rate) }}
            </span>
          </div>
        </div>

        <div class="dc-sub">
          <span>預繳 <strong>{{ item.snapshot.deposit ?? 0 }}</strong></span>
          <span class="dc-sub-sep">·</span>
          <span>註冊 <strong>{{ item.snapshot.enrolled ?? 0 }}</strong></span>
        </div>

        <div class="dc-accent-bar" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  summary:        { type: Object,   required: true },
  referenceMonth: { type: String,   default: null },
  monthOverMonth: { type: Object,   default: () => ({}) },
  fmtRate:        { type: Function, required: true },
})

const cards = computed(() => ([
  { key: 'current_month', label: '本月',    snapshot: props.summary?.current_month || {} },
  { key: 'rolling_30d',   label: '近 30 天', snapshot: props.summary?.rolling_30d   || {} },
  { key: 'rolling_90d',   label: '近 90 天', snapshot: props.summary?.rolling_90d   || {} },
  { key: 'ytd',           label: '年度累計', snapshot: props.summary?.ytd            || {} },
]))

const formatDelta = (value) => {
  const num = Number(value || 0)
  const sign = num > 0 ? '+' : ''
  return `${sign}${num.toFixed(1)}pt`
}

const momDelta   = computed(() => Number(props.monthOverMonth?.visit_to_deposit_rate?.delta || 0))
const momArrow   = computed(() => momDelta.value > 0 ? '▲' : momDelta.value < 0 ? '▼' : '–')
const momClass   = computed(() => momDelta.value > 0 ? 'mom-badge--up' : momDelta.value < 0 ? 'mom-badge--down' : '')

const rateClass = (rate) => {
  const n = Number(rate || 0)
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
  color: #1E293B;
}

.decision-subtitle {
  font-size: 0.78rem;
  color: #64748B;
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
  background: #F1F5F9;
  color: #64748B;
  border: 1px solid #E2E8F0;
}
.mom-badge--up   { background: #DCFCE7; color: #15803D; border-color: #BBF7D0; }
.mom-badge--down { background: #FEE2E2; color: #B91C1C; border-color: #FECACA; }
.mom-arrow { font-size: 0.7rem; }

/* ── Grid ── */
.decision-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  gap: 12px;
}

/* ── Card ── */
.decision-card {
  position: relative;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 12px;
  padding: 16px 16px 14px;
  overflow: hidden;
  transition: box-shadow 0.18s ease, transform 0.18s ease;
  cursor: default;
}

.decision-card:hover {
  box-shadow: 0 4px 16px rgba(30, 64, 175, 0.10);
  transform: translateY(-1px);
}

/* accent top bar per period */
.dc-accent-bar {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  border-radius: 12px 12px 0 0;
}
.decision-card--current_month .dc-accent-bar { background: #1E40AF; }
.decision-card--rolling_30d   .dc-accent-bar { background: #3B82F6; }
.decision-card--rolling_90d   .dc-accent-bar { background: #6366F1; }
.decision-card--ytd           .dc-accent-bar { background: #D97706; }

/* ── Label ── */
.dc-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: #94A3B8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 8px;
}
.decision-card--current_month .dc-label { color: #1E40AF; }
.decision-card--ytd           .dc-label { color: #B45309; }

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
  color: #1E3A8A;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.dc-unit {
  font-size: 0.75rem;
  color: #94A3B8;
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
  color: #94A3B8;
}

.dc-rate-value {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 0.9rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.dc-rate-value--high { color: #15803D; }
.dc-rate-value--mid  { color: #D97706; }
.dc-rate-value--low  { color: #DC2626; }

/* ── Sub row ── */
.dc-sub {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  color: #64748B;
}
.dc-sub strong {
  color: #1E293B;
  font-variant-numeric: tabular-nums;
}
.dc-sub-sep {
  color: #CBD5E1;
}
</style>
