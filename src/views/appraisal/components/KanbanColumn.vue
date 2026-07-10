<script setup lang="ts">
import { computed, ref } from 'vue'
import SummaryCard from './SummaryCard.vue'

interface Summary { id: number; [key: string]: unknown }

const props = defineProps<{
  status: string
  label: string
  summaries?: Summary[]
  selectedIds?: number[]
  collapsedByDefault?: boolean
}>()
const emit = defineEmits<{
  'toggle-select': [payload: { summaryId: number; selected: boolean }]
  'select-all': [payload: { status: string; selected: boolean }]
  'action': [payload: unknown]
}>()

const collapsed = ref((props.collapsedByDefault ?? false) && (props.summaries?.length ?? 0) > 5)
const allSelected = computed(() => {
  const sums = props.summaries ?? []
  const ids = props.selectedIds ?? []
  return sums.length > 0 && sums.every(s => ids.includes(s.id))
})

function onCardSelectChange(summaryId: number, v: boolean) {
  emit('toggle-select', { summaryId, selected: v })
}
function onSelectAll(v: string | number | boolean) {
  emit('select-all', { status: props.status, selected: Boolean(v) })
}
</script>

<template>
  <div class="kanban-column">
    <div class="col-header">
      <el-checkbox :model-value="allSelected" @update:model-value="onSelectAll"
                   :data-test="`col-select-all-${status}`" />
      <span class="col-label">{{ label }} ({{ summaries?.length ?? 0 }})</span>
      <el-button text @click="collapsed = !collapsed">
        {{ collapsed ? '展開' : '收合' }}
      </el-button>
    </div>
    <div v-if="!collapsed" class="col-body" :data-test="`col-body-${status}`">
      <SummaryCard
        v-for="summary in (summaries ?? [])"
        :key="summary.id"
        :summary="summary"
        :selected="(selectedIds ?? []).includes(summary.id)"
        show-menu
        @update:selected="(v) => onCardSelectChange(summary.id, v as boolean)"
        @action="(payload) => emit('action', payload)"
      />
    </div>
  </div>
</template>

<style scoped>
.kanban-column { display: flex; flex-direction: column; gap: 8px; min-width: 260px; }
.col-header { display: flex; align-items: center; gap: 8px; padding: 8px;
              border-bottom: 2px solid var(--el-border-color); background: var(--el-fill-color-light); }
.col-label { flex: 1; font-weight: 600; }
.col-body { display: flex; flex-direction: column; gap: 6px; max-height: 600px; overflow-y: auto; }
</style>
