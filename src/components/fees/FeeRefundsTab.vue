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
          clearable
          style="width: 150px"
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
          clearable
          style="width: 160px"
          @keyup.enter="loadRefundedRecords"
        />
        <el-button @click="loadRefundedRecords" :loading="loading">重新整理</el-button>
      </div>
      <el-button type="primary" @click="openNewRefundDialog">+ 新增退費</el-button>
    </div>

    <!-- ================================================================
         退費歷史表
    ================================================================ -->
    <el-table
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
      <template #empty>
        <div class="empty-state">
          <p>目前期別內無退費紀錄</p>
          <el-button type="primary" @click="openNewRefundDialog">+ 新增退費</el-button>
        </div>
      </template>
    </el-table>

    <p v-if="!loading && refundedRows.length > 0" class="hint">
      顯示 {{ filter.period || '全部期別' }} 篩選結果前 {{ scannedCount }} 筆 records 中有退費紀錄者（{{ refundedRows.length }} 筆）。如需擴大範圍，請使用上方期別或姓名篩選。
    </p>

    <!-- ================================================================
         Dialog：新增退費（選 record → 開 RefundSuggestModal）
    ================================================================ -->
    <el-dialog
      v-model="pickerVisible"
      title="選擇要退費的費用記錄"
      width="720px"
      destroy-on-close
    >
      <div class="picker-toolbar">
        <el-select
          v-model="pickerFilter.period"
          placeholder="學期"
          clearable
          style="width: 150px"
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
          clearable
          style="width: 180px"
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
import { getFeeRecords, getFeeRefunds, getFeePeriods } from '@/api/fees'
import { formatCurrency } from '@/utils/currency'
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

// ─── 主表：退費歷史 ──────────────────────────────────────────────────────────
const FAN_OUT_LIMIT = 100 // 一次最多掃描的 records 數量上限
const CONCURRENCY = 5

const filter = reactive({
  period: '',
  student_name: '',
})
const refundedRows = ref<FeeRecord[]>([])
const expandedRowKeys = ref<string[]>([])
const loading = ref<boolean>(false)
const scannedCount = ref<number>(0)

function _buildRecordParams() {
  const params: Record<string, unknown> = { page: 1, page_size: FAN_OUT_LIMIT }
  if (filter.period) params.period = filter.period
  if (filter.student_name) params.student_name = filter.student_name
  return params
}

/**
 * 對每筆 record 並發呼叫 getFeeRefunds，限制 concurrency。
 * 每筆失敗不阻斷整體（Promise.allSettled）。
 */
async function _fetchRefundsForRecords(records: FeeRecord[]) {
  const results: (Record<string, unknown> | null)[] = new Array(records.length).fill(null)
  let cursor = 0

  async function worker() {
    while (cursor < records.length) {
      const idx = cursor
      cursor += 1
      const rec = records[idx]
      try {
        results[idx] = await getFeeRefunds(rec.id as number)
      } catch {
        results[idx] = null
      }
    }
  }

  const workerCount = Math.min(CONCURRENCY, records.length)
  const workerPromises = []
  for (let i = 0; i < workerCount; i++) {
    workerPromises.push(worker())
  }
  await Promise.allSettled(workerPromises)
  return results
}

async function loadRefundedRecords() {
  loading.value = true
  try {
    const params = _buildRecordParams()
    const res = await getFeeRecords(params)
    const records: FeeRecord[] = (res as { items?: FeeRecord[] })?.items || []
    scannedCount.value = records.length

    // 只挑「有已繳金額」的 records 跑 refunds 查詢（沒繳費的不可能退費）
    const paidRecords = records.filter((r) => (r.amount_paid || 0) > 0)
    const refundResps = await _fetchRefundsForRecords(paidRecords)

    const rows: FeeRecord[] = []
    paidRecords.forEach((rec, idx) => {
      const resp = refundResps[idx]
      const refunds = (resp as { refunds?: Record<string, unknown>[] })?.refunds || []
      if (refunds.length === 0) return
      rows.push({
        ...rec,
        _refunds: refunds,
        _total_refunded: (resp as { total_refunded?: number })?.total_refunded || refunds.reduce((s, r) => s + ((r.amount as number) || 0), 0),
        _latest_refund_at: (refunds[0] as { refunded_at?: string })?.refunded_at || null,
      })
    })

    refundedRows.value = rows
    expandedRowKeys.value = []
  } catch (err: unknown) {
    const e = err as { response?: { data?: { detail?: string } } }
    ElMessage.error(e?.response?.data?.detail || '載入退費紀錄失敗')
  } finally {
    loading.value = false
  }
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

// ─── 篩選 watcher ─────────────────────────────────────────────────────────
watch(() => filter.period, () => loadRefundedRecords())

// 學生姓名 300ms debounce
let _searchTimer: ReturnType<typeof setTimeout> | null = null
watch(() => filter.student_name, () => {
  clearTimeout(_searchTimer ?? undefined)
  _searchTimer = setTimeout(() => loadRefundedRecords(), 300)
})

onMounted(async () => {
  await ensurePeriods()
  loadRefundedRecords()
})

defineExpose({
  loadRefundedRecords,
  refundedRows,
  filter,
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
  background-color: var(--bg-subtle, #fafafa);
}

.history-title {
  margin: 0 0 var(--space-2) 0;
  font-weight: 600;
  color: var(--text-secondary, #555);
}

.empty-state {
  padding: var(--space-6) 0;
  text-align: center;
  color: var(--text-tertiary, #999);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: center;
}

.hint {
  margin-top: var(--space-3);
  color: var(--text-tertiary, #999);
  font-size: var(--text-sm, 13px);
}

.picker-toolbar {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  flex-wrap: wrap;
}
</style>
