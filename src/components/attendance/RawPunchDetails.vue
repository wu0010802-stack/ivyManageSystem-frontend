<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ importMetadata: unknown }>()
const details = computed(() => {
  const value = props.importMetadata
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  if (data.import_format !== 'punch_events' || !Array.isArray(data.punches)) return null
  return {
    device: typeof data.device_id === 'string' ? data.device_id : '',
    number: typeof data.source_employee_number === 'string' ? data.source_employee_number : '',
    rows: Array.isArray(data.source_rows) ? data.source_rows.filter(row => typeof row === 'number').join('、') : '',
    punches: data.punches.filter((punch): punch is string => typeof punch === 'string'),
    confirmed: data.review_confirmed === true,
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
</template>

<style scoped>
.raw-punch-details { flex-basis: 100%; font-size: var(--text-sm, 0.875rem); }
.raw-punch-details p { margin-block: 6px; }
</style>
