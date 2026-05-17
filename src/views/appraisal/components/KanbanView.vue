<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { getSignStatusSummary } from '@/api/appraisal'
import { apiError } from '@/utils/error'
import KanbanColumn from './KanbanColumn.vue'

const props = defineProps({
  cycleId: { type: Number, required: true },
})
const emit = defineEmits(['action', 'selected-changed'])

const data = ref({ counts: {}, buckets: [] })
const loading = ref(false)
const selectedIds = ref([])

const COLUMN_DEFS = [
  { status: 'DRAFT', label: '草稿', collapse: false },
  { status: 'SUPERVISOR_SIGNED', label: '主管已簽', collapse: false },
  { status: 'ACCOUNTING_SIGNED', label: '會計已簽', collapse: false },
  { status: 'FINALIZED', label: '已核定', collapse: true },
]

async function load() {
  loading.value = true
  try {
    const r = await getSignStatusSummary(props.cycleId)
    data.value = r.data
  } catch (e) {
    ElMessage.error(apiError(e, '載入看板失敗'))
  } finally {
    loading.value = false
  }
}

watch(() => props.cycleId, () => { selectedIds.value = []; load() }, { immediate: true })

defineExpose({ reload: load })

function summariesByStatus(status) {
  const b = data.value.buckets.find(b => b.status === status)
  return b?.summaries || []
}

function toggleSelect({ summaryId, selected }) {
  if (selected) {
    if (!selectedIds.value.includes(summaryId)) selectedIds.value = [...selectedIds.value, summaryId]
  } else {
    selectedIds.value = selectedIds.value.filter(id => id !== summaryId)
  }
  emit('selected-changed', selectedIds.value)
}

function selectAll({ status, selected }) {
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
.kanban-view { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
               padding: 12px; overflow-x: auto; }
@media (max-width: 1000px) {
  .kanban-view { grid-template-columns: 1fr; }
}
</style>
