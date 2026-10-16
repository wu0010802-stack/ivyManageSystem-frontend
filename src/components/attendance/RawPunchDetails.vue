<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ importMetadata: unknown }>()
const data = computed(() => {
  const value = props.importMetadata
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
})
const details = computed(() => {
  if (!data.value || data.value.import_format !== 'punch_events' || !Array.isArray(data.value.punches)) return null
  return {
    device: typeof data.value.device_id === 'string' ? data.value.device_id : '',
    number: typeof data.value.source_employee_number === 'string' ? data.value.source_employee_number : '',
    rows: Array.isArray(data.value.source_rows) ? data.value.source_rows.filter(row => typeof row === 'number').join('、') : '',
    punches: data.value.punches.filter((punch): punch is string => typeof punch === 'string'),
    confirmed: data.value.review_confirmed === true,
  }
})
const clockReport = computed(() => {
  if (!data.value || data.value.import_format !== 'clock_report' || !Array.isArray(data.value.source_tokens)) return null
  return {
    device: typeof data.value.device_id === 'string' ? data.value.device_id : '',
    number: typeof data.value.source_employee_number === 'string' ? data.value.source_employee_number : '',
    tokens: data.value.source_tokens.filter((token): token is string => typeof token === 'string'),
    estimated: typeof data.value.block_id === 'string' && data.value.block_id !== '',
    confirmed: data.value.review_confirmed === true,
  }
})
</script>

<template>
  <details v-if="details" class="raw-punch-details">
    <summary>查看原始刷卡</summary>
    <p>設備 {{ details.device }} · 差勤號碼 {{ details.number }} · 來源列 {{ details.rows }}</p>
    <ul><li v-for="(punch, index) in details.punches" :key="index">{{ punch.replace('T', ' ') }}</li></ul>
    <p v-if="details.confirmed">已人工核對</p>
  </details>
  <details v-else-if="clockReport" class="raw-punch-details">
    <summary>查看打卡鐘報表原文</summary>
    <p>設備 {{ clockReport.device }} · 卡號 {{ clockReport.number }}</p>
    <ul><li v-for="(token, index) in clockReport.tokens" :key="index">{{ token }}</li></ul>
    <p v-if="clockReport.estimated">此日由推估區塊匯入，已人工確認對應日期</p>
    <p v-if="clockReport.confirmed">已人工核對</p>
  </details>
</template>

<style scoped>
.raw-punch-details { flex-basis: 100%; font-size: var(--text-sm, 0.875rem); }
.raw-punch-details p { margin-block: 6px; }
</style>
