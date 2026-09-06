<template>
  <div class="signoff-panel">
    <p class="so-sub">{{ config.texts.headerSub }}</p>

    <!-- 流程摘要列（可點擊套用篩選；不做四張相同 KPI 卡） -->
    <SignoffFlowSummary
      v-loading="summaryLoading"
      :summary="summary"
      :active="filters.flow"
      :direction="config.key"
      :period-label="rangeLabel"
      @select="onFlowSelect"
    />

    <!-- 篩選：搜尋／類別／收付方式走標準 toolbar；日期與清除放 actions slot -->
    <AdminListToolbar
      :search="searchInput"
      :search-placeholder="config.texts.searchPlaceholder"
      :filters="toolbarFilters"
      :filter-values="toolbarFilterValues"
      :total="total"
      exportable
      :exporting="exporting"
      @update:search="onSearchInput"
      @update:filter-values="onToolbarFilterChange"
      @export="handleExport"
    >
      <template #actions>
        <el-date-picker
          v-model="filters.dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="開始日期"
          end-placeholder="結束日期"
          value-format="YYYY-MM-DD"
          class="so-date-range"
          @change="refresh"
        />
        <el-button
          v-if="hasActiveFilters"
          text
          data-test="clear-filters"
          @click="clearFilters"
        >清除篩選</el-button>
        <!-- 批次簽收：桌面表格勾選待補憑證列後啟用（卡片模式無多選） -->
        <el-button
          v-if="!isMobile && canWrite"
          class="so-toolbar__batch-btn"
          :disabled="selectedRows.length === 0"
          data-test="batch-sign-btn"
          @click="openBatchSign"
        >批次簽收（{{ selectedRows.length }}）</el-button>
      </template>
    </AdminListToolbar>

    <!-- 桌面：表格；行動：卡片列表（不做水平捲動表格） -->
    <TableSkeleton v-if="loading && !items.length" :columns="7" :rows="6" />

    <AdminListCards
      v-else-if="isMobile"
      :items="items"
      :columns="mobileColumns"
      row-key="id"
      :loading="loading"
      data-test="signoff-cards"
    >
      <template #empty>
        <EmptyState
          :title="hasActiveFilters ? '目前篩選條件下沒有符合的紀錄' : config.texts.emptyTitle"
          :description="hasActiveFilters ? '' : config.texts.emptyHint"
        >
          <template #action>
            <el-button v-if="hasActiveFilters" text type="primary" @click="clearFilters">
              清除篩選條件
            </el-button>
            <el-button
              v-else-if="canWrite"
              type="primary"
              data-test="empty-create-cta"
              @click="openCreate"
            >{{ config.texts.addButton }}</el-button>
          </template>
        </EmptyState>
      </template>
      <template #title="{ item }">
        <button type="button" class="so-card-title" @click="openEdit(item)">
          {{ item[config.fields.partyName.key] }}
        </button>
      </template>
      <template #cell-amount="{ item }">
        <span class="so-amount">{{ formatMoney(item.amount) }}</span>
      </template>
      <template #actions="{ item }">
        <el-button
          v-if="rowPrimaryAction(item)"
          type="primary"
          :disabled="rowPrimaryDisabled(item)"
          @click="runPrimaryAction(item)"
        >{{ rowPrimaryAction(item)!.label }}</el-button>
        <el-button @click="openEdit(item)">詳細資料</el-button>
      </template>
    </AdminListCards>

    <el-table
      v-else
      ref="tableRef"
      :data="items"
      v-loading="loading && items.length > 0"
      row-key="id"
      class="so-table"
      @row-click="onRowClick"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="46" :selectable="selectableRow" />
      <el-table-column label="單據日期" width="128">
        <template #default="{ row }">
          <span :class="{ 'so-muted': !row.payment_date }">{{ rowDateText(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="config.fields.partyName.label" min-width="150">
        <template #default="{ row }">
          <span class="so-party">{{ row[config.fields.partyName.key] }}</span>
        </template>
      </el-table-column>
      <el-table-column v-if="config.category" :label="config.category.label" width="100">
        <template #default="{ row }">
          {{ config.category.labelOf(String(row.category ?? '')) }}
        </template>
      </el-table-column>
      <el-table-column label="金額" width="128" align="right" class-name="num-cell">
        <template #default="{ row }">
          <span class="so-amount">{{ formatMoney(row.amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="流程狀態" min-width="150">
        <template #default="{ row }">
          <span class="so-status" :class="`so-status--${statusChip(row).tone}`">
            {{ statusChip(row).label }}
          </span>
          <span
            v-if="row.settlement_status === 'settled'"
            class="so-status so-status--evidence"
          >{{ evidenceStatusLabel(String(row.status)) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="目前待辦" width="112">
        <template #default="{ row }">
          <span :class="{ 'so-muted': !rowPrimaryAction(row) }">
            {{ rowPrimaryAction(row)?.label ?? '流程完成' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="168" fixed="right" align="right">
        <template #default="{ row }">
          <div class="so-actions" @click.stop>
            <el-tooltip
              v-if="rowPrimaryAction(row) && rowSelfBlockReason(row)"
              :content="rowSelfBlockReason(row)!"
              placement="top"
            >
              <span>
                <el-button size="small" type="primary" disabled>
                  {{ rowPrimaryAction(row)!.label }}
                </el-button>
              </span>
            </el-tooltip>
            <el-button
              v-else-if="rowPrimaryAction(row) && hasPermission(rowPrimaryAction(row)!.permission)"
              size="small"
              type="primary"
              @click="runPrimaryAction(row)"
            >{{ rowPrimaryAction(row)!.label }}</el-button>

            <el-dropdown trigger="click" @command="(c: string) => onRowCommand(c, row)">
              <el-button size="small" class="so-actions__more" aria-label="更多操作">⋯</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit">
                    {{ isRecordEditable(asControlRecord(row)) && canWrite ? '編輯' : '檢視' }}
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-if="canWrite && isRecordDeletable(asControlRecord(row))"
                    command="delete"
                    divided
                  >刪除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </el-table-column>

      <template #empty>
        <EmptyState
          :title="hasActiveFilters ? '目前篩選條件下沒有符合的紀錄' : config.texts.emptyTitle"
          :description="hasActiveFilters ? '' : config.texts.emptyHint"
        >
          <template #action>
            <el-button v-if="hasActiveFilters" text type="primary" @click="clearFilters">
              清除篩選條件
            </el-button>
            <el-button
              v-else-if="canWrite"
              type="primary"
              data-test="empty-create-cta"
              @click="openCreate"
            >{{ config.texts.addButton }}</el-button>
          </template>
        </EmptyState>
      </template>
    </el-table>

    <div class="so-pagination">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        background
        layout="total, sizes, prev, pager, next"
        @current-change="fetchList"
        @size-change="fetchList"
      />
    </div>

    <!-- 詳細資料 / 編輯 / 新增 Dialog -->
    <FormDialog
      ref="formDialogRef"
      v-model="dialogVisible"
      :title="dialogTitle"
      size="standardNarrow"
      :dirty="isFormDirty"
      class="so-dialog"
    >
      <!-- 頂部：流程狀態與鎖定說明 -->
      <div v-if="editingId" class="so-flow-head">
        <span class="so-status" :class="`so-status--${statusChip(form).tone}`">
          {{ statusChip(form).label }}
        </span>
        <span class="so-status so-status--evidence">
          {{ evidenceStatusLabel(form.status) }}
        </span>
        <span
          v-if="form.reconciliation_status === 'reconciled'"
          class="so-status so-status--signed"
        >已對帳</span>
        <span v-if="form.rejection_reason" class="so-flow-head__reject">
          駁回原因：{{ form.rejection_reason }}
        </span>
      </div>
      <el-alert
        v-if="editingId && formLockReason"
        type="info"
        :closable="false"
        class="so-lock-alert"
        show-icon
        :title="formLockReason"
        data-test="lock-reason"
      />

      <el-form
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-position="top"
        class="so-form"
        @submit.prevent
      >
        <FormSection :title="config.texts.formSectionTitle">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item :label="config.texts.plannedDateLabel" prop="plannedDate">
                <el-date-picker
                  v-model="form.plannedDate"
                  type="date"
                  value-format="YYYY-MM-DD"
                  placeholder="選填，用於排程提醒"
                  style="width: 100%"
                  :disabled="isFormLocked"
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="收付方式" prop="paymentMethod">
                <el-select v-model="form.paymentMethod" style="width: 100%" :disabled="isFormLocked">
                  <el-option
                    v-for="opt in paymentMethodOptions"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item :label="config.texts.formPartyLabel" prop="partyName">
            <el-input
              v-model="form.partyName"
              maxlength="120"
              :disabled="isFormLocked"
              :placeholder="config.texts.formPartyPlaceholder"
            />
          </el-form-item>
          <el-form-item v-if="config.category" :label="config.category.label" prop="category">
            <el-select v-model="form.category" style="width: 100%" :disabled="isFormLocked">
              <el-option
                v-for="opt in config.category.options"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="金額" prop="amount">
            <el-input-number
              v-model="form.amount"
              :min="1"
              :max="99999999"
              :precision="0"
              :step="100"
              controls-position="right"
              style="width: 100%"
              :disabled="isFormLocked"
            />
            <span class="so-form__amount-echo">{{ formatMoney(form.amount) }}</span>
          </el-form-item>
          <el-form-item v-if="form.payment_date" :label="config.texts.actualDateLabel">
            <el-input :model-value="form.payment_date" disabled />
            <div class="form-hint">實際{{ config.texts.unitLabel }}日由「{{ config.texts.settleAction }}」流程寫入，不可手動修改</div>
          </el-form-item>
        </FormSection>

        <FormSection title="補充資料" collapsible :default-open="false">
          <el-form-item label="項目／說明">
            <el-input
              v-model="form.description"
              maxlength="255"
              :disabled="isFormLocked"
              :placeholder="config.texts.descPlaceholder"
            />
          </el-form-item>
          <el-form-item :label="config.fields.docNumber.label">
            <el-input v-model="form.docNumber" maxlength="60" :disabled="isFormLocked" />
          </el-form-item>
          <el-form-item label="備註">
            <el-input v-model="form.notes" type="textarea" :rows="2" :disabled="isFormLocked" />
          </el-form-item>
          <el-form-item v-if="form.transaction_ref" label="交易參考號">
            <el-input :model-value="form.transaction_ref" disabled />
          </el-form-item>
        </FormSection>

        <FormSection v-if="editingId" :title="config.texts.signTitle">
          <div v-if="form.status === 'signed'" class="so-signed-block">
            <div class="so-signed-block__info">
              <span class="so-status so-status--signed">已附憑證</span>
              <span>{{ form.signer_name || '—' }}</span>
              <span class="so-muted">{{ formatDateTime(form.signed_at) }}・{{ signKindLabel(form.signature_kind) }}</span>
            </div>
            <a
              v-if="form.has_signature"
              :href="signatureUrl(editingId)"
              target="_blank"
              class="so-signed-block__thumb"
            >
              <img :src="signatureUrl(editingId)" alt="收付憑證" />
            </a>
          </div>
          <div v-else class="so-signed-block so-signed-block--pending">
            <span class="so-muted" data-test="upload-cert-hint">
              {{ canSignFromDialog ? config.texts.signedCertHint : '尚未核准，核准後才能上傳憑證' }}
            </span>
            <el-button
              v-if="canWrite && canSignFromDialog"
              size="small"
              type="primary"
              data-test="upload-cert-btn"
              @click="openSignFromDialog"
            >上傳憑證</el-button>
          </div>
        </FormSection>

        <FormSection v-if="editingId" title="單據附件">
          <div class="so-attachments">
            <div v-if="!form.attachments?.length" class="so-muted so-attachments__empty">
              {{ config.texts.attachmentsHint }}
            </div>
            <div class="so-attachments__grid">
              <div v-for="att in form.attachments || []" :key="att.key" class="so-att">
                <a
                  :href="downloadAttachmentUrl(editingId, att.key)"
                  target="_blank"
                  class="so-att__preview"
                  :title="att.filename"
                >
                  <img
                    v-if="isImageAttachment(att)"
                    :src="downloadAttachmentUrl(editingId, att.key)"
                    :alt="att.filename"
                  />
                  <span v-else class="so-att__doc" aria-hidden="true">PDF</span>
                </a>
                <div class="so-att__meta">
                  <span class="so-att__name" :title="att.filename">{{ att.filename }}</span>
                  <span class="so-att__size">{{ formatSize(att.size) }}</span>
                </div>
                <el-button
                  v-if="canWrite && canMutateAttachments"
                  size="small"
                  link
                  type="danger"
                  class="so-att__remove"
                  @click="removeAttachment(att.key)"
                >移除</el-button>
              </div>
            </div>
            <el-upload
              v-if="canWrite && canAddAttachments && (form.attachments?.length || 0) < 5"
              :auto-upload="true"
              :http-request="handleAttachmentUpload"
              :show-file-list="false"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              class="so-attachments__upload"
            >
              <el-button size="small" plain>＋ 上傳附件</el-button>
            </el-upload>
          </div>
        </FormSection>

        <FormSection v-if="editingId" title="流程紀錄">
          <SignoffTimeline :events="events" :loading="eventsLoading" />
        </FormSection>

        <p v-if="editingId && form.created_by_name" class="so-form__audit">
          建立：{{ form.created_by_name }}・{{ formatDateTime(form.created_at) }}
        </p>
      </el-form>

      <template #footer>
        <div class="so-dialog-footer">
          <span v-if="approveSelfBlocked" class="so-dialog-footer__hint" data-test="self-approve-hint">
            不可核准自己建立的單據
          </span>
          <span v-else-if="reconcileSelfBlocked && showReconcileActions" class="so-dialog-footer__hint">
            不可對帳自己確認{{ config.texts.unitLabel }}的交易
          </span>
          <el-button @click="formDialogRef?.requestClose()">取消</el-button>

          <!-- 草稿 / 被駁回：儲存草稿與送出審核是不同動作 -->
          <template v-if="!isFormLocked && canWrite">
            <el-button :loading="saving" data-test="save-draft" @click="handleSave">
              儲存草稿
            </el-button>
            <el-button
              type="primary"
              :loading="saving"
              data-test="save-submit"
              @click="handleSaveAndSubmit"
            >{{ form.approval_status === 'rejected' ? '重新送審' : '送出審核' }}</el-button>
          </template>

          <!-- 送審中：核准 / 駁回（Checker；建立者本人 disabled） -->
          <template v-else-if="showApproveActions">
            <el-button
              type="danger"
              plain
              :disabled="approveSelfBlocked"
              data-test="reject-btn"
              @click="handleReject"
            >駁回</el-button>
            <el-button
              type="primary"
              :disabled="approveSelfBlocked"
              data-test="approve-btn"
              @click="handleApprove"
            >核准</el-button>
          </template>

          <!-- 已核准未收付：確認收付 -->
          <el-button
            v-else-if="showSettleAction"
            type="primary"
            data-test="settle-btn"
            @click="openSettleFromDialog"
          >{{ config.texts.settleAction }}</el-button>

          <!-- 已收付：對帳／標記異常 -->
          <template v-else-if="showReconcileActions">
            <el-button
              plain
              :disabled="reconcileSelfBlocked"
              data-test="exception-btn"
              @click="handleMarkException"
            >標記異常</el-button>
            <el-button
              type="primary"
              :disabled="reconcileSelfBlocked"
              data-test="reconcile-btn"
              @click="handleReconcile"
            >完成對帳</el-button>
          </template>
        </div>
      </template>
    </FormDialog>

    <SignoffSignDialog
      v-model="signDialogVisible"
      :record-id="signingId"
      :records="batchSignRows.length ? batchSignRows : null"
      :config="config"
      @signed="onSigned"
    />
    <SignoffSettleDialog
      v-model="settleDialogVisible"
      :record-id="settlingId"
      :config="config"
      :default-method="settlingMethod"
      @settled="onSettled"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { getUserInfo, hasPermission } from '@/utils/auth'
import { formatCurrency } from '@/utils/currency'
import { downloadFile } from '@/utils/download'
import {
  EMPTY_SIGNOFF_SUMMARY,
  PAYMENT_METHOD_OPTIONS,
  type SignoffSummary,
} from '@/constants/signoff'
import type { SignoffModuleConfig } from '@/config/signoffModules'
import {
  evidenceStatusLabel,
  extractApiErrorMessage,
  isRecordDeletable,
  isRecordEditable,
  recordLockReason,
  resolveNextAction,
  settlementStatusLabel,
  approvalStatusLabel,
  type NextAction,
  type SignoffControlRecord,
} from '@/utils/financeSignoff'
import AdminListCards from '@/components/common/AdminListCards.vue'
import AdminListToolbar, {
  type FilterGroup,
} from '@/components/common/AdminListToolbar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import FormDialog from '@/components/common/FormDialog.vue'
import FormSection from '@/components/common/FormSection.vue'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import SignoffFlowSummary, {
  type FlowFilterKey,
} from './SignoffFlowSummary.vue'
import SignoffSettleDialog from './SignoffSettleDialog.vue'
import SignoffSignDialog from './SignoffSignDialog.vue'
import SignoffTimeline, { type SignoffEvent } from './SignoffTimeline.vue'

const props = withDefaults(
  defineProps<{
    config: SignoffModuleConfig
    /** 深連結：掛載後自動開啟該筆詳細（由 FinanceSignoffView 從 ?highlight 解析傳入） */
    highlightId?: number | null
    /** 行動版由外層 View 統一判斷傳入（sticky CTA 與卡片列表共用同一斷點） */
    isMobile?: boolean
  }>(),
  { highlightId: null, isMobile: false },
)

// config 視為掛載期常量：外層 FinanceSignoffView 以 :key="config.key" 切 tab 重掛載
const config = props.config

const paymentMethodOptions = PAYMENT_METHOD_OPTIONS

const canWrite = computed(() => hasPermission(config.permissions.write))
const currentEmployeeId = computed<number | null>(() => {
  const raw = (getUserInfo() as { employee_id?: unknown } | null)?.employee_id
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
})

interface Attachment { key: string; filename: string; size: number; mime_type?: string | null }
const items = ref<Record<string, unknown>[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)

// ── 批次簽收（桌面表格勾選）與匯出 ──
interface BatchSignRecord { id: number; partyName: string; amount: number }
interface BatchSignResult {
  results: Array<{ id: number | null; ok: boolean; error?: string | null }>
  succeeded: number
  failed: number
}
const tableRef = ref<{ toggleRowSelection?: (row: unknown, selected?: boolean) => void } | null>(null)
const selectedRows = ref<Record<string, unknown>[]>([])
const batchSignRows = ref<BatchSignRecord[]>([])
const exporting = ref(false)

// 可勾選＝憑證軸待補（pending）；後端 batch-sign 另擋建立者自簽（SoD）
function selectableRow(row: Record<string, unknown>) {
  return row.status === 'pending'
}

function onSelectionChange(rows: Record<string, unknown>[]) {
  selectedRows.value = rows
}

// 匯出端點吃 start_date/end_date/category/status（對齊 GET /exports/vendor-payments
// 與 GET /exports/misc-receipts 的 query，不含 partyName/payment_method——與
// buildRangeParams 用途不同故各自獨立，避免共用 helper 之後兩邊需求分岔互相牽動）。
function buildExportParams(): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  if (filters.dateRange?.length === 2) {
    params.start_date = filters.dateRange[0]
    params.end_date = filters.dateRange[1]
  }
  if (config.category && filters.category) params.category = filters.category
  if (filters.status) params.status = filters.status
  return params
}

async function handleExport() {
  exporting.value = true
  try {
    await downloadFile(config.exportPath, config.exportFilename, buildExportParams())
  } finally {
    exporting.value = false
  }
}

const summary = ref<SignoffSummary>({ ...EMPTY_SIGNOFF_SUMMARY })
const summaryLoading = ref(false)

const filters = reactive<{
  dateRange: string[] | null
  partyName: string
  status: string
  paymentMethod: string
  category: string
  flow: FlowFilterKey | null
}>({
  dateRange: null,
  partyName: '',
  status: '',
  paymentMethod: '',
  category: '',
  flow: null,
})

const searchInput = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearchInput(value: string) {
  searchInput.value = value
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    filters.partyName = value.trim()
    refresh()
  }, 300)
}
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

const toolbarFilters = computed<FilterGroup[]>(() => {
  const groups: FilterGroup[] = []
  if (config.category) {
    groups.push({
      key: 'category',
      label: config.category.label,
      options: config.category.options.map((o) => ({ label: o.label, value: o.value })),
    })
  }
  groups.push({
    key: 'payment_method',
    label: '收付方式',
    options: PAYMENT_METHOD_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
  })
  return groups
})

const toolbarFilterValues = computed<Record<string, unknown>>(() => ({
  ...(filters.category ? { category: filters.category } : {}),
  ...(filters.paymentMethod ? { payment_method: filters.paymentMethod } : {}),
}))

function onToolbarFilterChange(values: Record<string, unknown>) {
  filters.category = String(values.category ?? '')
  filters.paymentMethod = String(values.payment_method ?? '')
  refresh()
}

const hasActiveFilters = computed(
  () =>
    !!filters.status ||
    !!filters.partyName ||
    !!filters.paymentMethod ||
    !!filters.category ||
    !!filters.flow ||
    (filters.dateRange?.length === 2),
)

const rangeLabel = computed(() => {
  if (filters.dateRange?.length === 2) {
    return `${filters.dateRange[0]} ～ ${filters.dateRange[1]}`
  }
  return '全部期間'
})

// ─── 流程摘要點擊 → 複合篩選 ────────────────────────────────────────────
const FLOW_FILTER_PARAMS: Record<FlowFilterKey, Record<string, string>> = {
  pending_approval: { approval_status: 'pending_approval' },
  approved_unsettled: { approval_status: 'approved', settlement_status: 'unsettled' },
  awaiting_evidence: { settlement_status: 'settled', status: 'pending' },
  awaiting_reconcile: {
    settlement_status: 'settled',
    reconciliation_status: 'unreconciled',
  },
  exception: { reconciliation_status: 'exception' },
}

function onFlowSelect(key: FlowFilterKey | null) {
  filters.flow = key
  page.value = 1
  fetchList()
}

// ─── 資料載入 ────────────────────────────────────────────────────────────
function buildRangeParams(): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  if (filters.dateRange?.length === 2) {
    params.start_date = filters.dateRange[0]
    params.end_date = filters.dateRange[1]
  }
  if (filters.partyName) params[config.fields.partyName.key] = filters.partyName
  if (filters.paymentMethod) params.payment_method = filters.paymentMethod
  if (config.category && filters.category) params.category = filters.category
  return params
}

async function fetchList() {
  loading.value = true
  try {
    const params = buildRangeParams()
    params.page = page.value
    params.page_size = pageSize.value
    if (filters.status) params.status = filters.status
    if (filters.flow) Object.assign(params, FLOW_FILTER_PARAMS[filters.flow])

    const res = await config.api.list(params)
    const data = res.data as { items: Record<string, unknown>[]; total: number }
    items.value = data.items
    total.value = data.total
  } catch (e) {
    ElMessage.error(extractApiErrorMessage(e, '載入失敗'))
  } finally {
    loading.value = false
  }
}

async function fetchSummary() {
  summaryLoading.value = true
  try {
    const res = await config.api.summary(buildRangeParams())
    summary.value = res.data as SignoffSummary
  } catch {
    summary.value = { ...EMPTY_SIGNOFF_SUMMARY }
  } finally {
    summaryLoading.value = false
  }
}

// range 篩選變動時，列表與彙總一起刷新（彙總不吃狀態篩選，單獨改狀態只刷列表）
function refresh() {
  page.value = 1
  fetchList()
  fetchSummary()
}

function clearFilters() {
  filters.dateRange = null
  filters.partyName = ''
  filters.status = ''
  filters.paymentMethod = ''
  filters.category = ''
  filters.flow = null
  searchInput.value = ''
  refresh()
}

// ─── 列狀態顯示 ──────────────────────────────────────────────────────────
function asControlRecord(row: Record<string, unknown>): SignoffControlRecord {
  return row as unknown as SignoffControlRecord
}

function statusChip(row: {
  approval_status?: unknown
  settlement_status?: unknown
  reconciliation_status?: unknown
}): { label: string; tone: string } {
  const rc = String(row.reconciliation_status ?? '')
  if (rc === 'reconciled') return { label: '已對帳', tone: 'signed' }
  if (rc === 'exception') return { label: '異常待處理', tone: 'danger' }
  if (String(row.settlement_status) === 'settled') {
    return {
      label: settlementStatusLabel('settled', config.key),
      tone: 'settled',
    }
  }
  const ap = String(row.approval_status ?? 'draft')
  const tone =
    ap === 'pending_approval' ? 'pending' : ap === 'rejected' ? 'danger' : 'neutral'
  return { label: approvalStatusLabel(ap), tone }
}

function rowDateText(row: Record<string, unknown>): string {
  const actual = row[config.fields.date.key]
  if (actual) return String(actual)
  const planned = row[config.fields.plannedDate.key]
  if (planned) return `${planned}（預計）`
  const created = String(row.created_at ?? '')
  return created ? `${created.slice(0, 10)}（建立）` : '—'
}

const mobileColumns = computed(() => [
  { label: '單據日期', prop: 'payment_date', formatter: rowDateText },
  { label: '金額', prop: 'amount' },
  {
    label: '流程狀態',
    prop: 'approval_status',
    formatter: (item: Record<string, unknown>) => statusChip(item).label,
  },
  {
    label: '目前待辦',
    prop: 'reconciliation_status',
    formatter: (item: Record<string, unknown>) =>
      rowPrimaryAction(item)?.label ?? '流程完成',
  },
])

// ─── 每列唯一 primary next-action ───────────────────────────────────────
function rowPrimaryAction(row: Record<string, unknown>): NextAction | null {
  return resolveNextAction(asControlRecord(row), config.key)
}

function rowSelfBlockReason(row: Record<string, unknown>): string | null {
  const act = rowPrimaryAction(row)
  if (!act || !hasPermission(act.permission)) return null
  const me = currentEmployeeId.value
  if (!me) return null
  if (act.key === 'approve' && Number(row.created_by_id) === me) {
    return '不可核准自己建立的單據'
  }
  if (
    (act.key === 'reconcile' || act.key === 'resolve_exception') &&
    Number(row.settled_by_id) === me
  ) {
    return `不可對帳自己確認${config.texts.unitLabel}的交易`
  }
  return null
}

function rowPrimaryDisabled(row: Record<string, unknown>): boolean {
  const act = rowPrimaryAction(row)
  if (!act) return true
  return !hasPermission(act.permission) || !!rowSelfBlockReason(row)
}

function runPrimaryAction(row: Record<string, unknown>) {
  const act = rowPrimaryAction(row)
  if (!act || rowPrimaryDisabled(row)) return
  const id = row.id as number
  switch (act.key) {
    case 'submit':
      void confirmSubmit(id, row)
      break
    case 'settle':
      openSettle(row)
      break
    case 'sign':
      openSign(row)
      break
    default:
      // approve / edit_resubmit / reconcile / resolve_exception：先看單再操作
      openEdit(row)
  }
}

async function confirmSubmit(id: number, row: Record<string, unknown>) {
  try {
    await ElMessageBox.confirm(
      `確定將「${row[config.fields.partyName.key]}」送出審核？送審後將無法編輯，需由核准人處理。`,
      '送出審核',
      { type: 'info', confirmButtonText: '送出審核' },
    )
  } catch {
    return
  }
  try {
    await config.api.submit(id)
    ElMessage.success('已送出審核')
    refresh()
  } catch (e) {
    ElMessage.error(extractApiErrorMessage(e))
  }
}

// ─── Dialog（新增／詳細）────────────────────────────────────────────────
const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const formRef = ref<FormInstance>()
const formDialogRef = ref<InstanceType<typeof FormDialog>>()
const dialogTitle = computed(() => {
  if (!editingId.value) return config.texts.addButton
  return isFormLocked.value
    ? `檢視${config.texts.unitLabel}`
    : `編輯${config.texts.unitLabel}`
})

const form = reactive<{
  plannedDate: string
  partyName: string
  amount: number
  paymentMethod: string
  description: string
  docNumber: string
  category: string
  notes: string
  attachments: Attachment[]
  status: string
  approval_status: string
  settlement_status: string
  reconciliation_status: string
  rejection_reason: string | null
  payment_date: string | null
  transaction_ref: string | null
  created_by_id: number | null
  settled_by_id: number | null
  signer_name: string | null
  signed_at: string | null
  signature_kind: string | null
  has_signature: boolean
  created_by_name: string | null
  created_at: string | null
}>({
  plannedDate: '',
  partyName: '',
  amount: 0,
  paymentMethod: 'cash',
  description: '',
  docNumber: '',
  category: '',
  notes: '',
  attachments: [],
  status: 'pending',
  approval_status: 'draft',
  settlement_status: 'unsettled',
  reconciliation_status: 'unreconciled',
  rejection_reason: null,
  payment_date: null,
  transaction_ref: null,
  created_by_id: null,
  settled_by_id: null,
  signer_name: null,
  signed_at: null,
  signature_kind: null,
  has_signature: false,
  created_by_name: null,
  created_at: null,
})

const formRules = computed<FormRules>(() => ({
  partyName: [
    { required: true, message: `請填寫${config.texts.formPartyLabel}`, trigger: 'blur' },
  ],
  amount: [
    { required: true, message: '請填寫金額', trigger: 'change' },
    {
      validator: (_r, v: number, cb) =>
        v && v > 0 ? cb() : cb(new Error('金額必須大於 0')),
      trigger: 'change',
    },
  ],
  ...(config.category
    ? {
        category: [
          { required: true, message: `請選擇${config.category.label}`, trigger: 'change' },
        ],
      }
    : {}),
}))

const isFormLocked = computed(() => {
  if (!editingId.value) return false
  if (!canWrite.value) return true
  return !isRecordEditable(form)
})

const formLockReason = computed(() => {
  if (!editingId.value) return null
  return recordLockReason(form, config.key)
})

// dirty 檢查：關閉有未儲存內容的表單前提示
let formSnapshot = ''
function editableSnapshot(): string {
  return JSON.stringify({
    plannedDate: form.plannedDate,
    partyName: form.partyName,
    amount: form.amount,
    paymentMethod: form.paymentMethod,
    description: form.description,
    docNumber: form.docNumber,
    category: form.category,
    notes: form.notes,
  })
}
const isFormDirty = () => !isFormLocked.value && editableSnapshot() !== formSnapshot

function resetForm() {
  Object.assign(form, {
    plannedDate: '',
    partyName: '',
    amount: 0,
    paymentMethod: 'cash',
    description: '',
    docNumber: '',
    category: '',
    notes: '',
    attachments: [],
    status: 'pending',
    approval_status: 'draft',
    settlement_status: 'unsettled',
    reconciliation_status: 'unreconciled',
    rejection_reason: null,
    payment_date: null,
    transaction_ref: null,
    created_by_id: null,
    settled_by_id: null,
    signer_name: null,
    signed_at: null,
    signature_kind: null,
    has_signature: false,
    created_by_name: null,
    created_at: null,
  })
}

function openCreate() {
  editingId.value = null
  resetForm()
  events.value = []
  formSnapshot = editableSnapshot()
  dialogVisible.value = true
}

function openEdit(row: Record<string, unknown>) {
  editingId.value = row.id as number | null
  Object.assign(form, {
    plannedDate: row[config.fields.plannedDate.key] || '',
    partyName: row[config.fields.partyName.key],
    amount: Number(row.amount),
    paymentMethod: row.payment_method,
    description: row.description || '',
    docNumber: row[config.fields.docNumber.key] || '',
    category: (row.category as string | undefined) || '',
    notes: row.notes || '',
    attachments: row.attachments || [],
    status: row.status,
    approval_status: row.approval_status || 'draft',
    settlement_status: row.settlement_status || 'unsettled',
    reconciliation_status: row.reconciliation_status || 'unreconciled',
    rejection_reason: row.rejection_reason ?? null,
    payment_date: row[config.fields.date.key] ?? null,
    transaction_ref: row.transaction_ref ?? null,
    created_by_id: (row.created_by_id as number | null) ?? null,
    settled_by_id: (row.settled_by_id as number | null) ?? null,
    signer_name: row.signer_name,
    signed_at: row.signed_at,
    signature_kind: row.signature_kind,
    has_signature: row.has_signature,
    created_by_name: row.created_by_name,
    created_at: row.created_at,
  })
  formSnapshot = editableSnapshot()
  dialogVisible.value = true
  void fetchEvents()
}

function onRowClick(row: Record<string, unknown>) {
  openEdit(row)
}

function onRowCommand(command: string, row: Record<string, unknown>) {
  if (command === 'edit') openEdit(row)
  else if (command === 'delete') handleDelete(row)
}

// ─── 事件時間軸 ──────────────────────────────────────────────────────────
const events = ref<SignoffEvent[]>([])
const eventsLoading = ref(false)

async function fetchEvents() {
  if (!editingId.value) return
  eventsLoading.value = true
  try {
    const res = await config.api.events(editingId.value)
    events.value = (res.data as { items: SignoffEvent[] }).items
  } catch {
    events.value = []
  } finally {
    eventsLoading.value = false
  }
}

// ─── 儲存（草稿）與送審 ─────────────────────────────────────────────────
function buildSavePayload(): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    [config.fields.plannedDate.key]: form.plannedDate || null,
    [config.fields.partyName.key]: form.partyName,
    amount: form.amount,
    payment_method: form.paymentMethod,
    description: form.description || null,
    [config.fields.docNumber.key]: form.docNumber || null,
    notes: form.notes || null,
  }
  if (config.category) payload.category = form.category
  return payload
}

async function handleSave(): Promise<number | null> {
  // inline validation：驗證失敗停留在表單（el-form rules 標紅），不跳全域 warning
  const validateFn = formRef.value?.validate
  const valid = validateFn
    ? await validateFn.call(formRef.value).catch(() => false)
    : true
  if (valid === false) return null
  saving.value = true
  try {
    let id = editingId.value
    if (id) {
      await config.api.update(id, buildSavePayload())
      ElMessage.success('已儲存')
    } else {
      const res = await config.api.create(buildSavePayload())
      id = (res.data as { id: number }).id
      ElMessage.success('草稿已建立')
    }
    formSnapshot = editableSnapshot()
    dialogVisible.value = false
    refresh()
    return id
  } catch (e) {
    ElMessage.error(extractApiErrorMessage(e))
    return null
  } finally {
    saving.value = false
  }
}

async function handleSaveAndSubmit() {
  const id = await handleSave()
  if (!id) return
  try {
    await config.api.submit(id)
    ElMessage.success('已送出審核')
    refresh()
  } catch (e) {
    ElMessage.error(extractApiErrorMessage(e, '送審失敗（草稿已儲存）'))
  }
}

async function handleDelete(row: Record<string, unknown>) {
  try {
    await ElMessageBox.confirm(
      `確定刪除「${row[config.fields.partyName.key]}」${config.texts.unitLabel}紀錄？此動作無法復原。`,
      '確認刪除',
      { type: 'warning', confirmButtonText: '確定刪除', confirmButtonClass: 'el-button--danger' },
    )
    await config.api.remove(row.id as number)
    ElMessage.success('已刪除')
    refresh()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(extractApiErrorMessage(e, '刪除失敗'))
  }
}

// ─── 核准／駁回（Checker）───────────────────────────────────────────────
const showApproveActions = computed(
  () =>
    !!editingId.value &&
    form.approval_status === 'pending_approval' &&
    hasPermission(config.permissions.approve),
)
const approveSelfBlocked = computed(
  () =>
    showApproveActions.value &&
    !!currentEmployeeId.value &&
    form.created_by_id === currentEmployeeId.value,
)

async function handleApprove() {
  if (!editingId.value || approveSelfBlocked.value) return
  try {
    await ElMessageBox.confirm(
      `確認核准這筆 ${formatMoney(form.amount)} 的${config.texts.unitLabel}？`,
      '核准',
      { type: 'info', confirmButtonText: '核准' },
    )
  } catch {
    return
  }
  try {
    await config.api.approve(editingId.value, { decision: 'approve' })
    ElMessage.success('已核准')
    dialogVisible.value = false
    refresh()
  } catch (e) {
    ElMessage.error(extractApiErrorMessage(e))
  }
}

async function handleReject() {
  if (!editingId.value || approveSelfBlocked.value) return
  let reason: string
  try {
    const res = (await ElMessageBox.prompt('請填寫駁回原因（必填）', '駁回', {
      confirmButtonText: '駁回',
      cancelButtonText: '取消',
      inputValidator: (v: string) => (v && v.trim() ? true : '駁回必須填寫原因'),
    })) as { value: string }
    reason = res.value.trim()
  } catch {
    return
  }
  try {
    await config.api.approve(editingId.value, { decision: 'reject', reason })
    ElMessage.success('已駁回')
    dialogVisible.value = false
    refresh()
  } catch (e) {
    ElMessage.error(extractApiErrorMessage(e))
  }
}

// ─── 確認收付（settle）──────────────────────────────────────────────────
const settleDialogVisible = ref(false)
const settlingId = ref<number | null>(null)
const settlingMethod = ref('cash')

const showSettleAction = computed(() => {
  if (!editingId.value || form.settlement_status !== 'unsettled') return false
  if (!hasPermission(config.permissions.settle)) return false
  if (config.key === 'vendor') return form.approval_status === 'approved'
  // 收入側：rejected 須先修改重送，其餘狀態皆可先收款
  return form.approval_status !== 'rejected'
})

function openSettle(row: Record<string, unknown>) {
  settlingId.value = row.id as number
  settlingMethod.value = String(row.payment_method ?? 'cash')
  settleDialogVisible.value = true
}

function openSettleFromDialog() {
  if (!editingId.value) return
  settlingId.value = editingId.value
  settlingMethod.value = form.paymentMethod
  dialogVisible.value = false
  settleDialogVisible.value = true
}

function onSettled() {
  refresh()
}

// ─── 對帳（reconcile）───────────────────────────────────────────────────
const showReconcileActions = computed(
  () =>
    !!editingId.value &&
    form.settlement_status === 'settled' &&
    form.reconciliation_status !== 'reconciled' &&
    hasPermission(config.permissions.reconcile),
)
const reconcileSelfBlocked = computed(
  () =>
    !!currentEmployeeId.value && form.settled_by_id === currentEmployeeId.value,
)

async function handleReconcile() {
  if (!editingId.value || reconcileSelfBlocked.value) return
  try {
    await ElMessageBox.confirm(
      '確認這筆交易的金額、對象與憑證都核對無誤，完成對帳？',
      '完成對帳',
      { type: 'info', confirmButtonText: '完成對帳' },
    )
  } catch {
    return
  }
  try {
    await config.api.reconcile(editingId.value, { result: 'reconciled' })
    ElMessage.success('已完成對帳')
    dialogVisible.value = false
    refresh()
  } catch (e) {
    ElMessage.error(extractApiErrorMessage(e))
  }
}

async function handleMarkException() {
  if (!editingId.value || reconcileSelfBlocked.value) return
  let note: string
  try {
    const res = (await ElMessageBox.prompt('請說明差異或異常原因（必填）', '標記異常', {
      confirmButtonText: '標記異常',
      cancelButtonText: '取消',
      inputValidator: (v: string) => (v && v.trim() ? true : '標記差異必須說明原因'),
    })) as { value: string }
    note = res.value.trim()
  } catch {
    return
  }
  try {
    await config.api.reconcile(editingId.value, { result: 'exception', note })
    ElMessage.warning('已標記異常，待後續處理')
    dialogVisible.value = false
    refresh()
  } catch (e) {
    ElMessage.error(extractApiErrorMessage(e))
  }
}

// ─── 憑證與附件 ──────────────────────────────────────────────────────────
const signDialogVisible = ref(false)
const signingId = ref<number | null>(null)

const downloadAttachmentUrl = config.api.attachmentDownloadUrl
const signatureUrl = config.api.signatureUrl

// 與後端守衛一致：已簽收後附件凍結（防抽換佐證）；已收付後仍可補（補憑證
// 流程），但刪除僅限未收付且未簽收
const canAddAttachments = computed(() => form.status === 'pending')
const canMutateAttachments = computed(
  () => form.status === 'pending' && form.settlement_status === 'unsettled',
)

// 2026-08-25 P1：與後端 sign_vendor_payment / sign_misc_receipt 的核准軸守衛
// 對齊（approval_status 須為 approved/legacy）。修法前本頁「上傳憑證」按鈕
// 只看 canWrite，草稿/待核准的單據也能被點去簽收——簽收後 status 變 signed，
// isRecordEditable 認 status!=pending 即永久鎖死，形同卡死一筆永遠無法核准
// 也無法修改的孤兒紀錄。後端已補上真正的守衛（403/409 一定擋得住），這裡是
// 縱深防禦：避免使用者點了按鈕卻先看到伺服器錯誤才發現卡關。
const canSignFromDialog = computed(
  () => form.approval_status === 'approved' || form.approval_status === 'legacy',
)

function openSign(row: Record<string, unknown>) {
  signingId.value = row.id as number | null
  batchSignRows.value = []
  signDialogVisible.value = true
}

function openBatchSign() {
  if (!selectedRows.value.length) return
  batchSignRows.value = selectedRows.value.map((r) => ({
    id: r.id as number,
    partyName: String(r[config.fields.partyName.key] ?? ''),
    amount: Number(r.amount) || 0,
  }))
  signingId.value = null
  signDialogVisible.value = true
}

function openSignFromDialog() {
  if (!editingId.value) return
  signingId.value = editingId.value
  batchSignRows.value = []
  dialogVisible.value = false
  signDialogVisible.value = true
}

/**
 * 單筆簽收（未帶 result）：沿用既有 refresh。
 * 批次簽收：per-筆結果回饋——toast（成功/失敗筆數＋失敗原因）、重新載入，
 * 失敗筆從新載入的列表裡找回並保留勾選，讓操作者可直接重試。
 */
async function onSigned(result?: BatchSignResult) {
  if (!result) {
    selectedRows.value = []
    batchSignRows.value = []
    refresh()
    return
  }

  const failedItems = result.results.filter((r) => !r.ok)
  if (failedItems.length === 0) {
    ElMessage.success(`已成功簽收 ${result.succeeded} 筆`)
  } else {
    const detail = failedItems
      .map((r) => {
        const rec = batchSignRows.value.find((b) => b.id === r.id)
        return `${rec?.partyName ?? `#${r.id}`}：${r.error || '簽收失敗'}`
      })
      .join('；')
    ElMessage.warning(
      `批次簽收完成：成功 ${result.succeeded} 筆，失敗 ${result.failed} 筆（${detail}）`,
    )
  }

  await fetchList()
  fetchSummary()

  const failedIds = new Set(failedItems.map((r) => r.id))
  if (failedIds.size) {
    const rowsToReselect = items.value.filter((r) => failedIds.has(r.id as number))
    selectedRows.value = rowsToReselect
    await nextTick()
    rowsToReselect.forEach((r) => {
      tableRef.value?.toggleRowSelection?.(r, true)
    })
  } else {
    selectedRows.value = []
  }
  batchSignRows.value = []
}

async function handleAttachmentUpload({ file }: { file: File }) {
  if (!editingId.value) return
  const fd = new FormData()
  fd.append('file', file)
  try {
    const res = await config.api.uploadAttachment(editingId.value, fd)
    form.attachments = [...(form.attachments || []), res.data as Attachment]
    ElMessage.success('附件已上傳')
    fetchList()
  } catch (e) {
    ElMessage.error(extractApiErrorMessage(e, '上傳失敗'))
  }
}

async function removeAttachment(key: string) {
  try {
    await ElMessageBox.confirm('確定刪除此附件？', '確認刪除', { type: 'warning' })
    await config.api.deleteAttachment(editingId.value as number, key)
    form.attachments = (form.attachments || []).filter((a) => a.key !== key)
    fetchList()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(extractApiErrorMessage(e, '刪除失敗'))
  }
}

// ─── 顯示 helpers ────────────────────────────────────────────────────────
function formatMoney(value: unknown) {
  return formatCurrency(Number(value ?? 0) || 0)
}

function isImageAttachment(att: Attachment) {
  if (att.mime_type) return att.mime_type.startsWith('image/')
  return /\.(png|jpe?g|webp)$/i.test(att.filename || '')
}

function signKindLabel(kind: string | null | undefined) {
  if (kind === 'photo') return '紙本照片'
  if (kind === 'drawn') return '當場手寫'
  return '已附憑證'
}

function formatSize(bytes: number) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-TW')
}

// 禁未來日（與後端 settle 守衛一致）；SignoffSettleDialog 亦有同款
function disabledFutureDate(time: Date): boolean {
  return time.getTime() > Date.now()
}

async function tryOpenHighlight() {
  if (!props.highlightId) return
  try {
    const res = await config.api.get(props.highlightId)
    openEdit(res.data as Record<string, unknown>)
  } catch {
    ElMessage.warning(`找不到該筆${config.texts.unitLabel}紀錄`)
  }
}

onMounted(async () => {
  await Promise.all([fetchList(), fetchSummary()])
  await tryOpenHighlight()
})

defineExpose({
  openCreate,
  // 測試沿用的 vm 介面
  fetchList,
  handleSave,
  handleDelete,
  disabledFutureDate,
})
</script>

<style scoped>
.so-sub {
  margin: 0 0 var(--space-3, 12px);
  font-size: var(--text-sm, 13px);
  color: var(--text-secondary, var(--neutral-500));
}

.so-date-range {
  max-width: 260px;
}

/* ── 表格 ── */
.so-table {
  cursor: pointer;
}
.so-party {
  font-weight: var(--font-weight-medium, 500);
  color: var(--text-primary, var(--neutral-800));
}
.so-amount {
  font-variant-numeric: tabular-nums;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-primary, var(--neutral-800));
}
.so-muted {
  color: var(--text-tertiary, var(--neutral-400));
}

/* 狀態 chip：一律有文字，顏色僅輔助 */
.so-status {
  display: inline-block;
  padding: 2px 10px;
  border-radius: var(--radius-full, 9999px);
  font-size: var(--text-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  line-height: 1.6;
  margin-right: var(--space-1, 4px);
}
.so-status--neutral {
  background: var(--neutral-100);
  color: var(--text-secondary, var(--neutral-500));
}
.so-status--pending {
  background: var(--color-warning-soft);
  color: var(--color-warning-darker);
}
.so-status--settled,
.so-status--signed {
  background: var(--color-success-soft);
  color: var(--color-success-darker);
}
.so-status--danger {
  background: var(--color-danger-soft, var(--color-warning-soft));
  color: var(--color-danger-darker, var(--color-danger));
}
.so-status--evidence {
  background: var(--neutral-100);
  color: var(--text-secondary, var(--neutral-500));
}

.so-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1, 4px);
  justify-content: flex-end;
}
.so-actions__more {
  padding-left: 8px;
  padding-right: 8px;
  font-weight: 700;
}

.so-pagination {
  margin-top: var(--space-4, 16px);
  display: flex;
  justify-content: flex-end;
}

/* 手機卡片標題可點 */
.so-card-title {
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
}

/* ── Dialog ── */
.so-flow-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1, 4px);
  margin-bottom: var(--space-3, 12px);
}
.so-flow-head__reject {
  flex-basis: 100%;
  font-size: var(--text-sm, 13px);
  color: var(--color-danger-darker, var(--color-danger));
}
.so-lock-alert {
  margin-bottom: var(--space-3, 12px);
}
.so-form__amount-echo {
  margin-left: var(--space-3, 12px);
  font-size: var(--text-sm, 13px);
  color: var(--text-secondary, var(--neutral-500));
  font-variant-numeric: tabular-nums;
}
.so-form__audit {
  margin: var(--space-3, 12px) 0 0;
  font-size: var(--text-xs, 12px);
  color: var(--text-tertiary, var(--neutral-400));
}
.so-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}
.so-dialog-footer__hint {
  font-size: var(--text-xs, 12px);
  color: var(--text-tertiary, var(--neutral-400));
  margin-right: auto;
}

/* 憑證區 */
.so-signed-block {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4, 16px);
  flex-wrap: wrap;
}
.so-signed-block__info {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
  font-size: var(--text-sm, 13px);
}
.so-signed-block__thumb img {
  max-width: 180px;
  max-height: 90px;
  border: 1px solid var(--neutral-200);
  border-radius: var(--radius-md, 8px);
  background: var(--neutral-0);
  display: block;
}

/* 附件區 */
.so-attachments__empty {
  font-size: var(--text-sm, 13px);
  margin-bottom: var(--space-2, 8px);
}
.so-attachments__grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3, 12px);
  margin-bottom: var(--space-3, 12px);
}
.so-att {
  width: 120px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.so-att__preview {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 80px;
  border: 1px solid var(--neutral-200);
  border-radius: var(--radius-md, 8px);
  overflow: hidden;
  background: var(--neutral-50);
}
.so-att__preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.so-att__doc {
  font-size: var(--text-sm, 13px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-secondary, var(--neutral-500));
  letter-spacing: 0.05em;
}
.so-att__meta {
  display: flex;
  flex-direction: column;
  font-size: var(--text-xs, 12px);
}
.so-att__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary, var(--neutral-500));
}
.so-att__size {
  color: var(--text-tertiary, var(--neutral-400));
}
.so-att__remove {
  align-self: flex-start;
}
</style>
