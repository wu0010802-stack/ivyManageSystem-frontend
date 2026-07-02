<template>
  <div class="signoff-panel">
    <!-- 頁首 -->
    <header class="so-header">
      <p class="so-header__sub">{{ config.texts.headerSub }}</p>
      <el-button
        v-if="canWrite"
        type="primary"
        @click="openCreate"
      >{{ config.texts.addButton }}</el-button>
    </header>

    <!-- 區間彙總（跨狀態，隨日期/對象/收付方式篩選連動；不受狀態篩選影響） -->
    <section class="so-summary" aria-label="本期彙總">
      <div class="so-summary__cards" v-loading="summaryLoading">
        <div class="kpi-card">
          <div class="kpi-label">{{ config.texts.kpiTotalLabel }}</div>
          <div class="kpi-value">{{ formatMoney(summary.total_amount) }}</div>
          <div class="kpi-meta">共 {{ summary.total_count }} 筆</div>
        </div>
        <div class="kpi-card" :class="{ 'kpi-warning': summary.pending_count > 0 }">
          <div class="kpi-label">{{ config.texts.kpiPendingLabel }}</div>
          <div class="kpi-value">{{ formatMoney(summary.pending_amount) }}</div>
          <div class="kpi-meta">{{ summary.pending_count }} 筆等待回簽</div>
        </div>
        <div class="kpi-card" :class="{ 'kpi-success': summary.signed_count > 0 }">
          <div class="kpi-label">已簽收</div>
          <div class="kpi-value">{{ formatMoney(summary.signed_amount) }}</div>
          <div class="kpi-meta">{{ summary.signed_count }} 筆已完成</div>
        </div>
      </div>
      <p class="so-summary__period">本期：{{ rangeLabel }}</p>
    </section>

    <!-- 篩選：狀態為主軸（分段），其餘為次要條件 -->
    <div class="so-filters">
      <el-radio-group v-model="filters.status" class="so-filters__status" @change="fetchList">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="pending">待簽收</el-radio-button>
        <el-radio-button value="signed">已簽收</el-radio-button>
      </el-radio-group>

      <div class="so-filters__rest">
        <el-date-picker
          v-model="filters.dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="開始日期"
          end-placeholder="結束日期"
          value-format="YYYY-MM-DD"
          @change="refresh"
        />
        <el-input
          v-model="filters.partyName"
          :placeholder="config.texts.searchPlaceholder"
          clearable
          style="width: 200px"
          @keyup.enter="refresh"
          @clear="refresh"
        />
        <el-select
          v-if="config.category"
          v-model="filters.category"
          :placeholder="config.category.label"
          clearable
          style="width: 140px"
          @change="refresh"
        >
          <el-option
            v-for="opt in config.category.options"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
        <el-select
          v-model="filters.paymentMethod"
          placeholder="收付方式"
          clearable
          style="width: 140px"
          @change="refresh"
        >
          <el-option
            v-for="opt in paymentMethodOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
        <el-button v-if="hasActiveFilters" text @click="clearFilters">清除篩選</el-button>
      </div>
    </div>

    <!-- 首次載入用骨架，避免置中 spinner 突兀 -->
    <el-skeleton v-if="loading && !items.length" :rows="6" animated class="so-skeleton" />

    <el-table
      v-else
      :data="items"
      v-loading="loading && items.length > 0"
      row-key="id"
      class="so-table"
      @row-click="onRowClick"
    >
      <el-table-column :prop="config.fields.date.key" :label="config.fields.date.label" width="116" />
      <el-table-column :prop="config.fields.partyName.key" :label="config.fields.partyName.label" min-width="160">
        <template #default="{ row }">
          <span class="so-party">{{ row[config.fields.partyName.key] }}</span>
        </template>
      </el-table-column>
      <el-table-column v-if="config.category" :label="config.category.label" width="104">
        <template #default="{ row }">
          {{ config.category.labelOf(String(row.category ?? '')) }}
        </template>
      </el-table-column>
      <el-table-column label="金額" width="132" align="right">
        <template #default="{ row }">
          <span class="so-amount">{{ formatMoney(row.amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="收付方式" width="104">
        <template #default="{ row }">
          {{ paymentMethodLabel(row.payment_method as string) }}
        </template>
      </el-table-column>
      <el-table-column prop="description" label="項目／說明" min-width="180">
        <template #default="{ row }">
          <span :class="{ 'so-muted': !row.description }">{{ row.description || '未填寫' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="狀態" width="92" align="center">
        <template #default="{ row }">
          <span class="so-status" :class="`so-status--${row.status}`">
            {{ row.status === 'signed' ? '已簽收' : '待簽收' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="簽收" min-width="128">
        <template #default="{ row }">
          <template v-if="row.status === 'signed'">
            <div class="so-signer">{{ row.signer_name || '已簽收' }}</div>
            <div class="so-signer__meta">{{ signKindLabel(row.signature_kind as string | null) }}</div>
          </template>
          <span v-else class="so-muted">尚未回簽</span>
        </template>
      </el-table-column>
      <el-table-column label="附件" width="76" align="center">
        <template #default="{ row }">
          <span v-if="(row.attachments as Attachment[] | undefined)?.length" class="so-attach-chip" title="附件數">
            <el-icon class="so-attach-chip__clip"><Paperclip /></el-icon>{{ (row.attachments as Attachment[]).length }}
          </span>
          <span v-else class="so-muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right" align="right">
        <template #default="{ row }">
          <div class="so-actions" @click.stop>
            <el-button
              v-if="canWrite && row.status === 'pending'"
              size="small"
              type="primary"
              @click="openSign(row)"
            >簽收</el-button>
            <el-button
              v-else
              size="small"
              @click="openEdit(row)"
            >明細</el-button>

            <el-dropdown trigger="click" @command="(c) => onRowCommand(c, row)">
              <el-button size="small" class="so-actions__more" aria-label="更多操作">⋯</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit">
                    {{ canWrite ? '編輯' : '檢視' }}
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-if="canWrite && row.status === 'pending'"
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
        <div class="so-empty">
          <template v-if="hasActiveFilters">
            <p class="so-empty__title">目前篩選條件下沒有符合的紀錄</p>
            <el-button text type="primary" @click="clearFilters">清除篩選條件</el-button>
          </template>
          <template v-else>
            <p class="so-empty__title">{{ config.texts.emptyTitle }}</p>
            <p class="so-empty__hint">{{ config.texts.emptyHint }}</p>
            <el-button v-if="canWrite" type="primary" @click="openCreate">{{ config.texts.addButton }}</el-button>
          </template>
        </div>
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

    <!-- 編輯 / 檢視 / 新增 Dialog（分區表單） -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="600px"
      destroy-on-close
      class="so-dialog"
    >
      <el-form :model="form" label-position="top" class="so-form">
        <div class="so-form__section">
          <div class="so-form__section-title">{{ config.texts.formSectionTitle }}</div>
          <div class="so-form__grid">
            <el-form-item :label="config.fields.date.label" required>
              <el-date-picker
                v-model="form.date"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="選擇日期"
                style="width: 100%"
                :disabled="!canWrite"
                :disabled-date="disabledFutureDate"
              />
            </el-form-item>
            <el-form-item label="收付方式" required>
              <el-select v-model="form.paymentMethod" style="width: 100%" :disabled="!canWrite">
                <el-option
                  v-for="opt in paymentMethodOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="config.texts.formPartyLabel" required class="so-form__col-2">
              <el-input v-model="form.partyName" maxlength="120" :disabled="!canWrite" :placeholder="config.texts.formPartyPlaceholder" />
            </el-form-item>
            <el-form-item v-if="config.category" :label="config.category.label" required class="so-form__col-2">
              <el-select v-model="form.category" style="width: 100%" :disabled="!canWrite">
                <el-option
                  v-for="opt in config.category.options"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="金額" required class="so-form__col-2">
              <el-input-number
                v-model="form.amount"
                :min="1"
                :max="99999999"
                :precision="0"
                :step="100"
                controls-position="right"
                style="width: 100%"
                :disabled="!canWrite"
              />
              <span class="so-form__amount-echo">{{ formatMoney(form.amount) }}</span>
            </el-form-item>
          </div>
        </div>

        <div class="so-form__section">
          <div class="so-form__section-title">單據明細</div>
          <el-form-item label="項目／說明">
            <el-input v-model="form.description" maxlength="255" :disabled="!canWrite" :placeholder="config.texts.descPlaceholder" />
          </el-form-item>
          <div class="so-form__grid">
            <el-form-item :label="config.fields.docNumber.label">
              <el-input v-model="form.docNumber" maxlength="60" :disabled="!canWrite" />
            </el-form-item>
          </div>
          <el-form-item label="備註">
            <el-input v-model="form.notes" type="textarea" :rows="2" :disabled="!canWrite" />
          </el-form-item>
        </div>

        <div v-if="editingId" class="so-form__section">
          <div class="so-form__section-title">
            簽收憑證
            <span class="so-form__section-hint">{{ config.texts.signedCertHint }}</span>
          </div>
          <div v-if="form.status === 'signed'" class="so-signed-block">
            <div class="so-signed-block__info">
              <span class="so-status so-status--signed">已簽收</span>
              <span>{{ form.signer_name || '—' }}</span>
              <span class="so-muted">{{ formatDateTime(form.signed_at) }}・{{ signKindLabel(form.signature_kind) }}</span>
            </div>
            <a
              v-if="form.has_signature"
              :href="signatureUrl(editingId)"
              target="_blank"
              class="so-signed-block__thumb"
            >
              <img :src="signatureUrl(editingId)" alt="簽收憑證" />
            </a>
          </div>
          <div v-else class="so-signed-block so-signed-block--pending">
            <span class="so-muted">尚未回簽</span>
            <el-button v-if="canWrite" size="small" type="primary" @click="openSignFromDialog">上傳簽收憑證</el-button>
          </div>
        </div>

        <div v-if="editingId" class="so-form__section">
          <div class="so-form__section-title">
            單據附件
            <span class="so-form__section-hint">{{ config.texts.attachmentsHint }}</span>
          </div>
          <div class="so-attachments">
            <div v-if="!form.attachments?.length" class="so-muted so-attachments__empty">尚無附件</div>
            <div class="so-attachments__grid">
              <div
                v-for="att in form.attachments || []"
                :key="att.key"
                class="so-att"
              >
                <a
                  :href="downloadAttachmentUrl(editingId, att.key)"
                  target="_blank"
                  class="so-att__preview"
                  :title="att.filename"
                >
                  <img v-if="isImageAttachment(att)" :src="downloadAttachmentUrl(editingId, att.key)" :alt="att.filename" />
                  <span v-else class="so-att__doc" aria-hidden="true">PDF</span>
                </a>
                <div class="so-att__meta">
                  <span class="so-att__name" :title="att.filename">{{ att.filename }}</span>
                  <span class="so-att__size">{{ formatSize(att.size) }}</span>
                </div>
                <el-button
                  v-if="canWrite"
                  size="small"
                  link
                  type="danger"
                  class="so-att__remove"
                  @click="removeAttachment(att.key)"
                >移除</el-button>
              </div>
            </div>
            <el-upload
              v-if="canWrite && (form.attachments?.length || 0) < 5"
              :auto-upload="true"
              :http-request="handleAttachmentUpload"
              :show-file-list="false"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              class="so-attachments__upload"
            >
              <el-button size="small" plain>＋ 上傳附件</el-button>
            </el-upload>
          </div>
        </div>

        <p v-if="editingId && form.created_by_name" class="so-form__audit">
          建立：{{ form.created_by_name }}・{{ formatDateTime(form.created_at) }}
        </p>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">關閉</el-button>
        <el-button
          v-if="canWrite"
          type="primary"
          :loading="saving"
          @click="handleSave"
        >儲存</el-button>
      </template>
    </el-dialog>

    <SignoffSignDialog
      v-model="signDialogVisible"
      :record-id="signingId"
      :config="config"
      @signed="onSigned"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Paperclip } from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'
import { todayISO } from '@/utils/format'
import { formatCurrency } from '@/utils/currency'
import { PAYMENT_METHOD_OPTIONS, paymentMethodLabel, type SignoffSummary } from '@/constants/signoff'
import type { SignoffModuleConfig } from '@/config/signoffModules'
import SignoffSignDialog from './SignoffSignDialog.vue'

const props = withDefaults(
  defineProps<{
    config: SignoffModuleConfig
    /** 深連結：掛載後自動開啟該筆編輯／明細（由 FinanceSignoffView 從 ?highlight 解析傳入） */
    highlightId?: number | null
  }>(),
  { highlightId: null },
)

// config 視為掛載期常量：外層 FinanceSignoffView 以 :key="config.key" 切 tab 重掛載
const config = props.config

const paymentMethodOptions = PAYMENT_METHOD_OPTIONS

const canWrite = computed(() => hasPermission(config.permissions.write))

interface Attachment { key: string; filename: string; size: number; mime_type?: string | null }
const items = ref<Record<string, unknown>[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)

const EMPTY_SUMMARY: SignoffSummary = {
  total_count: 0,
  total_amount: 0,
  pending_count: 0,
  pending_amount: 0,
  signed_count: 0,
  signed_amount: 0,
}
const summary = ref<SignoffSummary>({ ...EMPTY_SUMMARY })
const summaryLoading = ref(false)

const filters = reactive<{
  dateRange: string[] | null
  partyName: string
  status: string
  paymentMethod: string
  category: string
}>({
  dateRange: null,
  partyName: '',
  status: '',
  paymentMethod: '',
  category: '',
})

const hasActiveFilters = computed(
  () =>
    !!filters.status ||
    !!filters.partyName ||
    !!filters.paymentMethod ||
    !!filters.category ||
    (filters.dateRange?.length === 2),
)

const rangeLabel = computed(() => {
  if (filters.dateRange?.length === 2) {
    return `${filters.dateRange[0]} ～ ${filters.dateRange[1]}`
  }
  return '全部期間'
})

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const dialogTitle = computed(() =>
  editingId.value
    ? (canWrite.value ? `編輯${config.texts.unitLabel}` : `檢視${config.texts.unitLabel}`)
    : config.texts.addButton,
)

const form = reactive<{
  date: string
  partyName: string
  amount: number
  paymentMethod: string
  description: string
  docNumber: string
  category: string
  notes: string
  attachments: Attachment[]
  status: string
  signer_name: string | null
  signed_at: string | null
  signature_kind: string | null
  has_signature: boolean
  created_by_name: string | null
  created_at: string | null
}>({
  date: '',
  partyName: '',
  amount: 0,
  paymentMethod: 'cash',
  description: '',
  docNumber: '',
  category: '',
  notes: '',
  attachments: [],
  status: 'pending',
  signer_name: null,
  signed_at: null,
  signature_kind: null,
  has_signature: false,
  created_by_name: null,
  created_at: null,
})

const signDialogVisible = ref(false)
const signingId = ref<number | null>(null)

const downloadAttachmentUrl = config.api.attachmentDownloadUrl
const signatureUrl = config.api.signatureUrl

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

    const res = await config.api.list(params)
    const data = res.data as { items: Record<string, unknown>[]; total: number }
    items.value = data.items
    total.value = data.total
  } catch (e) {
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err?.response?.data?.detail || '載入失敗')
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
    summary.value = { ...EMPTY_SUMMARY }
  } finally {
    summaryLoading.value = false
  }
}

// range 篩選變動時，列表與彙總一起刷新（彙總不吃 status，故單獨改 status 只刷列表）
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
  refresh()
}

// 禁未來日：與後端 validate_payment_date 守衛對齊（收付日不可晚於今日）。
// 90 天回補上限由後端權威把關（避免 JS 午夜/時區與台北日的邊界誤差）。
function disabledFutureDate(time: Date): boolean {
  return time.getTime() > Date.now()
}

function resetForm() {
  Object.assign(form, {
    // 用本地時區今日，避免 toISOString() 走 UTC 在台北 00:00-08:00 預設成昨天
    date: todayISO(),
    partyName: '',
    amount: 0,
    paymentMethod: 'cash',
    description: '',
    docNumber: '',
    category: '',
    notes: '',
    attachments: [],
    status: 'pending',
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
  dialogVisible.value = true
}

function openEdit(row: Record<string, unknown>) {
  editingId.value = row.id as number | null
  Object.assign(form, {
    date: row[config.fields.date.key],
    partyName: row[config.fields.partyName.key],
    amount: Number(row.amount),
    paymentMethod: row.payment_method,
    description: row.description || '',
    docNumber: row[config.fields.docNumber.key] || '',
    category: (row.category as string | undefined) || '',
    notes: row.notes || '',
    attachments: row.attachments || [],
    status: row.status,
    signer_name: row.signer_name,
    signed_at: row.signed_at,
    signature_kind: row.signature_kind,
    has_signature: row.has_signature,
    created_by_name: row.created_by_name,
    created_at: row.created_at,
  })
  dialogVisible.value = true
}

function openSign(row: Record<string, unknown>) {
  signingId.value = row.id as number | null
  signDialogVisible.value = true
}

function openSignFromDialog() {
  if (!editingId.value) return
  signingId.value = editingId.value
  dialogVisible.value = false
  signDialogVisible.value = true
}

function onRowClick(row: Record<string, unknown>) {
  openEdit(row)
}

function onRowCommand(command: string, row: Record<string, unknown>) {
  if (command === 'edit') openEdit(row)
  else if (command === 'delete') handleDelete(row)
}

async function handleSave() {
  if (!form.date || !form.partyName || form.amount == null || (config.category && !form.category)) {
    return ElMessage.warning(config.texts.requiredMsg)
  }
  saving.value = true
  try {
    const payload: Record<string, unknown> = {
      [config.fields.date.key]: form.date,
      [config.fields.partyName.key]: form.partyName,
      amount: form.amount,
      payment_method: form.paymentMethod,
      description: form.description || null,
      [config.fields.docNumber.key]: form.docNumber || null,
      notes: form.notes || null,
    }
    if (config.category) payload.category = form.category
    if (editingId.value) {
      await config.api.update(editingId.value, payload)
      ElMessage.success('更新成功')
    } else {
      await config.api.create(payload)
      ElMessage.success('新增成功')
    }
    dialogVisible.value = false
    refresh()
  } catch (e) {
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err?.response?.data?.detail || '操作失敗')
  } finally {
    saving.value = false
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
    const err = e as { response?: { data?: { detail?: string } } }
    if (e !== 'cancel') ElMessage.error(err?.response?.data?.detail || '刪除失敗')
  }
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
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err?.response?.data?.detail || '上傳失敗')
  }
}

async function removeAttachment(key: string) {
  try {
    await ElMessageBox.confirm('確定刪除此附件？', '確認刪除', { type: 'warning' })
    await config.api.deleteAttachment(editingId.value as number, key)
    form.attachments = (form.attachments || []).filter((a) => a.key !== key)
    fetchList()
  } catch (e) {
    const err = e as { response?: { data?: { detail?: string } } }
    if (e !== 'cancel') ElMessage.error(err?.response?.data?.detail || '刪除失敗')
  }
}

function onSigned() {
  refresh()
}

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
  return '已簽收'
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
</script>

<style scoped>
/* ── 頁首 ── */
.so-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4, 16px);
  margin-bottom: var(--space-5, 20px);
}
.so-header__sub {
  margin: 4px 0 0;
  font-size: var(--text-sm, 13px);
  color: var(--text-secondary, #64748b);
}

/* ── 彙總 KPI（對齊 FeesTab .kpi-card 慣例） ── */
.so-summary {
  margin-bottom: var(--space-5, 20px);
}
.so-summary__cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3, 12px);
}
.kpi-card {
  border: 1px solid var(--neutral-200, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-4, 16px) var(--space-5, 20px);
  background: var(--neutral-0, #fff);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.kpi-label {
  font-size: var(--text-xs, 12px);
  color: var(--text-secondary, #64748b);
}
.kpi-value {
  font-size: 26px;
  font-weight: var(--font-weight-bold, 700);
  color: var(--text-primary, #1e293b);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.kpi-meta {
  font-size: var(--text-xs, 12px);
  color: var(--text-tertiary, #94a3b8);
}
/* 待簽收：唯一注意力焦點（有待簽時才亮 amber，沿用 FeesTab 條件上色慣例） */
.kpi-warning {
  border-color: var(--color-warning, #f59e0b);
  background: var(--color-warning-soft, #fef3c7);
}
.kpi-warning .kpi-value {
  color: var(--color-warning-darker, #b45309);
}
.kpi-warning .kpi-label {
  color: var(--color-warning-darker, #b45309);
}
.kpi-success .kpi-value {
  color: var(--color-success-darker, #15803d);
}
.so-summary__period {
  margin: var(--space-2, 8px) 0 0;
  font-size: var(--text-xs, 12px);
  color: var(--text-tertiary, #94a3b8);
}

/* ── 篩選 ── */
.so-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3, 12px) var(--space-4, 16px);
  margin-bottom: var(--space-4, 16px);
}
.so-filters__rest {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2, 8px);
}

/* ── 骨架 ── */
.so-skeleton {
  padding: var(--space-4, 16px) var(--space-2, 8px);
}

/* ── 表格 ── */
.so-table {
  cursor: pointer;
}
.so-party {
  font-weight: var(--font-weight-medium, 500);
  color: var(--text-primary, #1e293b);
}
.so-amount {
  font-variant-numeric: tabular-nums;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-primary, #1e293b);
}
.so-muted {
  color: var(--text-tertiary, #94a3b8);
}
.so-signer {
  font-size: var(--text-sm, 13px);
  color: var(--text-primary, #1e293b);
}
.so-signer__meta {
  font-size: var(--text-xs, 12px);
  color: var(--text-tertiary, #94a3b8);
}

/* 狀態：用低彩度 soft 底，pending 為待辦語意（amber）、signed 完成（green） */
.so-status {
  display: inline-block;
  padding: 2px 10px;
  border-radius: var(--radius-full, 9999px);
  font-size: var(--text-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  line-height: 1.6;
}
.so-status--pending {
  background: var(--color-warning-soft, #fef3c7);
  color: var(--color-warning-darker, #b45309);
}
.so-status--signed {
  background: var(--color-success-soft, #dcfce7);
  color: var(--color-success-darker, #15803d);
}

.so-attach-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--text-sm, 13px);
  color: var(--text-secondary, #64748b);
  font-variant-numeric: tabular-nums;
}
.so-attach-chip__clip {
  font-size: 14px;
  color: var(--text-tertiary, #94a3b8);
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

/* ── 空狀態 ── */
.so-empty {
  padding: var(--space-8, 32px) var(--space-4, 16px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2, 8px);
}
.so-empty__title {
  margin: 0;
  font-size: var(--text-base, 14px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--text-secondary, #64748b);
}
.so-empty__hint {
  margin: 0 0 var(--space-2, 8px);
  font-size: var(--text-sm, 13px);
  color: var(--text-tertiary, #94a3b8);
}

.so-pagination {
  margin-top: var(--space-4, 16px);
  display: flex;
  justify-content: flex-end;
}

/* ── Dialog 分區表單 ── */
.so-form__section {
  padding-bottom: var(--space-4, 16px);
  margin-bottom: var(--space-4, 16px);
  border-bottom: 1px solid var(--neutral-100, #f1f5f9);
}
.so-form__section:last-of-type {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}
.so-form__section-title {
  font-size: var(--text-sm, 13px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-primary, #1e293b);
  margin-bottom: var(--space-3, 12px);
  display: flex;
  align-items: baseline;
  gap: var(--space-2, 8px);
}
.so-form__section-hint {
  font-size: var(--text-xs, 12px);
  font-weight: var(--font-weight-regular, 400);
  color: var(--text-tertiary, #94a3b8);
}
.so-form__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 var(--space-4, 16px);
}
.so-form__col-2 {
  grid-column: span 2;
}
.so-form__amount-echo {
  margin-left: var(--space-3, 12px);
  font-size: var(--text-sm, 13px);
  color: var(--text-secondary, #64748b);
  font-variant-numeric: tabular-nums;
}
.so-form__audit {
  margin: var(--space-3, 12px) 0 0;
  font-size: var(--text-xs, 12px);
  color: var(--text-tertiary, #94a3b8);
}

/* 簽收憑證區 */
.so-signed-block {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4, 16px);
  flex-wrap: wrap;
}
.so-signed-block--pending {
  justify-content: flex-start;
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
  border: 1px solid var(--neutral-200, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background: #fff;
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
  border: 1px solid var(--neutral-200, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  overflow: hidden;
  background: var(--neutral-50, #f8fafc);
}
.so-att__preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.so-att__doc {
  font-size: var(--text-sm, 13px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-secondary, #64748b);
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
  color: var(--text-secondary, #64748b);
}
.so-att__size {
  color: var(--text-tertiary, #94a3b8);
}
.so-att__remove {
  align-self: flex-start;
}

@media (max-width: 640px) {
  .so-header {
    flex-direction: column;
  }
  .so-form__grid {
    grid-template-columns: 1fr;
  }
  .so-form__col-2 {
    grid-column: span 1;
  }
}
</style>
