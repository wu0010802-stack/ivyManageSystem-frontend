<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { getSignStatusSummary } from '@/api/appraisal'
import { apiError } from '@/utils/error'
import { STATUS_LABEL } from '@/constants/appraisalYearEnd'
import KanbanColumn from './KanbanColumn.vue'

// 由 typed wrapper 推導 schema 形狀（SignStatusSummaryOut，比照 YearEndGridView 的
// GridRow 慣例）。後端 SignStatusSummaryItem **本就沒有 per-item status**（bucket 的
// status 語意上即桶內每筆的 status），但 SummaryCard.primaryAction 與 dropdown「簽核」
// 的 stage 推導（CycleDetailPanel.onKanbanAction）都依賴 summary.status——由前端在
// load() 攤平 buckets 時注入，型別以交集正確表達，不做 as unknown as 蓋錯。
type SignStatusData = Awaited<ReturnType<typeof getSignStatusSummary>>['data']
type BucketOut = SignStatusData['buckets'][number]
type Summary = BucketOut['summaries'][number] & { status: string }
interface Bucket { status: string; summaries: Summary[] }

// ⚠ canWriteCycle 需 withDefaults 給 true：Vue 對未傳的 boolean-only prop 會轉型
// 成顯式 false（而非 undefined），若不在這裡明訂 default，這個顯式 false 會沿著
// 下方 :can-write-cycle="canWriteCycle" 綁定傳給 KanbanColumn，蓋掉 SummaryCard
// 那層 withDefaults(true) 的 fallback（因為子層收到的是「明確 false」而非「未
// 傳」）。整條鏈都要一致預設 true，「未傳＝不受限」的相容承諾才成立（見
// SummaryCard.vue 同款註解）。
const props = withDefaults(
  defineProps<{ cycleId: number; canWriteCycle?: boolean }>(),
  { canWriteCycle: true },
)
const emit = defineEmits<{
  'action': [payload: unknown]
  'selected-changed': [ids: number[]]
}>()

const data = ref<{ counts: Record<string, number>; buckets: Bucket[] }>({ counts: {}, buckets: [] })
const loading = ref(false)
const selectedIds = ref<number[]>([])

const COLUMN_DEFS = [
  { status: 'DRAFT', label: STATUS_LABEL.DRAFT, collapse: false },
  { status: 'SUPERVISOR_SIGNED', label: STATUS_LABEL.SUPERVISOR_SIGNED, collapse: false },
  { status: 'ACCOUNTING_SIGNED', label: STATUS_LABEL.ACCOUNTING_SIGNED, collapse: false },
  { status: 'FINALIZED', label: STATUS_LABEL.FINALIZED, collapse: true },
]

async function load() {
  loading.value = true
  try {
    const r = await getSignStatusSummary(props.cycleId)
    // 注入 status（見上方型別註解）：schema item 無此欄，SummaryCard 主按鈕與
    // 簽核 stage 推導都吃 summary.status，漏注入 = 主按鈕永不顯示 + 簽核靜默 no-op。
    data.value = {
      counts: r.data.counts,
      buckets: r.data.buckets.map((b) => ({
        status: b.status,
        summaries: b.summaries.map((s) => ({ ...s, status: b.status })),
      })),
    }
  } catch (e) {
    ElMessage.error(apiError(e, '載入看板失敗'))
  } finally {
    loading.value = false
  }
}

watch(() => props.cycleId, () => { selectedIds.value = []; load() }, { immediate: true })

defineExpose({ reload: load })

function summariesByStatus(status: string): Summary[] {
  const b = data.value.buckets.find(b => b.status === status)
  return b?.summaries || []
}

function toggleSelect({ summaryId, selected }: { summaryId: number; selected: boolean }) {
  if (selected) {
    if (!selectedIds.value.includes(summaryId)) selectedIds.value = [...selectedIds.value, summaryId]
  } else {
    selectedIds.value = selectedIds.value.filter(id => id !== summaryId)
  }
  emit('selected-changed', selectedIds.value)
}

function selectAll({ status, selected }: { status: string; selected: boolean }) {
  const ids = summariesByStatus(status).map(s => s.id)
  if (selected) {
    selectedIds.value = [...new Set([...selectedIds.value, ...ids])]
  } else {
    selectedIds.value = selectedIds.value.filter(id => !ids.includes(id))
  }
  emit('selected-changed', selectedIds.value)
}
</script>

<template>
  <div class="kanban-view" v-loading="loading" data-test="kanban-view">
    <KanbanColumn
      v-for="col in COLUMN_DEFS" :key="col.status"
      :status="col.status" :label="col.label"
      :summaries="summariesByStatus(col.status)"
      :selected-ids="selectedIds"
      :collapsed-by-default="col.collapse"
      :can-write-cycle="canWriteCycle"
      @toggle-select="toggleSelect"
      @select-all="selectAll"
      @action="(payload) => emit('action', payload)"
    />
  </div>
</template>

<style scoped>
.kanban-view { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-3);
               padding: var(--space-3); overflow-x: auto; }
@media (max-width: 1000px) {
  .kanban-view { grid-template-columns: 1fr; }
}
</style>
