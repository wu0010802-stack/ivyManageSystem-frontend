<template>
  <div class="vendor-payment-view">
    <!-- 頁首 -->
    <header class="vp-header">
      <div class="vp-header__title">
        <h2>廠商付款簽收</h2>
        <p class="vp-header__sub">逐筆登記廠商請款，上傳廠商簽收的紙本憑證留存</p>
      </div>
      <el-button
        v-if="canWrite"
        type="primary"
        @click="openCreate"
      >新增付款</el-button>
    </header>

    <!-- 區間彙總（跨狀態，隨日期/廠商/收付方式篩選連動；不受狀態篩選影響） -->
    <section class="vp-summary" aria-label="本期彙總">
      <div class="vp-summary__cards" v-loading="summaryLoading">
        <div class="kpi-card">
          <div class="kpi-label">本期付款總額</div>
          <div class="kpi-value">{{ formatMoney(summary.total_amount) }}</div>
          <div class="kpi-meta">共 {{ summary.total_count }} 筆</div>
        </div>
        <div class="kpi-card" :class="{ 'kpi-warning': summary.pending_count > 0 }">
          <div class="kpi-label">待廠商簽收</div>
          <div class="kpi-value">{{ formatMoney(summary.pending_amount) }}</div>
          <div class="kpi-meta">{{ summary.pending_count }} 筆等待回簽</div>
        </div>
        <div class="kpi-card" :class="{ 'kpi-success': summary.signed_count > 0 }">
          <div class="kpi-label">已簽收</div>
          <div class="kpi-value">{{ formatMoney(summary.signed_amount) }}</div>
          <div class="kpi-meta">{{ summary.signed_count }} 筆已完成</div>
        </div>
      </div>
      <p class="vp-summary__period">本期：{{ rangeLabel }}</p>
    </section>

    <!-- 篩選：狀態為主軸（分段），其餘為次要條件 -->
    <div class="vp-filters">
      <el-radio-group v-model="filters.status" class="vp-filters__status" @change="fetchList">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="pending">待簽收</el-radio-button>
        <el-radio-button value="signed">已簽收</el-radio-button>
      </el-radio-group>

      <div class="vp-filters__rest">
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
          v-model="filters.vendor_name"
          placeholder="搜尋廠商名稱"
          clearable
          style="width: 200px"
          @keyup.enter="refresh"
          @clear="refresh"
        />
        <el-select
          v-model="filters.payment_method"
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
    <el-skeleton v-if="loading && !items.length" :rows="6" animated class="vp-skeleton" />

    <el-table
      v-else
      :data="items"
      v-loading="loading && items.length > 0"
      row-key="id"
      class="vp-table"
      @row-click="onRowClick"
    >
      <el-table-column prop="payment_date" label="付款日期" width="116" />
      <el-table-column prop="vendor_name" label="廠商" min-width="160">
        <template #default="{ row }">
          <span class="vp-vendor">{{ row.vendor_name }}</span>
        </template>
      </el-table-column>
      <el-table-column label="金額" width="132" align="right">
        <template #default="{ row }">
          <span class="vp-amount">{{ formatMoney(row.amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="收付方式" width="104">
        <template #default="{ row }">
          {{ paymentMethodLabel(row.payment_method) }}
        </template>
      </el-table-column>
      <el-table-column prop="description" label="項目／說明" min-width="180">
        <template #default="{ row }">
          <span :class="{ 'vp-muted': !row.description }">{{ row.description || '未填寫' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="狀態" width="92" align="center">
        <template #default="{ row }">
          <span class="vp-status" :class="`vp-status--${row.status}`">
            {{ row.status === 'signed' ? '已簽收' : '待簽收' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="簽收" min-width="128">
        <template #default="{ row }">
          <template v-if="row.status === 'signed'">
            <div class="vp-signer">{{ row.signer_name || '已簽收' }}</div>
            <div class="vp-signer__meta">{{ signKindLabel(row.signature_kind) }}</div>
          </template>
          <span v-else class="vp-muted">尚未回簽</span>
        </template>
      </el-table-column>
      <el-table-column label="附件" width="76" align="center">
        <template #default="{ row }">
          <span v-if="row.attachments?.length" class="vp-attach-chip" title="附件數">
            <el-icon class="vp-attach-chip__clip"><Paperclip /></el-icon>{{ row.attachments.length }}
          </span>
          <span v-else class="vp-muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right" align="right">
        <template #default="{ row }">
          <div class="vp-actions" @click.stop>
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
              <el-button size="small" class="vp-actions__more" aria-label="更多操作">⋯</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit">
                    {{ canWrite ? '編輯' : '檢視' }}
                  </el-dropdown-item>
                  <el-dropdown-item v-if="canWrite" command="delete" divided>刪除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </el-table-column>

      <template #empty>
        <div class="vp-empty">
          <template v-if="hasActiveFilters">
            <p class="vp-empty__title">目前篩選條件下沒有符合的紀錄</p>
            <el-button text type="primary" @click="clearFilters">清除篩選條件</el-button>
          </template>
          <template v-else>
            <p class="vp-empty__title">尚無廠商付款紀錄</p>
            <p class="vp-empty__hint">點右上「新增付款」開始登記第一筆廠商請款。</p>
            <el-button v-if="canWrite" type="primary" @click="openCreate">新增付款</el-button>
          </template>
        </div>
      </template>
    </el-table>

    <div class="vp-pagination">
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
      class="vp-dialog"
    >
      <el-form :model="form" label-position="top" class="vp-form">
        <div class="vp-form__section">
          <div class="vp-form__section-title">請款資訊</div>
          <div class="vp-form__grid">
            <el-form-item label="付款日期" required>
              <el-date-picker
                v-model="form.payment_date"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="選擇日期"
                style="width: 100%"
                :disabled="!canWrite"
              />
            </el-form-item>
            <el-form-item label="收付方式" required>
              <el-select v-model="form.payment_method" style="width: 100%" :disabled="!canWrite">
                <el-option
                  v-for="opt in paymentMethodOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="廠商名稱" required class="vp-form__col-2">
              <el-input v-model="form.vendor_name" maxlength="120" :disabled="!canWrite" placeholder="例：好棒棒清潔用品行" />
            </el-form-item>
            <el-form-item label="金額" required class="vp-form__col-2">
              <el-input-number
                v-model="form.amount"
                :min="0"
                :max="99999999"
                :precision="0"
                :step="100"
                controls-position="right"
                style="width: 100%"
                :disabled="!canWrite"
              />
              <span class="vp-form__amount-echo">{{ formatMoney(form.amount) }}</span>
            </el-form-item>
          </div>
        </div>

        <div class="vp-form__section">
          <div class="vp-form__section-title">單據明細</div>
          <el-form-item label="項目／說明">
            <el-input v-model="form.description" maxlength="255" :disabled="!canWrite" placeholder="例：5 月清潔用品" />
          </el-form-item>
          <div class="vp-form__grid">
            <el-form-item label="發票／收據號">
              <el-input v-model="form.invoice_number" maxlength="60" :disabled="!canWrite" />
            </el-form-item>
          </div>
          <el-form-item label="備註">
            <el-input v-model="form.notes" type="textarea" :rows="2" :disabled="!canWrite" />
          </el-form-item>
        </div>

        <div v-if="editingId" class="vp-form__section">
          <div class="vp-form__section-title">
            簽收憑證
            <span class="vp-form__section-hint">翻為「已簽收」所留存的廠商簽名／簽收照片（1 張）</span>
          </div>
          <div v-if="form.status === 'signed'" class="vp-signed-block">
            <div class="vp-signed-block__info">
              <span class="vp-status vp-status--signed">已簽收</span>
              <span>{{ form.signer_name || '—' }}</span>
              <span class="vp-muted">{{ formatDateTime(form.signed_at) }}・{{ signKindLabel(form.signature_kind) }}</span>
            </div>
            <a
              v-if="form.has_signature"
              :href="signatureUrl(editingId)"
              target="_blank"
              class="vp-signed-block__thumb"
            >
              <img :src="signatureUrl(editingId)" alt="簽收憑證" />
            </a>
          </div>
          <div v-else class="vp-signed-block vp-signed-block--pending">
            <span class="vp-muted">尚未回簽</span>
            <el-button v-if="canWrite" size="small" type="primary" @click="openSignFromDialog">上傳簽收憑證</el-button>
          </div>
        </div>

        <div v-if="editingId" class="vp-form__section">
          <div class="vp-form__section-title">
            單據附件
            <span class="vp-form__section-hint">發票、請款單等補充文件（最多 5 張）</span>
          </div>
          <div class="vp-attachments">
            <div v-if="!form.attachments?.length" class="vp-muted vp-attachments__empty">尚無附件</div>
            <div class="vp-attachments__grid">
              <div
                v-for="att in form.attachments || []"
                :key="att.key"
                class="vp-att"
              >
                <a
                  :href="downloadAttachmentUrl(editingId, att.key)"
                  target="_blank"
                  class="vp-att__preview"
                  :title="att.filename"
                >
                  <img v-if="isImageAttachment(att)" :src="downloadAttachmentUrl(editingId, att.key)" :alt="att.filename" />
                  <span v-else class="vp-att__doc" aria-hidden="true">PDF</span>
                </a>
                <div class="vp-att__meta">
                  <span class="vp-att__name" :title="att.filename">{{ att.filename }}</span>
                  <span class="vp-att__size">{{ formatSize(att.size) }}</span>
                </div>
                <el-button
                  v-if="canWrite"
                  size="small"
                  link
                  type="danger"
                  class="vp-att__remove"
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
              class="vp-attachments__upload"
            >
              <el-button size="small" plain>＋ 上傳附件</el-button>
            </el-upload>
          </div>
        </div>

        <p v-if="editingId && form.created_by_name" class="vp-form__audit">
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

    <VendorPaymentSignDialog
      v-model="signDialogVisible"
      :payment-id="signingId"
      @signed="onSigned"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Paperclip } from '@element-plus/icons-vue'
import {
  listVendorPayments,
  getVendorPaymentSummary,
  getVendorPayment,
  createVendorPayment,
  updateVendorPayment,
  deleteVendorPayment,
  uploadVendorPaymentAttachment,
  deleteVendorPaymentAttachment,
  downloadVendorPaymentAttachmentUrl,
  vendorPaymentSignatureUrl,
  PAYMENT_METHOD_OPTIONS,
  paymentMethodLabel,
  type VendorPaymentSummary,
} from '@/api/vendorPayment'
import { hasPermission, PERMISSION_NAMES } from '@/utils/auth'
import { todayISO } from '@/utils/format'
import { formatCurrency } from '@/utils/currency'
import VendorPaymentSignDialog from '@/components/VendorPaymentSignDialog.vue'

const paymentMethodOptions = PAYMENT_METHOD_OPTIONS

const canWrite = computed(() => hasPermission(PERMISSION_NAMES.VENDOR_PAYMENT_WRITE))

interface Attachment { key: string; filename: string; size: number; mime_type?: string | null }
const items = ref<Record<string, unknown>[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)

const EMPTY_SUMMARY: VendorPaymentSummary = {
  total_count: 0,
  total_amount: 0,
  pending_count: 0,
  pending_amount: 0,
  signed_count: 0,
  signed_amount: 0,
}
const summary = ref<VendorPaymentSummary>({ ...EMPTY_SUMMARY })
const summaryLoading = ref(false)

const filters = reactive<{
  dateRange: string[] | null
  vendor_name: string
  status: string
  payment_method: string
}>({
  dateRange: null,
  vendor_name: '',
  status: '',
  payment_method: '',
})

const hasActiveFilters = computed(
  () =>
    !!filters.status ||
    !!filters.vendor_name ||
    !!filters.payment_method ||
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
  editingId.value ? (canWrite.value ? '編輯付款' : '檢視付款') : '新增付款',
)

const form = reactive<{
  payment_date: string
  vendor_name: string
  amount: number
  payment_method: string
  description: string
  invoice_number: string
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
  payment_date: '',
  vendor_name: '',
  amount: 0,
  payment_method: 'cash',
  description: '',
  invoice_number: '',
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

const downloadAttachmentUrl = downloadVendorPaymentAttachmentUrl
const signatureUrl = vendorPaymentSignatureUrl

function buildRangeParams(): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  if (filters.dateRange?.length === 2) {
    params.start_date = filters.dateRange[0]
    params.end_date = filters.dateRange[1]
  }
  if (filters.vendor_name) params.vendor_name = filters.vendor_name
  if (filters.payment_method) params.payment_method = filters.payment_method
  return params
}

async function fetchList() {
  loading.value = true
  try {
    const params = buildRangeParams()
    params.page = page.value
    params.page_size = pageSize.value
    if (filters.status) params.status = filters.status

    const res = await listVendorPayments(params)
    items.value = res.data.items
    total.value = res.data.total
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
    const res = await getVendorPaymentSummary(buildRangeParams())
    summary.value = res.data as VendorPaymentSummary
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
  filters.vendor_name = ''
  filters.status = ''
  filters.payment_method = ''
  refresh()
}

function resetForm() {
  Object.assign(form, {
    // 用本地時區今日，避免 toISOString() 走 UTC 在台北 00:00-08:00 預設成昨天
    payment_date: todayISO(),
    vendor_name: '',
    amount: 0,
    payment_method: 'cash',
    description: '',
    invoice_number: '',
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
    payment_date: row.payment_date,
    vendor_name: row.vendor_name,
    amount: Number(row.amount),
    payment_method: row.payment_method,
    description: row.description || '',
    invoice_number: row.invoice_number || '',
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
  if (!form.payment_date || !form.vendor_name || form.amount == null) {
    return ElMessage.warning('請填寫日期、廠商與金額')
  }
  saving.value = true
  try {
    const payload = {
      payment_date: form.payment_date,
      vendor_name: form.vendor_name,
      amount: form.amount,
      payment_method: form.payment_method,
      description: form.description || null,
      invoice_number: form.invoice_number || null,
      notes: form.notes || null,
    }
    if (editingId.value) {
      await updateVendorPayment(editingId.value, payload)
      ElMessage.success('更新成功')
    } else {
      await createVendorPayment(payload)
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
      `確定刪除「${row.vendor_name}」付款紀錄？此動作無法復原。`,
      '確認刪除',
      { type: 'warning', confirmButtonText: '確定刪除', confirmButtonClass: 'el-button--danger' },
    )
    await deleteVendorPayment(row.id as number)
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
    const res = await uploadVendorPaymentAttachment(editingId.value, fd)
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
    await deleteVendorPaymentAttachment(editingId.value as number, key)
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

const route = useRoute()

async function tryOpenHighlight() {
  const id = Number(route.query?.highlight)
  if (!id) return
  try {
    const res = await getVendorPayment(id)
    openEdit(res.data)
  } catch {
    ElMessage.warning('找不到該筆付款紀錄')
  }
}

onMounted(async () => {
  await Promise.all([fetchList(), fetchSummary()])
  await tryOpenHighlight()
})
</script>

<style scoped>
.vendor-payment-view {
  padding: var(--space-4, 16px);
}

/* ── 頁首 ── */
.vp-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4, 16px);
  margin-bottom: var(--space-5, 20px);
}
.vp-header h2 {
  margin: 0;
  font-size: var(--text-2xl, 20px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-primary, #1e293b);
}
.vp-header__sub {
  margin: 4px 0 0;
  font-size: var(--text-sm, 13px);
  color: var(--text-secondary, #64748b);
}

/* ── 彙總 KPI（對齊 FeesTab .kpi-card 慣例） ── */
.vp-summary {
  margin-bottom: var(--space-5, 20px);
}
.vp-summary__cards {
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
.vp-summary__period {
  margin: var(--space-2, 8px) 0 0;
  font-size: var(--text-xs, 12px);
  color: var(--text-tertiary, #94a3b8);
}

/* ── 篩選 ── */
.vp-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3, 12px) var(--space-4, 16px);
  margin-bottom: var(--space-4, 16px);
}
.vp-filters__rest {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2, 8px);
}

/* ── 骨架 ── */
.vp-skeleton {
  padding: var(--space-4, 16px) var(--space-2, 8px);
}

/* ── 表格 ── */
.vp-table {
  cursor: pointer;
}
.vp-vendor {
  font-weight: var(--font-weight-medium, 500);
  color: var(--text-primary, #1e293b);
}
.vp-amount {
  font-variant-numeric: tabular-nums;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-primary, #1e293b);
}
.vp-muted {
  color: var(--text-tertiary, #94a3b8);
}
.vp-signer {
  font-size: var(--text-sm, 13px);
  color: var(--text-primary, #1e293b);
}
.vp-signer__meta {
  font-size: var(--text-xs, 12px);
  color: var(--text-tertiary, #94a3b8);
}

/* 狀態：用低彩度 soft 底，pending 為待辦語意（amber）、signed 完成（green） */
.vp-status {
  display: inline-block;
  padding: 2px 10px;
  border-radius: var(--radius-full, 9999px);
  font-size: var(--text-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  line-height: 1.6;
}
.vp-status--pending {
  background: var(--color-warning-soft, #fef3c7);
  color: var(--color-warning-darker, #b45309);
}
.vp-status--signed {
  background: var(--color-success-soft, #dcfce7);
  color: var(--color-success-darker, #15803d);
}

.vp-attach-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--text-sm, 13px);
  color: var(--text-secondary, #64748b);
  font-variant-numeric: tabular-nums;
}
.vp-attach-chip__clip {
  font-size: 14px;
  color: var(--text-tertiary, #94a3b8);
}

.vp-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1, 4px);
  justify-content: flex-end;
}
.vp-actions__more {
  padding-left: 8px;
  padding-right: 8px;
  font-weight: 700;
}

/* ── 空狀態 ── */
.vp-empty {
  padding: var(--space-8, 32px) var(--space-4, 16px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2, 8px);
}
.vp-empty__title {
  margin: 0;
  font-size: var(--text-base, 14px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--text-secondary, #64748b);
}
.vp-empty__hint {
  margin: 0 0 var(--space-2, 8px);
  font-size: var(--text-sm, 13px);
  color: var(--text-tertiary, #94a3b8);
}

.vp-pagination {
  margin-top: var(--space-4, 16px);
  display: flex;
  justify-content: flex-end;
}

/* ── Dialog 分區表單 ── */
.vp-form__section {
  padding-bottom: var(--space-4, 16px);
  margin-bottom: var(--space-4, 16px);
  border-bottom: 1px solid var(--neutral-100, #f1f5f9);
}
.vp-form__section:last-of-type {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}
.vp-form__section-title {
  font-size: var(--text-sm, 13px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-primary, #1e293b);
  margin-bottom: var(--space-3, 12px);
  display: flex;
  align-items: baseline;
  gap: var(--space-2, 8px);
}
.vp-form__section-hint {
  font-size: var(--text-xs, 12px);
  font-weight: var(--font-weight-regular, 400);
  color: var(--text-tertiary, #94a3b8);
}
.vp-form__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 var(--space-4, 16px);
}
.vp-form__col-2 {
  grid-column: span 2;
}
.vp-form__amount-echo {
  margin-left: var(--space-3, 12px);
  font-size: var(--text-sm, 13px);
  color: var(--text-secondary, #64748b);
  font-variant-numeric: tabular-nums;
}
.vp-form__audit {
  margin: var(--space-3, 12px) 0 0;
  font-size: var(--text-xs, 12px);
  color: var(--text-tertiary, #94a3b8);
}

/* 簽收憑證區 */
.vp-signed-block {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4, 16px);
  flex-wrap: wrap;
}
.vp-signed-block--pending {
  justify-content: flex-start;
}
.vp-signed-block__info {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
  font-size: var(--text-sm, 13px);
}
.vp-signed-block__thumb img {
  max-width: 180px;
  max-height: 90px;
  border: 1px solid var(--neutral-200, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background: #fff;
  display: block;
}

/* 附件區 */
.vp-attachments__empty {
  font-size: var(--text-sm, 13px);
  margin-bottom: var(--space-2, 8px);
}
.vp-attachments__grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3, 12px);
  margin-bottom: var(--space-3, 12px);
}
.vp-att {
  width: 120px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.vp-att__preview {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 80px;
  border: 1px solid var(--neutral-200, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  overflow: hidden;
  background: var(--neutral-50, #f8fafc);
}
.vp-att__preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.vp-att__doc {
  font-size: var(--text-sm, 13px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-secondary, #64748b);
  letter-spacing: 0.05em;
}
.vp-att__meta {
  display: flex;
  flex-direction: column;
  font-size: var(--text-xs, 12px);
}
.vp-att__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary, #64748b);
}
.vp-att__size {
  color: var(--text-tertiary, #94a3b8);
}
.vp-att__remove {
  align-self: flex-start;
}

@media (max-width: 640px) {
  .vp-header {
    flex-direction: column;
  }
  .vp-form__grid {
    grid-template-columns: 1fr;
  }
  .vp-form__col-2 {
    grid-column: span 1;
  }
}
</style>
