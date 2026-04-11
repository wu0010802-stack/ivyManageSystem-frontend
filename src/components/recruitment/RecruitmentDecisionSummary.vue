<template>
  <div class="decision-summary">
    <div class="decision-summary-header">
      <div>
        <div class="decision-title">主管決策摘要</div>
        <div class="decision-subtitle">參考月份：{{ referenceMonth || '尚未指定' }}</div>
      </div>
      <el-tag type="info" effect="plain">
        月比預繳率 {{ formatDelta(monthOverMonth?.visit_to_deposit_rate?.delta) }}
      </el-tag>
    </div>

    <div class="decision-grid">
      <el-card
        v-for="item in cards"
        :key="item.key"
        class="decision-card"
        shadow="hover"
      >
        <div class="decision-card-label">{{ item.label }}</div>
        <div class="decision-card-value">{{ item.snapshot.visit ?? 0 }}</div>
        <div class="decision-card-meta">
          <span>預繳 {{ item.snapshot.deposit ?? 0 }}</span>
          <span>註冊 {{ item.snapshot.enrolled ?? 0 }}</span>
        </div>
        <div class="decision-card-rate">
          <span>參觀→預繳 {{ fmtRate(item.snapshot.visit_to_deposit_rate) }}</span>
          <span>參觀→註冊 {{ fmtRate(item.snapshot.visit_to_enrolled_rate) }}</span>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  summary: { type: Object, required: true },
  referenceMonth: { type: String, default: null },
  monthOverMonth: { type: Object, default: () => ({}) },
  fmtRate: { type: Function, required: true },
})

const cards = computed(() => ([
  { key: 'current_month', label: '本月', snapshot: props.summary?.current_month || {} },
  { key: 'rolling_30d', label: '近 30 天', snapshot: props.summary?.rolling_30d || {} },
  { key: 'rolling_90d', label: '近 90 天', snapshot: props.summary?.rolling_90d || {} },
  { key: 'ytd', label: '年度累計', snapshot: props.summary?.ytd || {} },
]))

const formatDelta = (value) => {
  const num = Number(value || 0)
  const sign = num > 0 ? '+' : ''
  return `${sign}${num.toFixed(1)}pt`
}
</script>

<style scoped>
.decision-summary {
  margin-bottom: 16px;
}

.decision-summary-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.decision-title {
  font-size: 1rem;
  font-weight: 700;
  color: #1f2937;
}

.decision-subtitle {
  font-size: 0.85rem;
  color: #6b7280;
}

.decision-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: 12px;
}

.decision-card-label {
  font-size: 0.78rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.decision-card-value {
  font-size: 1.9rem;
  font-weight: 700;
  color: #14532d;
  margin-top: 4px;
}

.decision-card-meta,
.decision-card-rate {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 0.85rem;
  color: #4b5563;
  margin-top: 8px;
}
</style>
