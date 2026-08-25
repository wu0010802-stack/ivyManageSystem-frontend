<template>
  <div class="bank-recon-tab">
    <!-- ── 匯入卡 ─────────────────────────────────────────────────── -->
    <el-card shadow="never" class="import-card">
      <div class="import-row">
        <el-upload
          :auto-upload="false"
          :show-file-list="false"
          accept=".csv"
          :on-change="onFileChange"
        >
          <el-button v-if="canWrite" data-test="pick-csv">選擇永豐 CSV</el-button>
        </el-upload>
        <span v-if="pickedFile" class="file-name">{{ pickedFile.name }}</span>
        <el-button
          v-if="canWrite && pickedFile"
          type="primary"
          data-test="run-preview"
          :loading="previewing"
          @click="runPreview"
        >
          安全預覽
        </el-button>
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
          @click="runImport"
        >
          確認匯入
        </el-button>
      </div>
    </el-card>

    <!-- ── 交易工作台 ──────────────────────────────────────────────── -->
    <div class="toolbar">
      <el-select v-model="filters.status" clearable placeholder="狀態" style="width: 150px" @change="fetchTxns">
        <el-option v-for="(label, key) in STATUS_LABELS" :key="key" :label="label" :value="key" />
      </el-select>
      <el-input
        v-model="filters.suffix"
        placeholder="末四碼"
        maxlength="4"
        style="width: 110px"
        clearable
        @change="fetchTxns"
      />
      <el-date-picker
        v-model="filters.date_from"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="起日"
        style="width: 140px"
        @change="fetchTxns"
      />
      <el-date-picker
        v-model="filters.date_to"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="迄日"
        style="width: 140px"
        @change="fetchTxns"
      />
      <el-button @click="fetchTxns">重新整理</el-button>
    </div>

    <el-table :data="txns" size="small" border v-loading="loading" data-test="txn-table">
      <el-table-column prop="posting_date" label="入帳日" width="100" />
      <el-table-column label="金額" width="110" align="right">
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
      <el-table-column label="已分配/未分配" width="170" align="right">
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
            <el-button size="small" type="primary" text data-test="open-alloc" @click="openAllocate(row)">
              媒合/分配
            </el-button>
          </template>
          <el-button
            v-if="canWrite && isIgnorable(row)"
            size="small"
            text
            @click="ignoreTxn(row)"
          >
            標記非學費
          </el-button>
          <el-button
            v-if="canWrite && hasAllocation(row)"
            size="small"
            type="danger"
            text
            @click="reverseTxn(row)"
          >
            沖銷分配
          </el-button>
        </template>
      </el-table-column>
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

const STATUS_LABELS: Record<string, string> = {
  imported: '已匯入',
  suggested: '有候選',
  partially_allocated: '部分分配',
  allocated: '已分配',
  unmatched: '未媒合',
  ignored_non_tuition: '非學費',
  reversed: '已沖銷',
}

const canWrite = computed(() => hasPermission(PERMISSION_NAMES.FEES_WRITE))

const pickedFile = ref<File | null>(null)
const preview = ref<Preview | null>(null)
const previewing = ref(false)
const importing = ref(false)

const filters = reactive<{
  status: string | null
  suffix: string
  date_from: string | null
  date_to: string | null
}>({ status: null, suffix: '', date_from: null, date_to: null })
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
    fetchTxns()
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
defineExpose({ fetchTxns })
</script>

<style scoped>
.import-card {
  margin-bottom: 16px;
}
.import-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.file-name {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.preview-box {
  margin-top: 12px;
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
.mt-1 {
  margin-top: 8px;
}
</style>
