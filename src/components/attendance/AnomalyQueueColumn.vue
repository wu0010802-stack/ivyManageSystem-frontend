<template>
  <div class="anomaly-queue-column" v-loading="loading">
    <el-input v-model="searchTerm" aria-label="搜尋異常人員" placeholder="搜尋異常人員姓名或工號" clearable />
    <p class="anomaly-queue-column__scope">搜尋僅套用此異常清單；全選限目前篩選結果，變更篩選會清除選取。</p>
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

    <!-- 全選列（多選批次處理，P?-batch-ux-tail）；唯讀帳號無批次動作可用，整列不顯示 -->
    <div v-if="canWrite && selectableRows.length > 0" class="anomaly-queue-column__select-all">
      <el-checkbox
        :model-value="allVisibleSelected"
        :indeterminate="someVisibleSelected"
        @update:model-value="toggleSelectAll"
      >全選目前篩選結果（{{ selectableRows.length }}）</el-checkbox>
      <span v-if="selectedIds.size > 0" class="anomaly-queue-column__selected-count">
        已選 {{ selectedIds.size }} 件
      </span>
    </div>

    <!-- 薪資已封存的員工：項目還看得到、點得開，但不能批次處理（後端會整批 409） -->
    <p v-if="sealedCount > 0" class="anomaly-queue-column__sealed" role="note" data-test="sealed-note">已封存的 {{ sealedCount }} 件只能看</p>

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

    <!-- 列表：一天一張卡（同 attendance id 的異常收在同卡）。
         WAI-ARIA listbox + roving tabindex：option 是卡片內容區（.anomaly-item__option），
         ↑↓／Home／End 移動焦點、Enter／Space 選取（與點擊同一個 select 事件）。
         批次勾選用的 checkbox 是獨立的可聚焦控制項，option 的子層必須是純展示，所以它放在 option
         **外面**（同一個 li 之內的兄弟）、保有自己的 Tab 停點；li 本身 role="presentation"，
         只保留「點整列都能選」的滑鼠便利，鍵盤路徑是內層 option。 -->
    <ul
      v-else
      ref="listRef"
      class="anomaly-queue-column__list"
      role="listbox"
      aria-label="異常佇列"
      @focusout="onListFocusOut"
    >
      <li
        v-for="{ item, origIndex } in filteredWithIndex"
        :key="item.id"
        class="anomaly-item"
        :class="{ 'anomaly-item--selected': origIndex === props.selectedIndex }"
        role="presentation"
        @click="emit('select', origIndex)"
      >
        <!-- 多選 checkbox：click.stop 避免連動觸發單選/切換明細；32×32 點擊區（見 style） -->
        <span class="anomaly-item__checkbox-wrap" @click.stop>
          <el-checkbox
            class="anomaly-item__checkbox"
            :model-value="selectedIds.has(item.id)"
            :disabled="isSealedCard(item)"
            :aria-label="`選取 ${item.employee_name} ${item.date} 的異常`"
            @update:model-value="(v) => toggleSelectOne(item.id, v)"
          />
        </span>

        <div
          class="anomaly-item__option"
          role="option"
          :data-card-id="item.id"
          :tabindex="item.id === tabStopId ? 0 : -1"
          :aria-selected="origIndex === props.selectedIndex"
          @focus="focusedId = item.id"
          @keydown="onOptionKeydown($event, origIndex, item.id)"
        >
          <!-- 未處理紅點：role="img" 才能帶 aria-label（無角色的 span 不可命名），
               並讓 option 的可存取名稱帶上「未處理」；點本身仍是純視覺 8px，不加可見文字以維持列密度 -->
          <span
            v-if="item.confirmed_action === null"
            class="anomaly-item__pending"
            role="img"
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
        </div>
      </li>
    </ul>

    <!-- 批次動作列：選取 >0 時顯示；與 ResolveCard 的單筆動作一致，需 ATTENDANCE_WRITE -->
    <div v-if="canWrite && selectedIds.size > 0" class="anomaly-queue-column__batch-bar">
      <div class="anomaly-queue-column__batch-remark-field">
        <el-input
          v-model="batchRemark"
          placeholder="備註（豁免必填）"
          size="small"
          class="anomaly-queue-column__batch-remark"
        />
        <p v-if="remarkMissing" class="anomaly-queue-column__batch-remark-error" role="alert" data-test="batch-remark-error">豁免要填理由</p>
      </div>
      <el-button
        size="small"
        :loading="batchBusy"
        @click="confirmBatchAction('admin_accept')"
      >批次接受扣款（{{ selectedIds.size }}）</el-button>
      <el-button
        size="small"
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
import { ref, reactive, computed, watch, h } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import EmptyState from '@/components/common/EmptyState.vue'
import { batchConfirmAnomalies } from '@/api/attendance'
import { hasPermission } from '@/utils/auth'
import { useErrorNotify } from '@/composables/useErrorNotify'
import type { AnomalyDayCard } from '@/composables/useAttendanceWorkspace'
import { useGridVerdict } from '@/composables/useGridVerdict'
import { showUndoToast } from '@/composables/useConfirmUndo'

const props = withDefaults(defineProps<{
  items: AnomalyDayCard[]
  selectedIndex: number
  loading: boolean
  /** 薪資已封存的員工 id：他們的項目只能看（核取框停用、不進全選、不送批次） */
  sealedEmployeeIds?: ReadonlySet<number>
  /** 員工編號 → 員工 id（異常日卡只有編號，封存名單是 id） */
  employeeIdByNumber?: ReadonlyMap<string, number>
}>(), { sealedEmployeeIds: () => new Set<number>(), employeeIdByNumber: () => new Map<string, number>() })

const emit = defineEmits<{
  (e: 'select', index: number): void
  (e: 'filterChange', payload: { type: string; status: string }): void
  (e: 'resolved'): void
}>()

const { notify } = useErrorNotify()

// 唯讀帳號（有 ATTENDANCE_READ 無 ATTENDANCE_WRITE）不該看到批次接受／豁免——
// 單筆動作的 ResolveCard 一向有這道檢查，此處漏了，按下去才被後端 403。
const canWrite = computed(() => hasPermission('ATTENDANCE_WRITE'))

const searchTerm = ref('')
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
    .filter(({ item }) => !searchTerm.value.trim() || `${item.employee_name} ${item.employee_number}`.toLowerCase().includes(searchTerm.value.trim().toLowerCase()))
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

/** 這張日卡的員工薪資已封存（編號對不到 id 就當作沒封存：批次時後端會擋，不會誤改） */
function isSealedCard(card: AnomalyDayCard): boolean {
  const employeeId = props.employeeIdByNumber.get(card.employee_number)
  return employeeId !== undefined && props.sealedEmployeeIds.has(employeeId)
}
/** 目前篩選結果裡能處理的（不含封存）：全選與全選列的數字都只算這些 */
const selectableRows = computed(() => filteredWithIndex.value.filter(({ item }) => !isSealedCard(item)))
const sealedCount = computed(() => filteredWithIndex.value.length - selectableRows.value.length)

// ── 鍵盤操作（listbox + roving tabindex）────────────────────────────────────────
const listRef = ref<HTMLElement | null>(null)
/** 目前持有焦點的卡（焦點離開清單後清掉，Tab 停點回到選取卡） */
const focusedId = ref<number | null>(null)

/** roving tabindex 的唯一 Tab 停點：持有焦點的卡 → 選取卡 → 第一張（皆須在目前篩選結果內） */
const tabStopId = computed<number | null>(() => {
  const rows = filteredWithIndex.value
  if (focusedId.value !== null && rows.some(({ item }) => item.id === focusedId.value)) {
    return focusedId.value
  }
  const selected = rows.find(({ origIndex }) => origIndex === props.selectedIndex)
  return (selected ?? rows[0])?.item.id ?? null
})

function focusCard(cardId: number): void {
  focusedId.value = cardId
  listRef.value?.querySelector<HTMLElement>(`[data-card-id="${cardId}"]`)?.focus()
}

function onOptionKeydown(e: KeyboardEvent, origIndex: number, cardId: number): void {
  if (e.altKey || e.ctrlKey || e.metaKey) return
  const rows = filteredWithIndex.value
  const index = rows.findIndex(({ item }) => item.id === cardId)
  let nextIndex: number
  switch (e.key) {
    case 'ArrowDown':
      nextIndex = Math.min(index + 1, rows.length - 1)
      break
    case 'ArrowUp':
      nextIndex = Math.max(index - 1, 0)
      break
    case 'Home':
      nextIndex = 0
      break
    case 'End':
      nextIndex = rows.length - 1
      break
    case 'Enter':
    case ' ':
      // 與點擊同一路徑；Space 預設會捲動容器，必須擋掉
      e.preventDefault()
      emit('select', origIndex)
      return
    default:
      return
  }
  e.preventDefault()
  const target = rows[nextIndex]
  if (target) focusCard(target.item.id)
}

function onListFocusOut(e: FocusEvent): void {
  const next = e.relatedTarget as Node | null
  if (!next || !listRef.value?.contains(next)) focusedId.value = null
}

// ── 多選批次處理（P?-batch-ux-tail）──────────────────────────────────────────
// 後端 attendance_ids 契約上限 500（BatchConfirmRequest.max_length）；此處同步防呆，
// 避免使用者在超大月份全選後送出必然 422 卻沒有清楚提示。
const MAX_BATCH_IDS = 500

const ACTION_LABELS: Record<'admin_accept' | 'admin_waive', string> = {
  admin_accept: '接受扣款',
  admin_waive: '豁免',
}

const selectedIds = reactive(new Set<number>())
watch([searchTerm, typeFilter, statusFilter], () => selectedIds.clear())
const batchRemark = ref('')
/** 豁免沒填理由：欄位下方顯示提示，填了就消去 */
const remarkMissing = ref(false)
watch(batchRemark, (value) => { if (value.trim()) remarkMissing.value = false })
const batchBusy = ref(false)

// 封存名單或編號對照晚到（月摘要比異常清單慢載入）：已勾選、現在屬於封存員工的項目移出選取，
// 計數與送出的 id 才只含能處理的（封存的任何一件都會讓整批被後端 409）
watch(
  () => [props.sealedEmployeeIds, props.employeeIdByNumber],
  () => {
    for (const card of props.items) {
      if (selectedIds.has(card.id) && isSealedCard(card)) selectedIds.delete(card.id)
    }
  },
)

// 資料刷新（items 參考變動）後清空選取，避免殘留已處理過的舊 id 被誤重送
watch(
  () => props.items,
  () => {
    selectedIds.clear()
    batchRemark.value = ''
    remarkMissing.value = false
  },
)

const allVisibleSelected = computed<boolean>(
  () =>
    selectableRows.value.length > 0 &&
    selectableRows.value.every(({ item }) => selectedIds.has(item.id)),
)

const someVisibleSelected = computed<boolean>(
  () =>
    !allVisibleSelected.value &&
    selectableRows.value.some(({ item }) => selectedIds.has(item.id)),
)

// el-checkbox 的 update:modelValue 型別為 CheckboxValueType（string | number | boolean）；
// 此元件語意上一律是布林開關，收到即強制轉 boolean。
function toggleSelectAll(checked: string | number | boolean): void {
  // 封存員工的項目不進全選
  if (checked) {
    for (const { item } of selectableRows.value) selectedIds.add(item.id)
  } else {
    for (const { item } of selectableRows.value) selectedIds.delete(item.id)
  }
}

function toggleSelectOne(id: number, checked: string | number | boolean): void {
  if (checked) selectedIds.add(id)
  else selectedIds.delete(id)
}

function clearSelection(): void {
  selectedIds.clear()
  batchRemark.value = ''
  remarkMissing.value = false
}

/**
 * 批次接受扣款前把班表核對看得到的風險寫進確認文字（單筆在 ResolveCard 會另外問，批次不能繞過）：
 * 整月同型態＝多半是設定問題、會照錯的時段扣薪；疑似換班＝該先確認當日班別。
 */
const verdictOf = useGridVerdict()
function batchAcceptRisk(ids: number[]): string {
  const chosen = new Set(ids)
  let pattern = 0
  let shift = 0
  for (const card of props.items) {
    if (!chosen.has(card.id)) continue
    const verdict = verdictOf.value(null, card.date, card.employee_number)
    if (verdict?.acceptWarning) pattern += 1
    else if (verdict?.status === 'possible_shift_change') shift += 1
  }
  const parts = [
    pattern ? `${pattern} 件是整月同型態（多半是設定問題，會照目前的應上班時段扣薪）` : '',
    shift ? `${shift} 件核對判定為疑似換班（應先確認當日班別）` : '',
  ].filter(Boolean)
  return parts.length ? `注意：其中 ${parts.join('、')}。` : ''
}

async function confirmBatchAction(action: 'admin_accept' | 'admin_waive'): Promise<void> {
  if (batchBusy.value) return
  // 以日卡為準（順序跟清單一致），並再擋一次封存員工：任何一筆封存的 id 都會讓整批 409
  const chosen = props.items.filter((card) => selectedIds.has(card.id) && !isSealedCard(card))
  const ids = chosen.map((card) => card.id)
  if (ids.length === 0) return
  const remark = batchRemark.value.trim()
  // 豁免會讓這幾天不扣款，事後要查得到為什麼：沒有理由不開確認框
  if (action === 'admin_waive' && !remark) {
    remarkMissing.value = true
    return
  }
  if (ids.length > MAX_BATCH_IDS) {
    ElMessage.warning(`一次最多批次處理 ${MAX_BATCH_IDS} 件，請分批選取`)
    return
  }

  const lines = [
    `確認批次「${ACTION_LABELS[action]}」選取的 ${ids.length} 件考勤異常？此操作套用選取日期的整日異常。${action === 'admin_accept' ? `接受扣款仍依原規則計算扣款，並非豁免。${batchAcceptRisk(ids)}` : ''}`,
  ]
  if (action === 'admin_accept') {
    // 接受＝照扣：把這批會扣多少、牽涉幾個人寫在確認框（遮罩 null 與 0 不列入；合計是 0 就整行省略）
    const sum = chosen.reduce((total, card) => total + deductionOf(card), 0)
    if (sum > 0) lines.push(`合計 NT$${sum.toLocaleString()}（${new Set(chosen.map((card) => card.employee_number)).size} 人）`)
  }

  try {
    await ElMessageBox.confirm(
      h('div', lines.map((line, i) => h('p', { style: i ? 'margin:var(--space-2) 0 0;font-weight:600' : 'margin:0' }, line))),
      '批次處理',
      { type: 'warning', confirmButtonText: '確認', cancelButtonText: '取消' },
    )
  } catch {
    return // 使用者取消，不視為錯誤
  }

  batchBusy.value = true
  try {
    const res = await batchConfirmAnomalies({
      attendance_ids: ids,
      action,
      ...(remark ? { remark } : {}),
    })
    const text = `已批次處理 ${res.data.processed} 件`
    // 復原只清這次真的改成已處理的日卡：原本就已處理的卡（可能是員工自己或之前的處理）不能被一起清回未處理
    const undoable = chosen.filter((card) => card.confirmed_action === null).map((card) => card.id)
    // 實際處理 0 件（例如都已被別人處理）：沒有東西可復原，只給一般訊息
    if (undoable.length > 0 && res.data.processed > 0) showUndoToast({ text, attendanceIds: undoable, onUndone: () => emit('resolved') })
    else ElMessage.success(text)
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
.anomaly-queue-column__scope { color: var(--el-text-color-secondary); font-size: var(--text-sm); }
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
  border-bottom: 1px solid var(--border-color-light);
  flex-shrink: 0;
  font-size: var(--text-sm);
}

.anomaly-queue-column__selected-count {
  color: var(--color-primary);
  font-weight: 500;
}

.anomaly-queue-column__batch-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-top: 1px solid var(--border-color-light);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.anomaly-queue-column__batch-remark-field {
  flex: 1;
  min-width: 120px;
}

.anomaly-queue-column__batch-remark-error {
  margin: var(--space-1) 0 0;
  color: var(--color-danger-darker);
  font-size: var(--text-xs);
}

.anomaly-queue-column__sealed {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border-color-light);
  color: var(--el-text-color-secondary);
  font-size: var(--text-sm);
  flex-shrink: 0;
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
  border-bottom: 1px solid var(--border-color-light);
  transition: background-color var(--transition-fast);
  gap: var(--space-2);
}

.anomaly-item:hover {
  background-color: var(--el-fill-color-light);
}

.anomaly-item--selected {
  /* 2026-09-10 改版移除側邊色條（impeccable AI-slop 偵測命中），與 RosterColumn 選取態一致。 */
  background-color: var(--color-primary-lighter);
}

/* 可點範圍 32×32（原本只有 14×32）。視覺上方塊仍是 14px，靠左右負 margin 把多出來的
   點擊區吃進列的 padding／gap，列的版面幾乎不變（誤差 2px）。 */
.anomaly-item__checkbox-wrap {
  display: flex;
  align-items: flex-start;
  padding-top: 2px;
  margin-inline: calc(var(--space-2) * -1);
  flex-shrink: 0;
}

.anomaly-item__checkbox {
  width: 32px;
  height: 32px;
  margin: 0;
  justify-content: center;
}

/* option 本體：鍵盤焦點停在這裡；點擊事件由外層 li 處理（含 padding 區） */
.anomaly-item__option {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
}

.anomaly-item__option:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.anomaly-item__pending {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  /* 圖形元件對白底需 ≥3:1；--color-danger（#ef4444）在選取列底色上只有約 3.2:1，用 darker */
  background-color: var(--color-danger-darker);
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
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.anomaly-item__type-label {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  flex-shrink: 0;
}

.anomaly-item__sub {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: 2px;
}

/* 日期與金額在選取列（--brand-primary-soft）上要 ≥4.5:1：
   tertiary（#64748b）只有 4.15:1、--danger 系（#ef4444）只有 3.28:1，各升一階 */
.anomaly-item__date {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.anomaly-item__deduction {
  font-size: var(--text-xs);
  color: var(--color-danger-darker);
  font-weight: 500;
  flex-shrink: 0;
}
</style>
