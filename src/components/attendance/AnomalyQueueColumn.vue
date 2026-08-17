<template>
  <div class="anomaly-queue-column" v-loading="loading">
    <!-- 頂部篩選 -->
    <div class="anomaly-queue-column__filters">
      <el-select
        v-model="typeFilter"
        placeholder="類型"
        @change="onFilterChange"
      >
        <el-option value="all" label="全部" />
        <el-option value="late" label="遲到" />
        <el-option value="early_leave" label="早退" />
        <el-option value="missing_punch" label="未打卡" />
      </el-select>

      <el-select
        v-model="statusFilter"
        placeholder="狀態"
        @change="onFilterChange"
      >
        <el-option value="all" label="全部" />
        <el-option value="pending" label="未處理" />
        <el-option value="confirmed" label="已處理" />
      </el-select>
    </div>

    <!-- 空狀態 -->
    <div
      v-if="!loading && filteredWithIndex.length === 0"
      class="anomaly-queue-column__empty"
    >
      <EmptyState
        variant="inline"
        title="無異常紀錄"
        description="目前沒有符合條件的異常紀錄"
      />
    </div>

    <!-- 列表：一天一張卡（同 attendance id 的異常收在同卡） -->
    <ul v-else class="anomaly-queue-column__list" role="listbox" aria-label="異常佇列">
      <li
        v-for="{ item, origIndex } in filteredWithIndex"
        :key="item.id"
        class="anomaly-item"
        :class="{ 'anomaly-item--selected': origIndex === props.selectedIndex }"
        role="option"
        :aria-selected="origIndex === props.selectedIndex"
        @click="emit('select', origIndex)"
      >
        <!-- 未處理紅點 -->
        <span
          v-if="item.confirmed_action === null"
          class="anomaly-item__pending"
          aria-label="未處理"
        />

        <div class="anomaly-item__main">
          <div class="anomaly-item__header">
            <span class="anomaly-item__name">{{ item.employee_name }}</span>
            <span class="anomaly-item__type-label">{{ typeLabels(item) }}</span>
          </div>
          <div class="anomaly-item__sub">
            <span class="anomaly-item__date">
              {{ item.date }}（{{ item.weekday }}）
            </span>
            <span
              v-if="deductionOf(item) > 0"
              class="anomaly-item__deduction"
            >
              -NT${{ deductionOf(item).toLocaleString() }}
            </span>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import EmptyState from '@/components/common/EmptyState.vue'
import type { AnomalyDayCard } from '@/composables/useAttendanceWorkspace'

const props = defineProps<{
  items: AnomalyDayCard[]
  selectedIndex: number
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'select', index: number): void
  (e: 'filterChange', payload: { type: string; status: string }): void
}>()

const typeFilter = ref<string>('all')
// 預設只看未處理（沿用舊佇列語意）；已處理／全部由使用者切換
const statusFilter = ref<string>('pending')

function onFilterChange(): void {
  emit('filterChange', { type: typeFilter.value, status: statusFilter.value })
}

function typeLabels(card: AnomalyDayCard): string {
  return card.items.map((i) => i.type_label).join('・')
}

/** 卡片預估扣款合計（遮罩 null 視為未知不列入） */
function deductionOf(card: AnomalyDayCard): number {
  return card.items.reduce((sum, i) => sum + (i.estimated_deduction ?? 0), 0)
}

// 保留原始 index（供父層以 anomalyQueue 全量索引選取）；
// type：卡內任一異常符合即顯示；status：pending=未處理、confirmed=已處理（真的生效）
const filteredWithIndex = computed<{ item: AnomalyDayCard; origIndex: number }[]>(() => {
  return props.items
    .map((it, i) => ({ item: it, origIndex: i }))
    .filter(
      ({ item }) =>
        typeFilter.value === 'all' || item.items.some((x) => x.type === typeFilter.value),
    )
    .filter(({ item }) => {
      if (statusFilter.value === 'pending') return item.confirmed_action === null
      if (statusFilter.value === 'confirmed') return item.confirmed_action !== null
      return true
    })
})
</script>

<style scoped>
.anomaly-queue-column {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.anomaly-queue-column__filters {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-3);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.anomaly-queue-column__filters .el-select {
  flex: 1;
}

.anomaly-queue-column__empty {
  padding: var(--space-4);
}

.anomaly-queue-column__list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
}

.anomaly-item {
  display: flex;
  align-items: flex-start;
  padding: var(--space-3);
  cursor: pointer;
  border-bottom: 1px solid var(--border-color-light, #f1f5f9);
  transition: background-color 0.15s;
  gap: var(--space-2);
}

.anomaly-item:hover {
  background-color: var(--fill-color-light, #f9fafb);
}

.anomaly-item--selected {
  /* fallback 與 token 真值對齊（design-tokens.css html.ivy-admin） */
  background-color: var(--brand-primary-soft, #e0f2fe);
  border-left: 3px solid var(--brand-primary, #0284c7);
}

.anomaly-item__pending {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--danger, #ef4444);
  flex-shrink: 0;
  margin-top: 6px;
}

.anomaly-item__main {
  flex: 1;
  min-width: 0;
}

.anomaly-item__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.anomaly-item__name {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-primary, #1e293b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.anomaly-item__type-label {
  font-size: var(--text-xs, 0.75rem);
  color: var(--text-secondary, #475569);
  flex-shrink: 0;
}

.anomaly-item__sub {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: 2px;
}

.anomaly-item__date {
  font-size: var(--text-xs, 0.75rem);
  color: var(--text-tertiary, #94a3b8);
}

.anomaly-item__deduction {
  font-size: var(--text-xs, 0.75rem);
  color: var(--danger, #ef4444);
  font-weight: 500;
  flex-shrink: 0;
}
</style>
