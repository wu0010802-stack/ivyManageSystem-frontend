<script setup lang="ts">
/**
 * 點名狀態列：一排既是統計、也是篩選的 chip（2026-09-14 UI/UX 審查 P1）。
 *
 * 改版前「還有幾人沒點」只出現在批次按鈕的括號裡（「未點名者出席（27 人）」），
 * 而且點不了；老師想只看還沒點的人，只能自己在 27 列裡找。
 *
 * 用原生 button 而非 el-radio-button：這排要能「再點一次取消篩選」，radio 的
 * 單選語意做不到；而且 0 筆的類別要顯示成 0（不是消失），也需要自己控制樣式。
 */
import { computed } from 'vue'
import type { RollcallFilter, RollcallSummary } from '@/utils/studentRollcall'

const props = defineProps<{
  summary: RollcallSummary
  modelValue: RollcallFilter | 'all'
  search: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: RollcallFilter | 'all']
  'update:search': [value: string]
}>()

const chips = computed(() => [
  { key: 'all' as const, label: '全部', count: props.summary.total },
  { key: 'unmarked' as const, label: '未點', count: props.summary.unmarked },
  { key: '出席' as const, label: '出席', count: props.summary.present },
  { key: '缺席' as const, label: '缺席', count: props.summary.absent },
  { key: 'leave' as const, label: '請假', count: props.summary.leave },
  { key: '遲到' as const, label: '遲到', count: props.summary.late },
])

function pick(key: RollcallFilter | 'all') {
  // 再點一次已選中的類別＝取消篩選。否則老師篩了「缺席」之後會找不到回去的路。
  emit('update:modelValue', props.modelValue === key ? 'all' : key)
}
</script>

<template>
  <div class="rollcall-filter-bar">
    <div class="chips" role="group" aria-label="依出缺席狀態篩選名冊">
      <button
        v-for="chip in chips"
        :key="chip.key"
        type="button"
        class="filter-chip"
        :class="{
          'is-active': modelValue === chip.key,
          'is-pending': chip.key === 'unmarked' && chip.count > 0,
        }"
        :disabled="disabled"
        :aria-pressed="modelValue === chip.key"
        @click="pick(chip.key)"
      >
        {{ chip.label }} {{ chip.count }}
      </button>
    </div>

    <el-input
      :model-value="search"
      class="search"
      size="small"
      placeholder="搜尋姓名"
      clearable
      :disabled="disabled"
      aria-label="搜尋學生姓名"
      @update:model-value="emit('update:search', $event)"
    />
  </div>
</template>

<style scoped>
.rollcall-filter-bar {
  display: flex;
  gap: var(--space-3, 12px);
  align-items: center;
  flex-wrap: wrap;
  padding: var(--space-2, 8px) var(--space-3, 12px);
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: var(--radius-md, 8px);
}

.chips {
  display: flex;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}

.filter-chip {
  min-height: 32px;
  padding: 4px 14px;
  border: 1px solid var(--el-border-color);
  border-radius: 999px;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  font: inherit;
  font-size: var(--text-sm, 13px);
  cursor: pointer;
  font-variant-numeric: tabular-nums;
}

.filter-chip:hover:not(:disabled) {
  border-color: var(--el-color-primary);
}

.filter-chip:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.filter-chip.is-active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 700;
}

/* 還有人沒點＝待辦，用警示色描邊把它從其他統計裡拉出來。 */
.filter-chip.is-pending {
  border-color: var(--color-warning);
  color: var(--color-warning);
  font-weight: 700;
}

.filter-chip.is-pending.is-active {
  background: var(--color-warning-soft);
}

.search {
  flex: 1;
  min-width: 140px;
  max-width: 240px;
}

@media (max-width: 600px) {
  .search {
    max-width: none;
    flex-basis: 100%;
  }

  .filter-chip {
    min-height: var(--touch-target-min, 44px);
  }
}
</style>
