<script setup>
import { computed, ref } from 'vue'
import SummaryCard from './SummaryCard.vue'

const props = defineProps({
  status: { type: String, required: true },
  label: { type: String, required: true },
  summaries: { type: Array, default: () => [] },
  selectedIds: { type: Array, default: () => [] },
  collapsedByDefault: { type: Boolean, default: false },
})
const emit = defineEmits(['toggle-select', 'select-all', 'action'])

const collapsed = ref(props.collapsedByDefault && props.summaries.length > 5)
const allSelected = computed(() =>
  props.summaries.length > 0 && props.summaries.every(s => props.selectedIds.includes(s.id)),
)

function onCardSelectChange(summaryId, v) {
  emit('toggle-select', { summaryId, selected: v })
}
function onSelectAll(v) {
  emit('select-all', { status: props.status, selected: v })
}
</script>

<template>
  <div class="kanban-column">
    <div class="col-header">
      <el-checkbox :model-value="allSelected" @update:model-value="onSelectAll"
                   :data-test="`col-select-all-${status}`" />
      <span class="col-label">{{ label }} ({{ summaries.length }})</span>
      <el-button text @click="collapsed = !collapsed">
        {{ collapsed ? '展開' : '收合' }}
      </el-button>
    </div>
    <div v-if="!collapsed" class="col-body" :data-test="`col-body-${status}`">
      <SummaryCard
        v-for="summary in summaries"
        :key="summary.id"
        :summary="summary"
        :selected="selectedIds.includes(summary.id)"
        @update:selected="(v) => onCardSelectChange(summary.id, v)"
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
