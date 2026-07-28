<template>
  <div class="funnel-summary-bar">
    <div v-for="item in items" :key="item.stage" class="funnel-summary-item" :style="{ borderColor: item.color }">
      <span class="funnel-summary-label">{{ item.label }}</span>
      <span class="funnel-summary-count">{{ item.count }}</span>
    </div>
    <div class="funnel-conversion-rates">
      <span>{{ depositRate }}% 預繳率</span>
      <span>{{ enrollRate }}% 註冊率</span>
      <span>{{ activeRate }}% 退費率</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FunnelSummaryData } from '@/stores/recruitmentFunnel'

const props = defineProps<{ summary: FunnelSummaryData }>()

const items = computed(() => [
  { stage: 'visited', label: '已訪視', count: props.summary.visited_count, color: '#909399' },
  { stage: 'deposited', label: '已預繳', count: props.summary.deposited_count, color: '#e6a23c' },
  { stage: 'enrolled', label: '已註冊', count: props.summary.enrolled_count, color: '#67c23a' },
  { stage: 'active', label: '退預繳／退註冊', count: props.summary.active_count, color: '#409eff' },
])

function pct(num: number, denom: number): string {
  if (denom === 0) return '0'
  return ((num / denom) * 100).toFixed(1)
}

const depositRate = computed(() => pct(props.summary.deposited_count, props.summary.visited_count))
const enrollRate = computed(() => pct(props.summary.enrolled_count, props.summary.deposited_count))
const activeRate = computed(() => pct(props.summary.active_count, props.summary.enrolled_count))
</script>

<style scoped>
.funnel-summary-bar {
  display: flex;
  gap: 16px;
  padding: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.funnel-summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 16px;
  /* 彩色左條改 1px 全框（design system 禁區 pattern）；
     階段色沿用 :style borderColor，多階段分級視覺通道保留 */
  border: 1px solid;
  border-radius: 4px;
  background: var(--el-fill-color-lighter);
}
.funnel-summary-label {
  font-size: 12px;
  color: #666;
}
.funnel-summary-count {
  font-size: 24px;
  font-weight: 600;
}
.funnel-conversion-rates {
  margin-left: auto;
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: #555;
}
</style>
