<template>
  <div class="bank-recon-tab">
    <!-- ── 對帳流程（資訊性導引，非精靈）───────────────────────────── -->
    <ol class="flow-strip" aria-label="銀行對帳流程">
      <li v-for="(step, i) in FLOW_STEPS" :key="step" class="flow-step">
        <span class="flow-step__num" aria-hidden="true">{{ i + 1 }}</span>
        <span>{{ step }}</span>
      </li>
    </ol>

    <!-- ── 步驟 1：匯入 ───────────────────────────────────────────── -->
    <section class="import-section" aria-label="匯入永豐對帳單">
      <div class="import-row">
        <el-upload
          :auto-upload="false"
          :show-file-list="false"
          accept=".csv"
          :on-change="onFileChange"
        >
          <el-button v-if="canWrite" type="primary" data-test="pick-csv" aria-label="選擇永豐銀行對帳 CSV 檔">
            選擇永豐 CSV
          </el-button>
        </el-upload>
        <span v-if="pickedFile" class="file-name">{{ pickedFile.name }}</span>
        <el-button
          v-if="canWrite && pickedFile"
          data-test="run-preview"
          :loading="previewing"
          aria-label="安全預覽匯入內容（不寫入）"
          @click="runPreview"
        >
          安全預覽
        </el-button>
        <span v-if="!canWrite" class="hint">匯入與媒合需要收款寫入權限；目前為唯讀檢視</span>
      </div>

      <el-descriptions v-if="preview" :column="4" size="small" border class="preview-box" data-test="import-preview">
        <el-descriptions-item label="日期區間">
          {{ preview.statement_start }} ~ {{ preview.statement_end }}
        </el-descriptions-item>
        <el-descriptions-item label="交易筆數">{{ preview.row_count }}</el-descriptions-item>
        <el-descriptions-item label="存入合計">{{ formatCurrency(preview.credit_total) }}</el-descriptions-item>
        <el-descriptions-item label="支出合計">{{ formatCurrency(preview.debit_total) }}</el-descriptions-item>
        <el-descriptions-item label="可解析銷帳號">{{ preview.with_collection_number }}</el-descriptions-item>
        <el-descriptions-item label="重複/已匯入">{{ preview.duplicate_count }}</el-descriptions-item>
        <el-descriptions-item label="錯誤列">{{ preview.error_count }}</el-descriptions-item>
        <el-descriptions-item label="解析版本">{{ preview.parser_version }}</el-descriptions-item>
      </el-descriptions>
      <el-alert
        v-if="preview?.already_imported"
        type="warning"
        :closable="false"
        class="mt-1"
        title="此檔案先前已匯入（同檔重送不會重複入帳）"
        data-test="dup-import-alert"
      />
      <div v-if="preview" class="mt-1">
        <el-button
          v-if="canWrite"
          type="success"
          data-test="run-import"
          :loading="importing"
          aria-label="確認匯入此對帳單"
          @click="runImport"
        >
          確認匯入
        </el-button>
      </div>
    </section>

    <!-- ── 步驟 2–4：交易工作台 ───────────────────────────────────── -->
    <div class="scope-row" role="group" aria-label="交易狀態檢視">
      <button
        v-for="scope in TXN_SCOPES"
        :key="scope.value || 'all'"
        type="button"
        class="scope-chip"
        :class="{ 'scope-chip--active': filters.status === scope.value }"
        :aria-pressed="filters.status === scope.value"
        :data-test="`recon-scope-${scope.value || 'all'}`"
        @click="setScope(scope.value)"
      >
        {{ scope.label }}
      </button>
    </div>

    <div class="toolbar">
      <el-input
        v-model="filters.suffix"
        placeholder="末四碼"
        aria-label="以銷帳末四碼篩選"
        maxlength="4"
        style="width: 110px"
        clearable
        @change="refetch"
      />
      <el-date-picker
        v-model="filters.date_from"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="起日"
        aria-label="入帳起日"
        style="width: 140px"
        @change="refetch"
      />
      <el-date-picker
        v-model="filters.date_to"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="迄日"
        aria-label="入帳迄日"
        style="width: 140px"
        @change="refetch"
      />
      <el-button aria-label="重新整理交易列表" @click="fetchTxns">重新整理</el-button>
    </div>

    <el-table
      :data="txns"
      size="small"
      border
      v-loading="loading"
      :row-class-name="rowClassName"
      data-test="txn-table"
    >
      <el-table-column prop="posting_date" label="入帳日" width="100" />
      <el-table-column label="金額" width="110" align="right" class-name="num-cell">
        <template #default="{ row }">
          <span :class="{ debit: row.direction === 'debit' }">
            {{ row.direction === 'debit' ? '−' : '' }}{{ formatCurrency(row.amount) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="collection_suffix" label="末四碼" width="80">
        <template #default="{ row }">{{ row.collection_suffix || '—' }}</template>
      </el-table-column>
      <el-table-column prop="summary" label="摘要" width="100" />
      <el-table-column label="狀態" width="120">
        <template #default="{ row }">
          <el-tag :type="statusTag(row.reconciliation_status)" size="small">
            {{ STATUS_LABELS[row.reconciliation_status] ?? row.reconciliation_status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="已分配/未分配" width="170" align="right" class-name="num-cell">
        <template #default="{ row }">
          <template v-if="row.direction === 'credit'">
            {{ formatCurrency(row.allocated_total) }} / {{ formatCurrency(row.unallocated) }}
          </template>
          <template v-else>—</template>
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="200">
        <template #default="{ row }">
          <template v-if="canWrite && row.direction === 'credit' && isAllocatable(row)">
            <el-button size="small" type="primary" text data-test="open-alloc" aria-label="開啟媒合與分配" @click="openAllocate(row)">
              媒合/分配
            </el-button>
          </template>
          <el-button
            v-if="canWrite && isIgnorable(row)"
            size="small"
            text
            aria-label="標記此交易為非學費"
            @click="ignoreTxn(row)"
          >
            標記非學費
          </el-button>
          <el-button
            v-if="canWrite && hasAllocation(row)"
            size="small"
            type="danger"
            text
            aria-label="沖銷此交易的分配"
            @click="reverseTxn(row)"
          >
            沖銷分配
          </el-button>
        </template>
      </el-table-column>
      <template #empty>
        <EmptyState
          v-if="!loading"
          :title="emptyTitle"
          :description="emptyDescription"
        >
          <template #action>
            <el-button
              v-if="filters.status"
              size="small"
              data-test="recon-empty-show-all"
              @click="setScope('')"
            >
              改看全部交易
            </el-button>
          </template>
        </EmptyState>
      </template>
    </el-table>
    <el-pagination
      v-model:current-page="page"
      :page-size="pageSize"
      :total="total"
      layout="prev, pager, next, total"
      @current-change="fetchTxns"
    />

    <AllocationDialog
      v-model:visible="allocVisible"
      :txn="allocTxn"
      @allocated="fetchTxns"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { formatCurrency } from '@/utils/currency'
import { hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
import {
  confirmBankImport,
  getBankTransactions,
  ignoreTransaction,
  previewBankImport,
  reverseTransaction,
} from '@/api/fees'
import AllocationDialog from './AllocationDialog.vue'
import EmptyState from '@/components/common/EmptyState.vue'

interface TxnRow {
  id: number
  posting_date: string
  direction: string
  amount: number
  collection_suffix: string | null
  summary: string | null
  reconciliation_status: string
  allocated_total: number
  unallocated: number
}
interface Preview {
  statement_start: string | null
  statement_end: string | null
  row_count: number
  credit_total: number
  debit_total: number
  with_collection_number: number
  duplicate_count: number
  error_count: number
  already_imported: boolean
  parser_version: string
}

const FLOW_STEPS = ['匯入永豐 CSV', '自動媒合建議', '處理例外（拆分/非學費/沖銷）', '確認全數分類']

const STATUS_LABELS: Record<string, string> = {
  imported: '已匯入',
  suggested: '有候選',
  partially_allocated: '部分分配',
  allocated: '已分配',
  unmatched: '未媒合',
  ignored_non_tuition: '非學費',
  reversed: '已沖銷',
}

// 檢視快篩：後端 status 為單值篩選 → 每個 chip 對應一個伺服器查詢，
// 預設鎖「待媒合」讓需要人工處理的交易優先；已分配/非學費即歷史檢視。
const TXN_SCOPES: { value: string; label: string }[] = [
  { value: 'imported', label: '待媒合' },
  { value: 'partially_allocated', label: '部分分配' },
  { value: 'allocated', label: '已分配' },
  { value: 'ignored_non_tuition', label: '非學費' },
  { value: '', label: '全部' },
]

const PENDING_STATUSES = new Set(['imported', 'suggested', 'unmatched', 'partially_allocated'])

const canWrite = computed(() => hasPermission(PERMISSION_NAMES.FEES_WRITE))

const pickedFile = ref<File | null>(null)
const preview = ref<Preview | null>(null)
const previewing = ref(false)
const importing = ref(false)

const filters = reactive<{
  status: string
  suffix: string
  date_from: string | null
  date_to: string | null
}>({ status: 'imported', suffix: '', date_from: null, date_to: null })
const txns = ref<TxnRow[]>([])
const loading = ref(false)
const page = ref(1)
const pageSize = 50
const total = ref(0)

const allocVisible = ref(false)
const allocTxn = ref<TxnRow | null>(null)

function statusTag(status: string): 'success' | 'info' | 'warning' | 'danger' | 'primary' {
  return (
    (
      {
        imported: 'info',
        suggested: 'primary',
        partially_allocated: 'warning',
        allocated: 'success',
        unmatched: 'warning',
        ignored_non_tuition: 'info',
        reversed: 'danger',
      } as const
    )[status] ?? 'info'
  )
}
function isAllocatable(row: TxnRow): boolean {
  return ['imported', 'suggested', 'unmatched', 'partially_allocated'].includes(
    row.reconciliation_status,
  )
}
function isIgnorable(row: TxnRow): boolean {
  return ['imported', 'suggested', 'unmatched'].includes(row.reconciliation_status)
}
function hasAllocation(row: TxnRow): boolean {
  return row.allocated_total > 0
}

// 檢視「全部」時弱化已完成列，讓待處理列維持視覺焦點
function rowClassName({ row }: { row: TxnRow }): string {
  if (filters.status) return ''
  return PENDING_STATUSES.has(row.reconciliation_status) ? '' : 'txn-row--settled'
}

const emptyTitle = computed(() => {
  const scope = TXN_SCOPES.find((s) => s.value === filters.status)
  return filters.status
    ? `目前沒有「${scope?.label ?? ''}」的交易`
    : '目前沒有銀行交易'
})
const emptyDescription = computed(() => {
  if (filters.suffix || filters.date_from || filters.date_to) {
    return '調整末四碼或日期篩選；或切換其他狀態檢視。'
  }
  if (!filters.status) {
    return '請先在上方選擇永豐 CSV 並完成匯入，交易會出現在此工作台。'
  }
  if (filters.status === 'imported') {
    return '沒有待媒合交易：新對帳單請先匯入 CSV；歷史交易請切換「已分配」或「全部」。'
  }
  return '此狀態目前沒有交易；可切換「全部」檢視完整歷史。'
})

function onFileChange(file: UploadFile) {
  pickedFile.value = (file.raw as File) ?? null
  preview.value = null
}

async function runPreview() {
  if (!pickedFile.value) return
  previewing.value = true
  try {
    preview.value = (await previewBankImport(pickedFile.value)) as Preview
  } catch (e) {
    ElMessage.error(friendlyError('預覽失敗', e))
  } finally {
    previewing.value = false
  }
}

async function runImport() {
  if (!pickedFile.value) return
  importing.value = true
  try {
    const result = await confirmBankImport(pickedFile.value)
    if (result.created === false) {
      ElMessage.warning('此檔先前已匯入，未重複入帳')
    } else {
      ElMessage.success(`匯入完成：${result.row_count} 筆（略過重複 ${result.duplicate_count}）`)
    }
    pickedFile.value = null
    preview.value = null
    refetch()
  } catch (e) {
    ElMessage.error(friendlyError('匯入失敗', e))
  } finally {
    importing.value = false
  }
}

async function fetchTxns() {
  loading.value = true
  try {
    const data = await getBankTransactions({
      status: filters.status || undefined,
      suffix: filters.suffix || undefined,
      date_from: filters.date_from || undefined,
      date_to: filters.date_to || undefined,
      page: page.value,
      page_size: pageSize,
    })
    txns.value = data.items as TxnRow[]
    total.value = data.total
  } catch (e) {
    ElMessage.error(friendlyError('載入交易失敗', e))
  } finally {
    loading.value = false
  }
}

function refetch() {
  page.value = 1
  fetchTxns()
}

function setScope(status: string) {
  if (filters.status === status) return
  filters.status = status
  refetch()
}

function openAllocate(row: TxnRow) {
  allocTxn.value = row
  allocVisible.value = true
}

async function ignoreTxn(row: TxnRow) {
  let reason = ''
  try {
    const result = await ElMessageBox.prompt('請輸入標記為非學費的原因', '標記非學費', {
      inputValidator: (v) => (v && v.trim().length >= 2 ? true : '原因至少 2 字'),
    })
    reason = typeof result === 'object' ? result.value : ''
  } catch {
    return
  }
  try {
    await ignoreTransaction(row.id, { reason })
    ElMessage.success('已標記非學費')
    fetchTxns()
  } catch (e) {
    ElMessage.error(friendlyError('標記失敗', e))
  }
}

async function reverseTxn(row: TxnRow) {
  let reason = ''
  try {
    const result = await ElMessageBox.prompt(
      '沖銷會以反向流水撤銷此交易的全部分配（原紀錄保留），請輸入原因',
      '沖銷分配',
      { inputValidator: (v) => (v && v.trim().length >= 5 ? true : '原因至少 5 字') },
    )
    reason = typeof result === 'object' ? result.value : ''
  } catch {
    return
  }
  try {
    await reverseTransaction(row.id, { reason })
    ElMessage.success('已沖銷，交易回到可分配狀態')
    fetchTxns()
  } catch (e) {
    ElMessage.error(friendlyError('沖銷失敗', e))
  }
}

onMounted(fetchTxns)
defineExpose({ fetchTxns, setScope, filters })
</script>

<style scoped>
.flow-strip {
  list-style: none;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
  margin: 0 0 var(--space-4);
  padding: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.flow-step {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.flow-step + .flow-step::before {
  content: '›';
  margin-right: var(--space-2);
  color: var(--el-text-color-placeholder);
}

.flow-step__num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid var(--el-border-color);
  font-size: 11px;
  color: var(--text-tertiary);
}

.import-section {
  margin-bottom: var(--space-4);
  padding: var(--space-3);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md, 6px);
  background: var(--el-fill-color-blank);
}

.import-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.file-name {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.preview-box {
  margin-top: 12px;
}

.scope-row {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-bottom: var(--space-2);
}

.scope-chip {
  padding: 4px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--radius-md, 6px);
  background: var(--el-bg-color);
  color: var(--el-text-color-regular);
  font-size: var(--text-sm);
  line-height: 1.4;
  cursor: pointer;
  transition: border-color var(--transition-fast, 0.15s), color var(--transition-fast, 0.15s);
}

.scope-chip:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

.scope-chip:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 1px;
}

.scope-chip--active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
}

.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.debit {
  color: var(--el-color-danger);
}

.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.mt-1 {
  margin-top: 8px;
}

:deep(.txn-row--settled) {
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-lighter);
}
</style>
