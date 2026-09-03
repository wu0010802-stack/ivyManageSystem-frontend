<template>
  <div class="bill-slip-tab">
    <p v-if="!embedded" class="intro">
      銀行檢核檔（Check_*.xls）＝應收唯一權威。匯入時宣告月費批／註冊費批，
      系統即可自算未繳／短繳／溢繳，不必依賴銀行核銷狀態。
    </p>

    <!-- 匯入 -->
    <section class="import-section" aria-label="匯入繳款單檢核檔">
      <div class="import-row">
        <el-upload :auto-upload="false" :show-file-list="false" accept=".xls" :on-change="onFileChange">
          <el-button
            v-if="canWrite"
            type="primary"
            data-test="pick-check-xls"
            aria-label="選擇銀行繳款單檢核檔"
          >
            選擇檢核檔
          </el-button>
        </el-upload>
        <span v-if="pickedFile" class="file-name">{{ pickedFile.name }}</span>
        <el-input
          v-if="canWrite && pickedFile"
          v-model="form.title"
          placeholder="批次名（如 115-1 註冊費）"
          aria-label="發單批次名稱"
          style="width: 220px"
          maxlength="100"
        />
        <el-input
          v-if="canWrite && pickedFile"
          v-model="form.batch_no"
          placeholder="上傳批號"
          aria-label="銀行上傳批號"
          style="width: 120px"
          maxlength="20"
        />
        <el-select
          v-if="canWrite && pickedFile"
          v-model="form.batch_kind"
          placeholder="批次類型"
          aria-label="批次類型"
          data-test="slip-kind-select"
          style="width: 130px"
        >
          <el-option
            v-for="o in BILL_SLIP_KIND_OPTIONS"
            :key="o.key"
            :value="o.key"
            :label="o.label"
          />
        </el-select>
        <el-button
          v-if="canWrite && pickedFile"
          data-test="run-preview"
          :loading="previewing"
          aria-label="安全預覽檢核檔內容（不寫入）"
          @click="runPreview"
        >
          安全預覽
        </el-button>
        <span v-if="!canWrite" class="hint">匯入需要收款寫入權限；目前為唯讀檢視</span>
      </div>

      <el-descriptions
        v-if="preview"
        :column="4"
        size="small"
        border
        class="preview-box"
        data-test="slip-preview"
      >
        <el-descriptions-item label="帳單期別">
          {{ preview.bill_year }}-{{ String(preview.bill_month ?? 0).padStart(2, '0') }}
        </el-descriptions-item>
        <el-descriptions-item label="發單筆數">{{ preview.row_count }}</el-descriptions-item>
        <el-descriptions-item label="應收合計">
          {{ formatCurrency(preview.net_total) }}
        </el-descriptions-item>
        <el-descriptions-item label="零元單">
          {{ preview.zero_amount_count }}
        </el-descriptions-item>
        <el-descriptions-item label="錯誤列">{{ preview.error_count }}</el-descriptions-item>
      </el-descriptions>
      <el-alert
        v-if="preview?.already_imported"
        type="warning"
        :closable="false"
        class="mt-1"
        title="此檔案先前已匯入（同檔重送不會重複建立）"
        data-test="dup-slip-alert"
      />
      <el-alert
        v-else-if="preview && preview.overlap_ratio >= 0.5"
        type="warning"
        :closable="false"
        class="mt-1"
        data-test="overlap-alert"
        :title="`與同期別既有批次有 ${preview.overlap_count} 個帳號重疊（${Math.round(preview.overlap_ratio * 100)}%）`"
        description="高比例重疊多半是同一批的修正版重傳。直接匯入會讓應收被重複計算、繳足的家長被判短繳——請先刪除舊批次，或填入不同的銀行上傳批號以區分（未填批號時後端會擋下）。"
      />
      <div v-if="preview" class="mt-1">
        <el-button
          v-if="canWrite"
          type="success"
          data-test="run-import"
          :loading="importing"
          :disabled="!form.title.trim() || !form.batch_kind"
          aria-label="確認匯入此發單快照"
          @click="runImport"
        >
          確認匯入
        </el-button>
        <span v-if="!form.title.trim()" class="hint">請先填批次名</span>
        <span v-if="!form.batch_kind" class="hint">請先選批次類型（月費批／註冊費批）</span>
      </div>
    </section>

    <!-- 批次清單 -->
    <el-table
      v-loading="loading"
      :data="batches"
      size="small"
      border
      data-test="slip-batch-table"
      @row-click="selectBatch"
    >
      <el-table-column label="期別" width="90">
        <template #default="{ row }">
          {{ row.bill_year }}-{{ String(row.bill_month).padStart(2, '0') }}
        </template>
      </el-table-column>
      <el-table-column prop="title" label="批次" min-width="180" />
      <el-table-column label="類型" width="110">
        <template #default="{ row }">
          <span data-test="slip-kind-cell">
            {{ BILL_SLIP_KIND_LABELS[row.batch_kind as BillSlipKind] ?? row.batch_kind }}
          </span>
          <el-button
            v-if="canWrite && row.records_generated_count === 0"
            size="small"
            text
            data-test="slip-kind-change"
            aria-label="改批次類型"
            @click.stop="openKindChange(row)"
          >
            改
          </el-button>
        </template>
      </el-table-column>
      <el-table-column prop="batch_no" label="批號" width="80">
        <template #default="{ row }">{{ row.batch_no || '—' }}</template>
      </el-table-column>
      <el-table-column label="筆數" width="80" align="right" class-name="num-cell">
        <template #default="{ row }">{{ row.row_count }}</template>
      </el-table-column>
      <el-table-column label="應收合計" width="120" align="right" class-name="num-cell">
        <template #default="{ row }">{{ formatCurrency(row.net_total) }}</template>
      </el-table-column>
      <el-table-column label="零元單" width="80" align="right" class-name="num-cell">
        <template #default="{ row }">{{ row.zero_amount_count }}</template>
      </el-table-column>
      <el-table-column label="費用單" width="90" align="right" class-name="num-cell">
        <template #default="{ row }">
          <span v-if="row.records_generated_count > 0">
            {{ row.records_generated_count }} 筆
          </span>
          <span v-else class="hint">未產生</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="260">
        <template #default="{ row }">
          <el-button
            v-if="canWrite && row.records_generated_count === 0 && row.net_total > 0"
            size="small"
            type="success"
            text
            data-test="open-generate"
            aria-label="依此批次淨額產生費用單"
            @click.stop="openGenerateDialog(row)"
          >
            產生費用單
          </el-button>
          <el-button
            size="small"
            type="primary"
            text
            data-test="open-outstanding"
            aria-label="查看此批次的未繳名單"
            @click.stop="selectBatch(row)"
          >
            未繳名單
          </el-button>
          <el-button
            v-if="canWrite"
            size="small"
            type="danger"
            text
            data-test="delete-batch"
            aria-label="刪除此發單快照批次"
            @click.stop="removeBatch(row)"
          >
            刪除
          </el-button>
        </template>
      </el-table-column>
      <template #empty>
        <EmptyState
          v-if="!loading"
          title="尚無發單快照"
          description="匯入銀行檢核檔後即可對比「誰該繳而沒繳」。"
        />
      </template>
    </el-table>

    <!-- 產生費用單（SPEC-018：一生一筆淨額單） -->
    <el-dialog
      v-model="genDialogVisible"
      title="產生費用單"
      width="600px"
      data-test="gen-dialog"
    >
      <template v-if="genPlan">
        <p class="intro">
          依批次淨額為每位學生建立一筆費用單（XLS 淨額已含請假／同胞等調整，
          代收核銷與現金收款都對這張單銷帳）。
        </p>
        <el-descriptions :column="2" size="small" border>
          <el-descriptions-item label="帳單期別">
            {{ genPlan.target_month ?? genBatch?.title }}
          </el-descriptions-item>
          <el-descriptions-item label="批次類型">
            <span data-test="gen-kind-label">
              {{ BILL_SLIP_KIND_LABELS[genPlan.batch_kind] ?? genPlan.batch_kind }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="將建立">
            {{ genPlan.created }} 筆
          </el-descriptions-item>
          <el-descriptions-item label="應收合計">
            {{ formatCurrency(genPlan.total_amount_due) }}
          </el-descriptions-item>
          <el-descriptions-item label="零元跳過">
            {{ genPlan.skipped_zero }} 筆
          </el-descriptions-item>
          <el-descriptions-item label="已產過（跳過）">
            {{ genPlan.skipped_existing }} 筆
          </el-descriptions-item>
          <el-descriptions-item label="繳費期限">
            <el-date-picker
              v-model="genDueDate"
              type="date"
              value-format="YYYY-MM-DD"
              size="small"
              :placeholder="`預設 ${genPlan.due_date}`"
              :clearable="true"
              aria-label="費用單繳費期限（留空用預設）"
            />
          </el-descriptions-item>
        </el-descriptions>
        <el-alert
          v-if="genPlan.conflicts.length"
          type="error"
          :closable="false"
          class="mt-1"
          data-test="gen-conflict-alert"
          :title="`同月已有其他來源的月費單 ${genPlan.conflicts.length} 筆，不可重複產生`"
          :description="`XLS 為主、同月互擋：${conflictNames}。請先處理既有費用單（範本產或手動建）再產生。`"
        />
        <el-alert
          v-if="genPlan.unresolved.length"
          type="warning"
          :closable="false"
          class="mt-1"
          data-test="gen-unresolved-alert"
          :title="`${genPlan.unresolved.length} 筆學生未解析（檢核檔姓名對不上在籍學生）`"
          :description="`${unresolvedNames}。可逐列指定學生後重跑，或勾選下方略過。`"
        />
        <ul v-if="genPlan.unresolved.length" class="unresolved-list">
          <li v-for="u in genPlan.unresolved" :key="u.slip_item_id">
            {{ u.student_name }}（末四碼 {{ u.collection_suffix }}，{{
              formatCurrency(u.net_amount)
            }}）
            <el-button
              v-if="canWrite"
              size="small"
              text
              type="primary"
              data-test="gen-assign-student"
              @click="openAssign(u.slip_item_id, u.student_name)"
            >
              指定學生
            </el-button>
          </li>
        </ul>
        <label v-if="genPlan.unresolved.length" class="skip-row">
          <el-checkbox
            v-model="skipUnresolved"
            data-test="gen-skip-unresolved"
            aria-label="略過未解析學生，僅為已解析學生產單"
          />
          <span>略過未解析學生（之後補配置可再產）</span>
        </label>
      </template>
      <el-skeleton v-else :rows="3" animated />
      <template #footer>
        <el-button @click="genDialogVisible = false">取消</el-button>
        <el-button
          type="success"
          data-test="gen-confirm"
          :loading="generating"
          :disabled="!canConfirmGenerate"
          @click="confirmGenerate"
        >
          確認產生
        </el-button>
      </template>
    </el-dialog>

    <!-- 未繳名單 -->
    <section v-if="report" class="report-section" data-test="outstanding-report">
      <h4>{{ report.batch.title }}（{{ report.batch.bill_year }}-{{
        String(report.batch.bill_month).padStart(2, '0')
      }}）未繳名單</h4>

      <el-alert
        v-if="report.batch.likely_missing_sibling_batch"
        type="warning"
        :closable="false"
        class="mt-1"
        data-test="missing-sibling-alert"
        title="溢繳筆數偏多，可能還有同期別的另一批發單快照未匯入"
        description="同一組繳款帳號會被註冊費批與月費批共用；只匯入其中一批時，家長把兩張單一起繳的款項會被判為溢繳。請確認是否還有其他批次的檢核檔要匯入。"
      />

      <div class="tiles">
        <div class="tile">
          <span class="tile__label">應收（本批）</span>
          <strong>{{ formatCurrency(report.totals.expected) }}</strong>
        </div>
        <div class="tile">
          <span class="tile__label">已繳</span>
          <strong>{{ formatCurrency(report.totals.paid) }}</strong>
        </div>
        <div class="tile tile--warn">
          <span class="tile__label">未收</span>
          <strong>{{ formatCurrency(report.totals.outstanding) }}</strong>
        </div>
        <div class="tile">
          <span class="tile__label">未繳人數</span>
          <strong>{{ report.totals.unpaid_count }}</strong>
        </div>
      </div>

      <div class="scope-row" role="group" aria-label="繳費狀態快篩">
        <button
          v-for="scope in OUTSTANDING_SCOPES"
          :key="scope.value || 'all'"
          type="button"
          class="scope-chip"
          :class="{ 'scope-chip--active': statusFilter === scope.value }"
          :aria-pressed="statusFilter === scope.value"
          :data-test="`outstanding-scope-${scope.value || 'all'}`"
          @click="setStatus(scope.value)"
        >
          {{ scope.label }}（{{ scopeCount(scope.value) }}）
        </button>
      </div>

      <el-table :data="report.items" size="small" border data-test="outstanding-table">
        <el-table-column prop="student_name" label="學生" width="100" />
        <el-table-column prop="classroom_name" label="班級" width="100">
          <template #default="{ row }">{{ row.classroom_name || '—' }}</template>
        </el-table-column>
        <el-table-column prop="collection_suffix" label="末四碼" width="80" />
        <el-table-column label="本批應收" width="105" align="right" class-name="num-cell">
          <template #default="{ row }">{{ formatCurrency(row.net_amount) }}</template>
        </el-table-column>
        <el-table-column label="同期應收" width="105" align="right" class-name="num-cell">
          <template #default="{ row }">
            <span :class="{ 'cross-batch': row.expected_total !== row.net_amount }">
              {{ formatCurrency(row.expected_total) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="已繳" width="105" align="right" class-name="num-cell">
          <template #default="{ row }">{{ formatCurrency(row.paid_amount) }}</template>
        </el-table-column>
        <el-table-column label="差額" width="105" align="right" class-name="num-cell">
          <template #default="{ row }">
            <span v-if="row.shortfall" class="shortfall">
              −{{ formatCurrency(row.shortfall) }}
            </span>
            <span v-else-if="row.excess" class="excess">
              +{{ formatCurrency(row.excess) }}
            </span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="狀態" width="90">
          <template #default="{ row }">
            <el-tag :type="outstandingStatusTag(row.status)" size="small">
              {{ OUTSTANDING_STATUS_LABELS[row.status] ?? row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState
            title="此狀態沒有資料"
            description="可切換上方快篩查看其他狀態。"
          />
        </template>
      </el-table>
    </section>

    <StudentPickerDialog
      v-model="assignVisible"
      title="指定發單列對應的學生"
      :hint="assignHint"
      @pick="onAssignPick"
    />

    <el-dialog
      v-model="kindDialogVisible"
      title="改批次類型"
      width="420px"
      data-test="slip-kind-dialog"
    >
      <p class="intro">
        只有尚未產生費用單的批次可改；類型決定產出的費用單種類（月費／註冊費）。
      </p>
      <el-select v-model="kindDialogValue" data-test="slip-kind-change-select" style="width: 100%">
        <el-option
          v-for="o in BILL_SLIP_KIND_OPTIONS"
          :key="o.key"
          :value="o.key"
          :label="o.label"
        />
      </el-select>
      <template #footer>
        <el-button @click="kindDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          data-test="slip-kind-change-confirm"
          :loading="kindSaving"
          @click="confirmKindChange"
        >
          確認
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * embedded＝嵌在收款工作區的「匯入紀錄」抽屜裡（2026-09-02 IA 合併）。
 * 此模式下開頭說明改由抽屜標題與工具列問號提供；單獨使用時行為與改版前相同。
 */

import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { formatCurrency } from '@/utils/currency'
import { hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
import {
  assignBillSlipItemStudent,
  deleteBillSlipBatch,
  generateBillSlipRecords,
  getBillSlipBatches,
  getOutstandingReport,
  importBillSlipBatch,
  patchBillSlipBatch,
  previewBillSlipBatch,
} from '@/api/fees'
import EmptyState from '@/components/common/EmptyState.vue'
import StudentPickerDialog from './StudentPickerDialog.vue'
import {
  BILL_SLIP_KIND_LABELS,
  BILL_SLIP_KIND_OPTIONS,
  OUTSTANDING_SCOPES,
  OUTSTANDING_STATUS_LABELS,
  outstandingStatusTag,
} from './collectionTypes'
import type {
  BillSlipBatchRow,
  BillSlipGenerateResult,
  BillSlipKind,
  BillSlipPreview,
  OutstandingReport,
} from './collectionTypes'

const { embedded } = defineProps<{ embedded?: boolean }>()

/** 產出費用單後通知父層刷新應收帳款與待辦數 */
const emit = defineEmits<{ generated: [] }>()

const canWrite = computed(() => hasPermission(PERMISSION_NAMES.FEES_WRITE))

const pickedFile = ref<File | null>(null)
const preview = ref<BillSlipPreview | null>(null)
const previewing = ref(false)
const importing = ref(false)
// SPEC-019 §6.1：檢核檔無類型資訊，匯入時由操作者宣告（未選不可送出）
const form = reactive<{ title: string; batch_no: string; batch_kind: BillSlipKind | '' }>({
  title: '',
  batch_no: '',
  batch_kind: '',
})

const batches = ref<BillSlipBatchRow[]>([])
const loading = ref(false)

const report = ref<OutstandingReport | null>(null)
const selectedBatchId = ref<number | null>(null)
const statusFilter = ref('unpaid')

function scopeCount(status: string): number {
  const t = report.value?.totals
  if (!t) return 0
  if (!status) return t.row_count
  const key = `${status}_count` as keyof typeof t
  return (t[key] as number) ?? 0
}

function onFileChange(file: UploadFile) {
  pickedFile.value = (file.raw as File) ?? null
  preview.value = null
}

async function runPreview() {
  if (!pickedFile.value) return
  previewing.value = true
  try {
    preview.value = (await previewBillSlipBatch(
      pickedFile.value,
    )) as unknown as BillSlipPreview
    if (!form.title.trim() && preview.value?.bill_year) {
      const mm = String(preview.value.bill_month ?? 0).padStart(2, '0')
      form.title = `${preview.value.bill_year}-${mm} 繳款單`
    }
  } catch (e) {
    ElMessage.error(friendlyError('預覽失敗', e))
  } finally {
    previewing.value = false
  }
}

async function runImport() {
  if (!pickedFile.value || !form.title.trim() || !form.batch_kind) return
  importing.value = true
  try {
    const result = (await importBillSlipBatch(pickedFile.value, {
      title: form.title.trim(),
      batch_no: form.batch_no.trim() || undefined,
      batch_kind: form.batch_kind,
    })) as unknown as BillSlipBatchRow
    ElMessage.success(
      result.created
        ? `已建立發單快照：${result.row_count} 筆`
        : '此檔先前已匯入（未重複建立）',
    )
    pickedFile.value = null
    preview.value = null
    form.title = ''
    form.batch_no = ''
    form.batch_kind = ''
    await fetchBatches()
    await selectBatch(result)
  } catch (e) {
    ElMessage.error(friendlyError('匯入失敗', e))
  } finally {
    importing.value = false
  }
}

async function fetchBatches() {
  loading.value = true
  try {
    batches.value = (await getBillSlipBatches()) as unknown as BillSlipBatchRow[]
  } catch (e) {
    ElMessage.error(friendlyError('載入發單批次失敗', e))
  } finally {
    loading.value = false
  }
}

async function fetchReport() {
  if (!selectedBatchId.value) return
  try {
    const params: Record<string, unknown> = {}
    if (statusFilter.value) params.status = statusFilter.value
    report.value = (await getOutstandingReport(
      selectedBatchId.value,
      params,
    )) as unknown as OutstandingReport
  } catch (e) {
    ElMessage.error(friendlyError('載入未繳名單失敗', e))
  }
}

async function selectBatch(row: BillSlipBatchRow) {
  selectedBatchId.value = row.id
  await fetchReport()
}

async function setStatus(value: string) {
  statusFilter.value = value
  await fetchReport()
}

// ===== 產生費用單（SPEC-018） =====
const genDialogVisible = ref(false)
const genBatch = ref<BillSlipBatchRow | null>(null)
const genPlan = ref<BillSlipGenerateResult | null>(null)
const skipUnresolved = ref(false)
const genDueDate = ref<string | null>(null)
const generating = ref(false)

const conflictNames = computed(() =>
  [...new Set((genPlan.value?.conflicts ?? []).map((c) => c.student_name))]
    .slice(0, 5)
    .join('、'),
)
const unresolvedNames = computed(() =>
  (genPlan.value?.unresolved ?? [])
    .slice(0, 5)
    .map((r) => r.student_name)
    .join('、'),
)
const canConfirmGenerate = computed(() => {
  const plan = genPlan.value
  if (!plan || generating.value) return false
  if (plan.conflicts.length > 0) return false
  if (plan.unresolved.length > 0 && !skipUnresolved.value) return false
  return plan.created > 0
})

async function openGenerateDialog(row: BillSlipBatchRow) {
  genBatch.value = row
  genPlan.value = null
  skipUnresolved.value = false
  genDueDate.value = null
  genDialogVisible.value = true
  try {
    genPlan.value = (await generateBillSlipRecords(row.id, {
      dry_run: true,
      skip_unresolved: false,
    })) as unknown as BillSlipGenerateResult
  } catch (e) {
    genDialogVisible.value = false
    ElMessage.error(friendlyError('預覽產單失敗', e))
  }
}

async function confirmGenerate() {
  if (!genBatch.value || !canConfirmGenerate.value) return
  generating.value = true
  try {
    const payload: {
      dry_run: boolean
      skip_unresolved: boolean
      due_date?: string
    } = {
      dry_run: false,
      skip_unresolved: skipUnresolved.value,
    }
    if (genDueDate.value) payload.due_date = genDueDate.value
    const result = (await generateBillSlipRecords(
      genBatch.value.id,
      payload,
    )) as unknown as BillSlipGenerateResult
    const extra =
      result.batch_kind === 'registration' && result.prepayment_applied
        ? `，預繳套用 ${result.prepayment_applied} 筆`
        : ''
    ElMessage.success(
      `已產生 ${result.created} 筆費用單，應收 ${formatCurrency(result.total_amount_due)}${extra}`,
    )
    if (result.prepayment_pending?.length) {
      ElMessage.warning(
        `${result.prepayment_pending.length} 位學生的預繳仍掛招生訪視，請到現金項目›新生預繳先轉正式學生`,
      )
    }
    genDialogVisible.value = false
    genPlan.value = null
    await fetchBatches()
    emit('generated')
  } catch (e) {
    ElMessage.error(friendlyError('產生費用單失敗', e))
  } finally {
    generating.value = false
  }
}

// ===== 指定學生（SPEC-019 §5.2） =====
const assignVisible = ref(false)
const assignItemId = ref<number | null>(null)
const assignHint = ref('')

function openAssign(itemId: number, name: string) {
  assignItemId.value = itemId
  assignHint.value = `檢核檔上的姓名：${name}`
  assignVisible.value = true
}

async function onAssignPick(student: { id: number; name: string }) {
  if (!genBatch.value || assignItemId.value == null) return
  try {
    await assignBillSlipItemStudent(genBatch.value.id, assignItemId.value, {
      student_id: student.id,
    })
    ElMessage.success(`已指定 ${student.name}`)
    genPlan.value = (await generateBillSlipRecords(genBatch.value.id, {
      dry_run: true,
      skip_unresolved: false,
    })) as unknown as BillSlipGenerateResult
  } catch (e) {
    ElMessage.error(friendlyError('指定學生失敗', e))
  }
}

// ===== 改批次類型（SPEC-019 §6.1） =====
const kindDialogVisible = ref(false)
const kindDialogBatch = ref<BillSlipBatchRow | null>(null)
const kindDialogValue = ref<BillSlipKind>('monthly')
const kindSaving = ref(false)

function openKindChange(row: BillSlipBatchRow) {
  kindDialogBatch.value = row
  kindDialogValue.value = row.batch_kind
  kindDialogVisible.value = true
}

async function confirmKindChange() {
  if (!kindDialogBatch.value) return
  kindSaving.value = true
  try {
    await patchBillSlipBatch(kindDialogBatch.value.id, { batch_kind: kindDialogValue.value })
    ElMessage.success('已更新批次類型')
    kindDialogVisible.value = false
    await fetchBatches()
  } catch (e) {
    ElMessage.error(friendlyError('更新批次類型失敗', e))
  } finally {
    kindSaving.value = false
  }
}

async function removeBatch(row: BillSlipBatchRow) {
  try {
    await ElMessageBox.confirm(
      `確定刪除發單快照「${row.title}」（${row.row_count} 筆）？`,
      '刪除發單快照',
      { type: 'warning', confirmButtonText: '刪除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await deleteBillSlipBatch(row.id)
    ElMessage.success('已刪除發單快照')
    if (selectedBatchId.value === row.id) {
      selectedBatchId.value = null
      report.value = null
    }
    await fetchBatches()
  } catch (e) {
    ElMessage.error(friendlyError('刪除失敗', e))
  }
}

onMounted(fetchBatches)

defineExpose({ fetchBatches })
</script>

<style scoped>
.intro {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin: 0 0 10px;
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
.mt-1 {
  margin-top: 8px;
}
.report-section {
  margin-top: 18px;
}
.report-section h4 {
  margin: 0 0 8px;
}
.tiles {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 10px 0;
}
.tile {
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 8px 14px;
  min-width: 120px;
}
.tile--warn strong {
  color: var(--el-color-danger);
}
.tile__label {
  display: block;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.tile strong {
  font-size: 17px;
  font-variant-numeric: tabular-nums;
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
.num-cell {
  font-variant-numeric: tabular-nums;
}
.shortfall {
  color: var(--el-color-danger);
}
.excess {
  color: var(--el-color-primary);
}
.cross-batch {
  font-weight: 600;
}
.unresolved-list {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 13px;
}
</style>
