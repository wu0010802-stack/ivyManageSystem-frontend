<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { getSignStatusSummary } from '@/api/appraisal'
import { apiError } from '@/utils/error'
import { STATUS_LABEL } from '@/constants/appraisalYearEnd'
import KanbanColumn from './KanbanColumn.vue'

interface Summary { id: number; status: string; [key: string]: unknown }
interface Bucket { status: string; summaries: Summary[] }

const props = defineProps<{ cycleId: number }>()
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
    // Task 16：getSignStatusSummary 補 AxiosResp<> 後 r.data 型別收斂為 OpenAPI schema
    // 產生的形狀，與本檔既有本地精簡型別（{ counts; buckets: Bucket[] }）不足以重疊
    // （TS2352）；本頁只取用 counts/buckets 兩欄，經 unknown 中介轉型不動 runtime 行為。
    data.value = r.data as unknown as { counts: Record<string, number>; buckets: Bucket[] }
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
