<template>
  <div class="fee-refunds-tab">
    <!-- ================================================================
         Toolbar：期別 / 學生搜尋 / 重新整理 / 新增退費
    ================================================================ -->
    <div class="toolbar">
      <div class="filters">
        <el-select
          v-model="filter.period"
          placeholder="學期"
          aria-label="學期"
          clearable
          class="filter-period"
        >
          <el-option
            v-for="period in effectivePeriodOptions"
            :key="period"
            :label="period"
            :value="period"
          />
        </el-select>
        <el-input
          v-model="filter.student_name"
          placeholder="學生姓名"
          aria-label="學生姓名"
          clearable
          class="filter-student"
          @keyup.enter="loadRefundedRecords"
        />
        <el-button @click="loadRefundedRecords" :loading="loading">重新整理</el-button>
      </div>
      <el-button type="primary" @click="openNewRefundDialog">新增退費</el-button>
    </div>

    <!-- ================================================================
         退費歷史表（GET /fees/refunds 伺服器分頁，Phase 2 起為完整退費歷史）
    ================================================================ -->
    <div class="refunds-table-region" :aria-busy="loading ? 'true' : 'false'">
    <EmptyState
      v-if="loadError"
      data-test="refund-error-state"
      variant="error"
      title="載入退費紀錄失敗"
      description="請檢查網路連線後重試"
    >
      <template #action>
        <el-button type="primary" data-test="refund-error-retry" @click="loadRefundedRecords">重試</el-button>
      </template>
    </EmptyState>
    <el-table
      v-else-if="refundedRows.length > 0"
      :data="refundedRows"
      v-loading="loading"
      border
      row-key="id"
      :expand-row-keys="expandedRowKeys"
      @expand-change="onExpandChange"
    >
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="refund-history">
            <p class="history-title">退費明細</p>
            <el-table :data="row._refunds" border size="small">
              <el-table-column label="退費金額" prop="amount" width="120" align="right">
                <template #default="{ row: r }">{{ formatCurrency(r.amount) }}</template>
              </el-table-column>
              <el-table-column label="原因" prop="reason" min-width="180" />
              <el-table-column label="備註" prop="notes" min-width="160" />
              <el-table-column label="操作人" prop="refunded_by" width="120" />
              <el-table-column label="時間" prop="refunded_at" width="170">
                <template #default="{ row: r }">{{ formatDateTime(r.refunded_at) }}</template>
              </el-table-column>
            </el-table>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="學生" prop="student_name" min-width="100" />
      <el-table-column label="班級" prop="classroom_name" min-width="100" />
      <el-table-column label="學期" prop="period" width="100" />
      <el-table-column label="費用項目" prop="fee_item_name" min-width="120" />
      <el-table-column label="退費總額" width="120" align="right">
        <template #default="{ row }">{{ formatCurrency(row._total_refunded) }}</template>
      </el-table-column>
      <el-table-column label="退費筆數" width="90" align="center">
        <template #default="{ row }">{{ row._refunds?.length || 0 }}</template>
      </el-table-column>
      <el-table-column label="最近退費時間" width="170">
        <template #default="{ row }">{{ formatDateTime(row._latest_refund_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120" align="center" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" plain @click.stop="openRefundForRow(row)">
            再次退費
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <!-- 空狀態外置：畫面上只留 toolbar 那一顆 primary「新增退費」CTA -->
    <EmptyState
      v-else-if="!loading"
      title="目前條件內沒有退費紀錄"
      description="可用右上「新增退費」選擇已繳費的記錄建立退費"
    />
    <el-pagination
      v-if="!loadError && total > 0"
      :current-page="page"
      :page-size="pageSize"
      :total="total"
      layout="total, sizes, prev, pager, next"
      :page-sizes="[20, 50, 100]"
      class="refunds-pagination"
      @current-change="onPageChange"
      @size-change="onPageSizeChange"
    />
    </div>

    <!-- ================================================================
         Dialog：新增退費（選 record → 開 RefundSuggestModal）
    ================================================================ -->
    <el-dialog
      v-model="pickerVisible"
      title="選擇要退費的費用記錄"
      width="min(720px, 94vw)"
      destroy-on-close
    >
      <div class="picker-toolbar">
        <el-select
          v-model="pickerFilter.period"
          placeholder="學期"
          aria-label="學期"
          clearable
          class="filter-period"
        >
          <el-option
            v-for="period in effectivePeriodOptions"
            :key="period"
            :label="period"
            :value="period"
          />
        </el-select>
        <el-input
          v-model="pickerFilter.student_name"
          placeholder="學生姓名"
          aria-label="學生姓名"
          clearable
          class="filter-student"
          @keyup.enter="loadPickerCandidates"
        />
        <el-button @click="loadPickerCandidates" :loading="pickerLoading">搜尋</el-button>
      </div>

      <el-table
        :data="pickerCandidates"
        v-loading="pickerLoading"
        border
        max-height="400"
        @row-click="onPickRecord"
      >
        <el-table-column label="學生" prop="student_name" min-width="100" />
        <el-table-column label="班級" prop="classroom_name" min-width="100" />
        <el-table-column label="學期" prop="period" width="100" />
        <el-table-column label="費用項目" prop="fee_item_name" min-width="120" />
        <el-table-column label="已繳" width="110" align="right">
          <template #default="{ row }">{{ formatCurrency(row.amount_paid) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click.stop="onPickRecord(row)">選擇</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <span>輸入學生姓名或選擇期別以搜尋有已繳金額的費用記錄</span>
        </template>
      </el-table>

      <template #footer>
        <el-button @click="pickerVisible = false">取消</el-button>
      </template>
    </el-dialog>

    <!-- ================================================================
         Modal：退費計算器（重用 RefundSuggestModal）
    ================================================================ -->
    <RefundSuggestModal
      v-if="refundModalVisible"
      v-model="refundModalVisible"
      :record="refundTarget"
      @refunded="onRefunded"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getFeeRecords, getRefundedFeeRecords, getFeePeriods } from '@/api/fees'
import { formatCurrency } from '@/utils/currency'
import EmptyState from '@/components/common/EmptyState.vue'
import RefundSuggestModal from '@/components/fees/RefundSuggestModal.vue'

const props = withDefaults(defineProps<{
  periodOptions?: string[]
}>(), {
  periodOptions: () => [],
})

// ─── 期別選項（優先用 prop，否則自己 fetch） ─────────────────────────────────
const localPeriods = ref<string[]>([])
const effectivePeriodOptions = computed(() =>
  props.periodOptions && props.periodOptions.length > 0
    ? props.periodOptions
    : localPeriods.value
)

async function ensurePeriods() {
  if (props.periodOptions && props.periodOptions.length > 0) return
  try {
    localPeriods.value = await getFeePeriods() as string[]
  } catch {
    // 非致命：toolbar 仍可用學生姓名搜尋
  }
}

// ─── 主表：退費歷史（GET /fees/refunds 伺服器分頁；一 record 一列，含彙總與明細） ───
const filter = reactive({
  period: '',
  student_name: '',
})
const refundedRows = ref<FeeRecord[]>([])
const expandedRowKeys = ref<string[]>([])
const loading = ref<boolean>(false)
const loadError = ref<boolean>(false)
const page = ref<number>(1)
const pageSize = ref<number>(20)
const total = ref<number>(0)

interface RefundListItem {
  record_id: number
  student_id: number
  student_name?: string | null
  classroom_name?: string | null
  period?: string | null
  fee_item_name?: string | null
  fee_type?: string | null
  amount_due: number
  amount_paid?: number | null
  total_refunded: number
  refund_count: number
  latest_refund_at?: string | null
  refunds: Record<string, unknown>[]
}

function _buildListParams() {
  const params: Record<string, unknown> = { page: page.value, page_size: pageSize.value }
  if (filter.period) params.period = filter.period
  if (filter.student_name) params.student_name = filter.student_name
  return params
}

// request sequence 守衛：晚發先回時，舊 response 不得覆蓋新條件的結果
let _listSeq = 0

async function loadRefundedRecords() {
  const seq = ++_listSeq
  loading.value = true
  try {
    const res = await getRefundedFeeRecords(_buildListParams())
    if (seq !== _listSeq) return
    const data = res as unknown as { total: number; items: RefundListItem[] }
    total.value = data.total
    // 映射為既有 row 形狀（id=record_id 供 row-key 與「再次退費」直接帶入 RefundSuggestModal）
    refundedRows.value = (data.items || []).map((item) => ({
      id: item.record_id,
      student_id: item.student_id,
      student_name: item.student_name ?? undefined,
      classroom_name: item.classroom_name ?? undefined,
      period: item.period ?? undefined,
      fee_item_name: item.fee_item_name ?? undefined,
      fee_type: item.fee_type ?? undefined,
      amount_due: item.amount_due,
      amount_paid: item.amount_paid ?? undefined,
      _refunds: item.refunds || [],
      _total_refunded: item.total_refunded,
      _latest_refund_at: item.latest_refund_at ?? null,
    }))
    expandedRowKeys.value = []
    loadError.value = false
  } catch (err: unknown) {
    if (seq !== _listSeq) return
    // 錯誤要持久呈現（EmptyState + 重試），toast 只是輔助
    loadError.value = true
    const e = err as { response?: { data?: { detail?: string } } }
    ElMessage.error(e?.response?.data?.detail || '載入退費紀錄失敗')
  } finally {
    if (seq === _listSeq) loading.value = false
  }
}

function onPageChange(p: number) {
  page.value = p
  void loadRefundedRecords()
}

function onPageSizeChange(size: number) {
  pageSize.value = size
  page.value = 1
  void loadRefundedRecords()
}

function onExpandChange(_row: unknown, expandedRows: { id: number }[]) {
  expandedRowKeys.value = expandedRows.map((r) => String(r.id))
}

// ─── 新增退費入口：record picker ───────────────────────────────────────────
const pickerVisible = ref<boolean>(false)
const pickerLoading = ref<boolean>(false)
const pickerFilter = reactive({
  period: '',
  student_name: '',
})
const pickerCandidates = ref<FeeRecord[]>([])

function openNewRefundDialog() {
  pickerFilter.period = filter.period || ''
  pickerFilter.student_name = ''
  pickerCandidates.value = []
  pickerVisible.value = true
}

async function loadPickerCandidates() {
  pickerLoading.value = true
  try {
    const params: Record<string, unknown> = { page: 1, page_size: 50 }
    if (pickerFilter.period) params.period = pickerFilter.period
    if (pickerFilter.student_name) params.student_name = pickerFilter.student_name
    const res = await getFeeRecords(params)
    // 只列「已繳金額 > 0」的（才能退費）
    pickerCandidates.value = ((res as { items?: FeeRecord[] })?.items || []).filter((r) => ((r.amount_paid as number) || 0) > 0)
  } catch (err: unknown) {
    const e = err as { response?: { data?: { detail?: string } } }
    ElMessage.error(e?.response?.data?.detail || '搜尋費用記錄失敗')
  } finally {
    pickerLoading.value = false
  }
}

function onPickRecord(row: FeeRecord) {
  pickerVisible.value = false
  refundTarget.value = row
  refundModalVisible.value = true
}

// ─── 退費 modal ────────────────────────────────────────────────────────────
interface FeeRecord {
  id: number
  student_name?: string
  fee_item_name?: string
  fee_type?: string
  amount_due?: number
  amount_paid?: number
  [key: string]: unknown
}
const refundModalVisible = ref<boolean>(false)
const refundTarget = ref<FeeRecord | null>(null)

function openRefundForRow(row: FeeRecord) {
  // 從「再次退費」按鈕進入：直接帶 row 開 modal
  refundTarget.value = row
  refundModalVisible.value = true
}

function onRefunded() {
  ElMessage.success('退費完成')
  loadRefundedRecords()
}

// ─── 工具 ─────────────────────────────────────────────────────────────────
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const dt = new Date(iso)
    if (Number.isNaN(dt.getTime())) return iso
    const y = dt.getFullYear()
    const m = String(dt.getMonth() + 1).padStart(2, '0')
    const d = String(dt.getDate()).padStart(2, '0')
    const hh = String(dt.getHours()).padStart(2, '0')
    const mm = String(dt.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${d} ${hh}:${mm}`
  } catch {
    return iso
  }
}

// ─── 篩選 watcher（條件變更 → page 歸 1 重查） ─────────────────────────────
watch(() => filter.period, () => {
  page.value = 1
  void loadRefundedRecords()
})

// 學生姓名 300ms debounce
let _searchTimer: ReturnType<typeof setTimeout> | null = null
watch(() => filter.student_name, () => {
  clearTimeout(_searchTimer ?? undefined)
  _searchTimer = setTimeout(() => {
    page.value = 1
    void loadRefundedRecords()
  }, 300)
})

onMounted(async () => {
  await ensurePeriods()
  loadRefundedRecords()
})

defineExpose({
  loadRefundedRecords,
  refundedRows,
  filter,
  page,
  pageSize,
  total,
  loadError,
  onPageChange,
  onPageSizeChange,
  pickerVisible,
  pickerCandidates,
  refundModalVisible,
  refundTarget,
  openNewRefundDialog,
  openRefundForRow,
  onPickRecord,
})
</script>

<style scoped>
.fee-refunds-tab {
  width: 100%;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
  gap: var(--space-3);
}

.filters {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.refund-history {
  padding: var(--space-3) var(--space-4);
  /* --bg-subtle 不存在；有效 token 為 --bg-color-soft（見 DESIGN.md） */
  background-color: var(--bg-color-soft);
}

.history-title {
  margin: 0 0 var(--space-2) 0;
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.refunds-pagination {
  margin-top: var(--space-3);
  justify-content: flex-end;
}

.filter-period {
  width: 150px;
}

.filter-student {
  width: 160px;
}

.picker-toolbar {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  flex-wrap: wrap;
}

@media (--to-sm) {
  .filter-period,
  .filter-student {
    width: 100%;
    flex: 1 1 auto;
  }
}
</style>
