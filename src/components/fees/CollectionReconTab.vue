<template>
  <div class="collection-recon-tab">
    <ol v-if="!embedded" class="flow-strip" aria-label="代收對帳流程">
      <li v-for="(step, i) in FLOW_STEPS" :key="step" class="flow-step">
        <span class="flow-step__num" aria-hidden="true">{{ i + 1 }}</span>
        <span>{{ step }}</span>
      </li>
    </ol>

    <!-- 匯入：嵌入模式下預設收合，由收款工作區工具列的「匯入」觸發展開 -->
    <section
      v-if="!embedded || importOpen"
      class="import-section"
      aria-label="匯入永豐代收明細"
      data-test="collection-import-section"
    >
      <div class="import-row">
        <el-upload :auto-upload="false" :show-file-list="false" accept=".csv" :on-change="onFileChange">
          <el-button
            v-if="canWrite"
            type="primary"
            data-test="pick-cs-csv"
            aria-label="選擇永豐代收核銷明細 CSV 檔"
          >
            選擇代收明細 CSV
          </el-button>
        </el-upload>
        <span v-if="pickedFile" class="file-name">{{ pickedFile.name }}</span>
        <el-button
          v-if="canWrite && pickedFile"
          data-test="run-preview"
          :loading="previewing"
          :disabled="importing"
          aria-label="安全預覽匯入內容（不寫入）"
          @click="runPreview"
        >
          安全預覽
        </el-button>
        <span v-if="!canWrite" class="hint">匯入與媒合需要收款寫入權限；目前為唯讀檢視</span>
      </div>

      <el-descriptions
        v-if="preview"
        :column="4"
        size="small"
        border
        class="preview-box"
        data-test="import-preview"
      >
        <el-descriptions-item label="繳費日區間">
          {{ preview.statement_start }} ~ {{ preview.statement_end }}
        </el-descriptions-item>
        <el-descriptions-item label="繳費筆數">{{ preview.row_count }}</el-descriptions-item>
        <el-descriptions-item label="帳單面額合計">
          {{ formatCurrency(preview.gross_total) }}
        </el-descriptions-item>
        <el-descriptions-item label="手續費合計">
          {{ formatCurrency(preview.fee_total) }}
        </el-descriptions-item>
        <el-descriptions-item label="可解析帳號">{{ preview.decoded_count }}</el-descriptions-item>
        <el-descriptions-item label="舊期別帳號">{{ preview.old_period_count }}</el-descriptions-item>
        <el-descriptions-item label="重複/已匯入">{{ preview.duplicate_count }}</el-descriptions-item>
        <el-descriptions-item label="尚未入帳">
          <span data-test="preview-pending-count">{{ preview.pending_count }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="回填入帳日">
          <span data-test="preview-backfill-count">{{ preview.backfill_count }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="錯誤列">
          <span data-test="preview-error-count">{{ preview.error_count }}</span>
          <el-button
            v-if="previewErrors.length"
            size="small"
            text
            type="primary"
            data-test="toggle-error-rows"
            :aria-expanded="errorRowsOpen"
            aria-label="展開錯誤列原因"
            @click="errorRowsOpen = !errorRowsOpen"
          >
            {{ errorRowsOpen ? '收合' : '看原因' }}
          </el-button>
        </el-descriptions-item>
      </el-descriptions>
      <el-alert
        v-if="preview?.already_imported"
        :type="newRowCount > 0 ? 'success' : 'warning'"
        :closable="false"
        class="mt-1"
        :title="alreadyImportedTitle"
        data-test="dup-import-alert"
      />
      <el-alert
        v-if="preview && preview.pending_count > 0"
        type="info"
        :closable="false"
        class="mt-1"
        data-test="pending-rows-hint"
        :title="`本檔有 ${preview.pending_count} 筆家長已繳、銀行尚未撥款（在途）——會一併匯入並可先銷帳，入帳日待下次匯入回填`"
      />
      <div
        v-if="preview && errorRowsOpen && previewErrors.length"
        class="error-rows mt-1"
        data-test="error-rows"
      >
        <p class="error-rows__caption">以下列無法匯入（列號對應 CSV 檔案內的行數）：</p>
        <ul class="error-rows__list">
          <li v-for="e in previewErrors" :key="`${e.row_number}-${e.reason}`">
            <span class="error-rows__num">第 {{ e.row_number }} 列</span>
            <span>{{ e.reason }}</span>
          </li>
        </ul>
        <p v-if="preview.error_count > previewErrors.length" class="hint">
          僅顯示前 {{ previewErrors.length }} 列（共 {{ preview.error_count }} 列）
        </p>
      </div>
      <div v-if="preview" class="mt-1">
        <el-button
          v-if="canWrite"
          type="success"
          data-test="run-import"
          :loading="importing"
          aria-label="確認匯入此代收明細"
          @click="runImport"
        >
          確認匯入
        </el-button>
      </div>
    </section>

    <!-- 目前 refreshBatchHint() 只在匯入成功／批次完成後呼叫（皆需寫入權限），
         但把 canWrite 寫明而非依賴這個間接保證：探測時機一旦改成掛 onMounted，
         唯讀使用者就會看到一顆按下去 403 的按鈕。 -->
    <div v-if="canWrite && batchHint" class="batch-hint" data-test="batch-hint">
      <span>
        本批有 <strong>{{ batchHint.count }}</strong> 筆可一鍵入帳（{{
          formatCurrency(batchHint.total)
        }}）
      </span>
      <el-button type="primary" size="small" data-test="open-batch" @click="openBatch">
        批次媒合
      </el-button>
    </div>

    <CollectionBatchDrawer
      v-model:visible="batchVisible"
      :import-id="lastImportId"
      @done="onBatchDone"
    />

    <!-- 工作台 -->
    <div class="scope-row" role="group" aria-label="繳費狀態檢視">
      <button
        v-for="scope in COLLECTION_SCOPES"
        :key="scope.value || 'all'"
        type="button"
        class="scope-chip"
        :class="{ 'scope-chip--active': filters.status === scope.value }"
        :aria-pressed="filters.status === scope.value"
        :data-test="`collection-scope-${scope.value || 'all'}`"
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
        placeholder="繳費起日"
        aria-label="顧客繳費起日"
        style="width: 150px"
        @change="refetch"
      />
      <el-date-picker
        v-model="filters.date_to"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="繳費迄日"
        aria-label="顧客繳費迄日"
        style="width: 150px"
        @change="refetch"
      />
      <el-select
        v-model="filters.posting_state"
        placeholder="入帳狀態"
        aria-label="以入帳狀態篩選"
        style="width: 150px"
        clearable
        data-test="posting-state-filter"
        @change="refetch"
      >
        <el-option label="已入帳" value="posted" />
        <el-option label="尚未入帳" value="pending" />
        <el-option label="逾期未入帳" value="overdue" />
      </el-select>
      <el-button aria-label="重新整理繳費列表" @click="fetchPayments">重新整理</el-button>
      <el-button
        v-if="canWrite && !embedded"
        data-test="open-coverage"
        aria-label="勾稽存摺代收批次入帳"
        @click="openCoverage"
      >
        存摺勾稽
      </el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="payments"
      size="small"
      border
      data-test="collection-table"
    >
      <el-table-column prop="customer_paid_date" label="繳費日" width="105" />
      <el-table-column prop="channel" label="通路" width="80" />
      <el-table-column label="帳單面額" width="110" align="right" class-name="num-cell">
        <template #default="{ row }">{{ formatCurrency(row.gross_amount) }}</template>
      </el-table-column>
      <el-table-column label="手續費" width="80" align="right" class-name="num-cell">
        <template #default="{ row }">
          <span v-if="row.fee_amount">{{ formatCurrency(row.fee_amount) }}</span>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column prop="full_collection_number" label="銷帳碼" width="175">
        <template #default="{ row }">
          <span v-if="row.full_collection_number" class="collection-number">{{ row.full_collection_number }}</span>
          <template v-else>
            <span>未提供</span>
            <div v-if="row.collection_suffix" class="hint">末四碼 {{ row.collection_suffix }}</div>
          </template>
        </template>
      </el-table-column>
      <el-table-column label="帳單期別" width="105">
        <template #default="{ row }">
          <el-tag v-if="isOldPeriod(row)" size="small" type="warning" data-test="old-period-tag">
            {{ billPeriodLabel(row) }}
          </el-tag>
          <span v-else>{{ billPeriodLabel(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="入帳" width="135">
        <template #default="{ row }">
          <el-tag
            v-if="row.overdue_pending"
            size="small"
            type="danger"
            data-test="overdue-pending-tag"
          >
            逾期未入帳
          </el-tag>
          <el-tag
            v-else-if="row.is_pending"
            size="small"
            type="warning"
            data-test="pending-tag"
          >
            {{ pendingLabel(row) }}
          </el-tag>
          <span v-else data-test="posting-date">{{ row.posting_date }}</span>
        </template>
      </el-table-column>
      <el-table-column label="狀態" width="110">
        <template #default="{ row }">
          <el-tag :type="statusTag(row.reconciliation_status)" size="small">
            {{ COLLECTION_STATUS_LABELS[row.reconciliation_status] ?? row.reconciliation_status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="未媒合原因" min-width="260">
        <template #default="{ row }">
          <div class="match-reasons">
            <div v-for="(reason, index) in matchReasonLines(row)" :key="index" data-test="match-reason">{{ reason }}</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="已分配/未分配" width="165" align="right" class-name="num-cell">
        <template #default="{ row }">
          {{ formatCurrency(row.allocated_total) }} / {{ formatCurrency(row.unallocated) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="170">
        <template #default="{ row }">
          <el-button
            v-if="canWrite && isAllocatable(row)"
            size="small"
            type="primary"
            text
            data-test="open-alloc"
            aria-label="開啟媒合與分配"
            @click="openAllocate(row)"
          >
            媒合/分配
          </el-button>
          <el-button
            v-if="canWrite && row.allocated_total > 0"
            size="small"
            type="danger"
            text
            aria-label="沖銷此繳費的分配"
            @click="reversePayment(row)"
          >
            沖銷分配
          </el-button>
        </template>
      </el-table-column>
      <template #empty>
        <EmptyState v-if="!loading" :title="emptyTitle" :description="emptyDescription">
          <template #action>
            <el-button
              v-if="filters.status"
              size="small"
              data-test="collection-empty-show-all"
              @click="setScope('')"
            >
              改看全部繳費
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
      @current-change="fetchPayments"
    />

    <CollectionAllocationDialog
      v-model:visible="allocVisible"
      :payment="allocPayment"
      @allocated="fetchPayments"
    />

    <!-- 存摺勾稽 -->
    <el-dialog v-model="coverageVisible" title="存摺代收批次勾稽" width="640px" data-test="coverage-dialog">
      <p class="coverage-hint">
        超商／農漁代收在存摺上是每日一筆整批入帳；勾稽比對「同入帳日代收淨額小計」，
        吻合者標記為已由代收明細覆蓋，不再重複計收入。
      </p>
      <div class="coverage-range">
        <el-date-picker
          v-model="coverage.date_from"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="入帳起日"
          aria-label="勾稽入帳起日"
          style="width: 150px"
        />
        <el-date-picker
          v-model="coverage.date_to"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="入帳迄日"
          aria-label="勾稽入帳迄日"
          style="width: 150px"
        />
        <el-button :loading="coverageLoading" data-test="coverage-preview" @click="runCoverage(true)">
          預覽
        </el-button>
      </div>
      <el-table v-if="coverageDays.length" :data="coverageDays" size="small" border class="mt-1">
        <el-table-column prop="posting_date" label="入帳日" width="110" />
        <el-table-column label="代收淨額" width="120" align="right">
          <template #default="{ row }">{{ formatCurrency(row.collection_net_total) }}</template>
        </el-table-column>
        <el-table-column prop="collection_count" label="筆數" width="70" align="right" />
        <el-table-column label="存摺金額" width="120" align="right">
          <template #default="{ row }">{{ formatCurrency(row.passbook_total) }}</template>
        </el-table-column>
        <el-table-column label="勾稽" width="90">
          <template #default="{ row }">
            <el-tag :type="row.matched ? 'success' : 'danger'" size="small">
              {{ row.matched ? '吻合' : '差異' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="coverageVisible = false">關閉</el-button>
        <el-button
          type="primary"
          data-test="coverage-apply"
          :loading="coverageLoading"
          :disabled="!coverageDays.some((d) => d.matched)"
          @click="runCoverage(false)"
        >
          套用標記
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile } from 'element-plus'
import type { ApiQuery } from '@/api/_generated/typed'
import { friendlyError } from '@/utils/errorMessages'
import { formatCurrency } from '@/utils/currency'
import { hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
import {
  batchCollectionCandidates,
  confirmCollectionImport,
  getCollectionPayments,
  previewCollectionImport,
  reconcileCollectionCoverage,
  reverseCollectionPayment,
} from '@/api/fees'
import CollectionAllocationDialog from './CollectionAllocationDialog.vue'
import CollectionBatchDrawer from './CollectionBatchDrawer.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import {
  COLLECTION_PENDING_STATUSES,
  COLLECTION_SCOPES,
  COLLECTION_STATUS_LABELS,
  billPeriodLabel,
  isOldPeriod,
} from './collectionTypes'
import type {
  CollectionImportPreview,
  CollectionPaymentRow,
  CollectionPostingState,
  CoverageDay,
  CoveragePair,
} from './collectionTypes'

/**
 * embedded＝嵌在收款工作區的「入帳媒合」檢視裡（2026-09-02 IA 合併）。
 * 此模式下流程說明改由工具列的問號 popover 提供、匯入面板收合成工具列按鈕、
 * 「存摺勾稽」上移到工具列；元件單獨使用時（embedded=false）行為與改版前逐字相同。
 */
const { embedded } = defineProps<{ embedded?: boolean }>()

const importOpen = ref(false)

function openImport() {
  importOpen.value = true
}

const FLOW_STEPS = [
  '匯入永豐代收明細',
  '帳號錨定自動媒合',
  '處理例外（舊期別/拆分/沖銷）',
  '存摺勾稽收尾',
]

const canWrite = computed(() => hasPermission(PERMISSION_NAMES.FEES_WRITE))

const pickedFile = ref<File | null>(null)
const preview = ref<CollectionImportPreview | null>(null)
const previewedFile = ref<File | null>(null)
let previewSequence = 0
const previewing = ref(false)
const importing = ref(false)
const errorRowsOpen = ref(false)
/** 後端 preview 一定帶 errors（最多 50 筆）；?? [] 是為了不讓舊快取／缺欄位炸掉整頁。 */
const previewErrors = computed(() => preview.value?.errors ?? [])

/** 本檔尚未入帳過的列數（＝確認匯入會新增幾筆）。 */
const newRowCount = computed(() =>
  preview.value ? Math.max(0, preview.value.row_count - preview.value.duplicate_count) : 0,
)
/**
 * 同檔重送先前一律「不會重複入帳」，但 parser 升版後會重新解析並補進舊版
 * 漏掉的列（如在途列）——此時再說「重送沒用」會讓人以為按了也沒差。
 */
const alreadyImportedTitle = computed(() =>
  newRowCount.value > 0
    ? `此檔案先前已匯入，但其中 ${newRowCount.value} 筆先前沒被收下——確認匯入會補進來，既有列不會重複入帳`
    : '此檔案先前已匯入（同檔重送不會重複入帳）',
)

/** 在途列顯示「未入帳」＋預計入帳日（有預計日才附上，避免顯示 undefined）。 */
function pendingLabel(row: CollectionPaymentRow): string {
  if (!row.expected_posting_date) return '未入帳'
  return `未入帳（預計 ${row.expected_posting_date.slice(5)}）`
}

const batchVisible = ref(false)
const lastImportId = ref<number | null>(null)
const batchHint = ref<{ count: number; total: number } | null>(null)

function openBatch() {
  batchVisible.value = true
}

/** 匯入後探一次可批次筆數——只為決定要不要顯示提示條 */
async function refreshBatchHint(importId: number | null) {
  try {
    const data = (await batchCollectionCandidates({
      import_id: importId,
      limit: 200,
    } as never)) as unknown as { auto_high_count: number; auto_high_total: number }
    batchHint.value =
      data.auto_high_count > 0
        ? { count: data.auto_high_count, total: data.auto_high_total }
        : null
  } catch {
    batchHint.value = null // 提示條是加分項，探測失敗不打擾會計
  }
}

async function onBatchDone() {
  await fetchPayments()
  await refreshBatchHint(lastImportId.value)
}

const filters = reactive<{
  status: string
  suffix: string
  date_from: string | null
  date_to: string | null
  posting_state: CollectionPostingState | null
}>({
  status: 'imported',
  suffix: '',
  date_from: null,
  date_to: null,
  posting_state: null,
})
const payments = ref<CollectionPaymentRow[]>([])
const loading = ref(false)
const page = ref(1)
const pageSize = 50
const total = ref(0)

const allocVisible = ref(false)
const allocPayment = ref<CollectionPaymentRow | null>(null)

const coverageVisible = ref(false)
const coverageLoading = ref(false)
const coverage = reactive<{ date_from: string | null; date_to: string | null }>({
  date_from: null,
  date_to: null,
})
const coverageDays = ref<CoverageDay[]>([])

const emptyTitle = computed(() =>
  filters.status === 'imported' ? '沒有待媒合的繳費' : '查無符合條件的繳費紀錄',
)
const emptyDescription = computed(() =>
  filters.status === 'imported'
    ? '本區只列出尚未分配的代收繳費；匯入新的代收明細後會出現在這裡。'
    : '可調整狀態、末四碼或繳費日區間再查一次。',
)

function statusTag(status: string): 'success' | 'info' | 'warning' | 'danger' | 'primary' {
  if (status === 'allocated') return 'success'
  if (status === 'partially_allocated') return 'warning'
  if (status === 'unmatched') return 'danger'
  return 'info'
}

/** 顯示即時媒合診斷；未分配但已有高信心候選不屬於媒合失敗。 */
function matchReasonLines(row: CollectionPaymentRow): string[] {
  if (row.reconciliation_status === 'allocated' || row.reconciliation_status === 'reversed') return ['—']
  if (row.match_level === 'auto_high') return ['可自動媒合／待確認', ...(row.match_reasons ?? [])]
  return row.match_reasons?.length ? row.match_reasons : ['尚未取得媒合結果']
}

function isAllocatable(row: CollectionPaymentRow): boolean {
  return COLLECTION_PENDING_STATUSES.has(row.reconciliation_status)
}

function onFileChange(file: UploadFile) {
  previewSequence++
  previewing.value = false
  previewedFile.value = null
  pickedFile.value = (file.raw as File) ?? null
  preview.value = null
  errorRowsOpen.value = false
}

async function runPreview() {
  const file = pickedFile.value
  if (!file || importing.value) return
  const sequence = ++previewSequence
  preview.value = null
  previewedFile.value = null
  previewing.value = true
  try {
    const result = (await previewCollectionImport(file)) as unknown as CollectionImportPreview
    if (sequence !== previewSequence || pickedFile.value !== file) return
    preview.value = result
    previewedFile.value = file
  } catch (e) {
    if (sequence === previewSequence) ElMessage.error(friendlyError('預覽失敗', e))
  } finally {
    if (sequence === previewSequence) previewing.value = false
  }
}

async function runImport() {
  const file = previewedFile.value
  if (!file || file !== pickedFile.value || !preview.value || previewing.value || importing.value) return
  const sequence = previewSequence
  importing.value = true
  try {
    const result = (await confirmCollectionImport(file)) as unknown as {
      id: number
      row_count: number
      created: boolean | null
    }
    ElMessage.success(
      result.created ? `已匯入 ${result.row_count} 筆代收繳費` : '此檔先前已匯入（未重複入帳）',
    )
    if (sequence === previewSequence && pickedFile.value === file) {
      pickedFile.value = null
      preview.value = null
      previewedFile.value = null
    }
    lastImportId.value = result.id
    await refreshBatchHint(lastImportId.value)
    await fetchPayments()
  } catch (e) {
    ElMessage.error(friendlyError('匯入失敗', e))
  } finally {
    importing.value = false
  }
}

let querySequence = 0
async function fetchPayments() {
  const sequence = ++querySequence
  payments.value = []
  total.value = 0
  loading.value = true
  try {
    const params: ApiQuery<'/fees/collection-payments', 'get'> = {
      page: page.value,
      page_size: pageSize,
      include_match_details: true,
    }
    if (filters.status) params.status = filters.status
    if (filters.suffix) params.suffix = filters.suffix
    if (filters.date_from) params.date_from = filters.date_from
    if (filters.date_to) params.date_to = filters.date_to
    if (filters.posting_state) params.posting_state = filters.posting_state
    const data = (await getCollectionPayments(params)) as unknown as {
      items: CollectionPaymentRow[]
      total: number
    }
    if (sequence !== querySequence) return
    payments.value = data.items ?? []
    total.value = data.total ?? 0
  } catch (e) {
    if (sequence === querySequence) ElMessage.error(friendlyError('載入代收繳費失敗', e))
  } finally {
    if (sequence === querySequence) loading.value = false
  }
}

function refetch() {
  page.value = 1
  fetchPayments()
}

function setScope(value: string) {
  filters.status = value
  refetch()
}

function openAllocate(row: CollectionPaymentRow) {
  allocPayment.value = row
  allocVisible.value = true
}

async function reversePayment(row: CollectionPaymentRow) {
  let reason = ''
  try {
    const result = await ElMessageBox.prompt('請輸入沖銷原因（至少 5 字）', '沖銷分配', {
      inputValidator: (v) => (v && v.trim().length >= 5 ? true : '原因至少 5 個字'),
    })
    reason = typeof result === 'object' ? result.value : ''
  } catch {
    return
  }
  try {
    await reverseCollectionPayment(row.id, { reason } as never)
    ElMessage.success('已沖銷分配')
    await fetchPayments()
  } catch (e) {
    ElMessage.error(friendlyError('沖銷失敗', e))
  }
}

function openCoverage() {
  coverageDays.value = []
  coverageVisible.value = true
}

async function runCoverage(dryRun: boolean) {
  if (!coverage.date_from || !coverage.date_to) {
    ElMessage.warning('請先選擇入帳日區間')
    return
  }
  coverageLoading.value = true
  try {
    const result = (await reconcileCollectionCoverage({
      date_from: coverage.date_from,
      date_to: coverage.date_to,
      dry_run: dryRun,
    } as never)) as unknown as {
      covered_count: number
      matched_pairs: CoveragePair[]
      days: CoverageDay[]
    }
    coverageDays.value = result.days ?? []
    if (!dryRun) {
      ElMessage.success(`已標記 ${result.covered_count} 筆存摺交易為代收覆蓋`)
    }
  } catch (e) {
    ElMessage.error(friendlyError('勾稽失敗', e))
  } finally {
    coverageLoading.value = false
  }
}

onMounted(fetchPayments)
defineExpose({ fetchPayments, openCoverage, openImport, openBatch, setScope, filters })
</script>

<style scoped>
.flow-strip {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  list-style: none;
  padding: 8px 0;
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.flow-step {
  display: flex;
  gap: 6px;
  align-items: center;
}
.flow-step__num {
  display: inline-flex;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--el-fill-color);
  align-items: center;
  justify-content: center;
  font-size: 11px;
}
.import-section {
  margin-bottom: 12px;
}
.import-row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.file-name {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.preview-box {
  margin-top: 10px;
}
.error-rows {
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
}
.error-rows__caption {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.error-rows__list {
  max-height: 220px;
  overflow-y: auto;
  margin: 0;
  padding-left: 0;
  list-style: none;
  font-size: 13px;
}
.error-rows__list li {
  display: flex;
  gap: 10px;
  padding: 3px 0;
}
.error-rows__num {
  flex: 0 0 76px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.batch-hint {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 4px;
  background: var(--el-color-primary-light-9);
  font-size: 13px;
}
.scope-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.scope-chip {
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-blank);
  border-radius: 999px;
  padding: 3px 12px;
  font-size: 13px;
  cursor: pointer;
}
.scope-chip--active {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.mt-1 {
  margin-top: 8px;
}
.num-cell {
  font-variant-numeric: tabular-nums;
}
.collection-number {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.match-reasons {
  white-space: normal;
  overflow-wrap: anywhere;
}
.coverage-hint {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin: 0 0 10px;
}
.coverage-range {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
