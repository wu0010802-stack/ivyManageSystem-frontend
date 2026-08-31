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

    <!-- 全選列（多選批次處理，P?-batch-ux-tail）-->
    <div v-if="filteredWithIndex.length > 0" class="anomaly-queue-column__select-all">
      <el-checkbox
        :model-value="allVisibleSelected"
        :indeterminate="someVisibleSelected"
        @update:model-value="toggleSelectAll"
      >全選（{{ filteredWithIndex.length }}）</el-checkbox>
      <span v-if="selectedIds.size > 0" class="anomaly-queue-column__selected-count">
        已選 {{ selectedIds.size }} 筆
      </span>
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
        <!-- 多選 checkbox：click.stop 避免連動觸發單選/切換明細 -->
        <span class="anomaly-item__checkbox-wrap" @click.stop>
          <el-checkbox
            class="anomaly-item__checkbox"
            :model-value="selectedIds.has(item.id)"
            aria-label="選取此筆異常"
            @update:model-value="(v) => toggleSelectOne(item.id, v)"
          />
        </span>

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

    <!-- 批次動作列：選取 >0 時顯示 -->
    <div v-if="selectedIds.size > 0" class="anomaly-queue-column__batch-bar">
      <el-input
        v-model="batchRemark"
        placeholder="備註（選填）"
        size="small"
        class="anomaly-queue-column__batch-remark"
      />
      <el-button
        size="small"
        type="success"
        :loading="batchBusy"
        @click="confirmBatchAction('admin_accept')"
      >批次視為正常（{{ selectedIds.size }}）</el-button>
      <el-button
        size="small"
        type="warning"
        :loading="batchBusy"
        @click="confirmBatchAction('admin_waive')"
      >批次豁免（{{ selectedIds.size }}）</el-button>
      <el-button
        size="small"
        text
        :disabled="batchBusy"
        @click="clearSelection"
      >取消選取</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import EmptyState from '@/components/common/EmptyState.vue'
import { batchConfirmAnomalies } from '@/api/attendance'
import { useErrorNotify } from '@/composables/useErrorNotify'
import type { AnomalyDayCard } from '@/composables/useAttendanceWorkspace'

const props = defineProps<{
  items: AnomalyDayCard[]
  selectedIndex: number
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'select', index: number): void
  (e: 'filterChange', payload: { type: string; status: string }): void
  (e: 'resolved'): void
}>()

const { notify } = useErrorNotify()

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

// ── 多選批次處理（P?-batch-ux-tail）──────────────────────────────────────────
// 後端 attendance_ids 契約上限 500（BatchConfirmRequest.max_length）；此處同步防呆，
// 避免使用者在超大月份全選後送出必然 422 卻沒有清楚提示。
const MAX_BATCH_IDS = 500

const ACTION_LABELS: Record<'admin_accept' | 'admin_waive', string> = {
  admin_accept: '視為正常',
  admin_waive: '豁免',
}

const selectedIds = reactive(new Set<number>())
const batchRemark = ref('')
const batchBusy = ref(false)

// 資料刷新（items 參考變動）後清空選取，避免殘留已處理過的舊 id 被誤重送
watch(
  () => props.items,
  () => {
    selectedIds.clear()
    batchRemark.value = ''
  },
)

const allVisibleSelected = computed<boolean>(
  () =>
    filteredWithIndex.value.length > 0 &&
    filteredWithIndex.value.every(({ item }) => selectedIds.has(item.id)),
)

const someVisibleSelected = computed<boolean>(
  () =>
    !allVisibleSelected.value &&
    filteredWithIndex.value.some(({ item }) => selectedIds.has(item.id)),
)

// el-checkbox 的 update:modelValue 型別為 CheckboxValueType（string | number | boolean）；
// 此元件語意上一律是布林開關，收到即強制轉 boolean。
function toggleSelectAll(checked: string | number | boolean): void {
  if (checked) {
    for (const { item } of filteredWithIndex.value) selectedIds.add(item.id)
  } else {
    for (const { item } of filteredWithIndex.value) selectedIds.delete(item.id)
  }
}

function toggleSelectOne(id: number, checked: string | number | boolean): void {
  if (checked) selectedIds.add(id)
  else selectedIds.delete(id)
}

function clearSelection(): void {
  selectedIds.clear()
  batchRemark.value = ''
}

async function confirmBatchAction(action: 'admin_accept' | 'admin_waive'): Promise<void> {
  if (batchBusy.value) return
  const ids = [...selectedIds]
  if (ids.length === 0) return
  if (ids.length > MAX_BATCH_IDS) {
    ElMessage.warning(`一次最多批次處理 ${MAX_BATCH_IDS} 筆，請分批選取`)
    return
  }

  try {
    await ElMessageBox.confirm(
      `確認批次「${ACTION_LABELS[action]}」選取的 ${ids.length} 筆考勤異常？`,
      '批次處理',
      { type: 'warning', confirmButtonText: '確認', cancelButtonText: '取消' },
    )
  } catch {
    return // 使用者取消，不視為錯誤
  }

  batchBusy.value = true
  try {
    const remark = batchRemark.value.trim()
    const res = await batchConfirmAnomalies({
      attendance_ids: ids,
      action,
      ...(remark ? { remark } : {}),
    })
    ElMessage.success(`已批次處理 ${res.data.processed} 筆`)
    clearSelection()
    emit('resolved')
  } catch (err) {
    // 後端已知錯誤語意（P0-1/F-042 本人 403、封存月份 409）皆為清楚中文 detail，
    // 由 interceptor 正規化進 displayMessage，notify 直接呈現即可。
    notify(err, 'AnomalyQueueColumn.batchConfirm', null, { prefix: '批次處理失敗' })
  } finally {
    batchBusy.value = false
  }
}
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

.anomaly-queue-column__select-all {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border-color-light, #f1f5f9);
  flex-shrink: 0;
  font-size: var(--text-sm, 0.875rem);
}

.anomaly-queue-column__selected-count {
  color: var(--brand-primary, #0284c7);
  font-weight: 500;
}

.anomaly-queue-column__batch-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-top: 1px solid var(--border-color-light, #f1f5f9);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.anomaly-queue-column__batch-remark {
  flex: 1;
  min-width: 120px;
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

.anomaly-item__checkbox-wrap {
  display: flex;
  align-items: flex-start;
  padding-top: 2px;
  flex-shrink: 0;
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
