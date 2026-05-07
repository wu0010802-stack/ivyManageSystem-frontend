<template>
  <div class="source-card" :class="statusClass">
    <h4>{{ sourceLabel }}</h4>
    <p class="last-fetched">最後拉取：{{ lastFetched || '尚未拉取' }}</p>
    <p v-if="httpStatus" class="http-status">HTTP {{ httpStatus }}</p>
    <p v-if="error" class="error" :title="error">錯誤：{{ truncatedError }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  source: { type: String, required: true },
  lastFetchedAt: { type: String, default: null },
  httpStatus: { type: Number, default: null },
  error: { type: String, default: null },
})

const labelMap = {
  mol_labor_brackets: '勞保金額分級表',
  mol_labor_premium: '勞保保險費分擔表',
  mol_pension: '勞退月提繳工資分級',
  nhi_brackets: '健保投保金額分級表',
  nhi_premium: '健保保險費負擔金額表',
  mol_minimum_wage: '基本工資調整經過',
}

const sourceLabel = computed(() => labelMap[props.source] || props.source)
const lastFetched = computed(() =>
  props.lastFetchedAt ? new Date(props.lastFetchedAt).toLocaleString('zh-TW') : null
)
const statusClass = computed(() => {
  if (props.error || (props.httpStatus && props.httpStatus !== 200)) return 'status-error'
  if (props.httpStatus === 200) return 'status-ok'
  return 'status-pending'
})
const truncatedError = computed(() =>
  props.error ? props.error.slice(0, 80) + (props.error.length > 80 ? '…' : '') : ''
)
</script>

<style scoped>
.source-card {
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 12px;
  background: #fff;
}
.status-ok { border-color: #4caf50; }
.status-error { border-color: #d32f2f; background: #fff8f8; }
.error { color: #d32f2f; font-size: 12px; word-break: break-all; }
.last-fetched { color: #555; font-size: 13px; }
.http-status { font-size: 12px; color: #666; }
</style>
