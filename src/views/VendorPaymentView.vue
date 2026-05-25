<template>
  <div class="vendor-payment-view">
    <div class="toolbar">
      <h2>廠商付款簽收</h2>
      <div class="toolbar__actions">
        <el-button
          v-if="canWrite"
          type="primary"
          @click="openCreate"
        >新增付款</el-button>
      </div>
    </div>

    <div class="filters">
      <el-date-picker
        v-model="filters.dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="開始日期"
        end-placeholder="結束日期"
        value-format="YYYY-MM-DD"
        @change="fetchList"
      />
      <el-input
        v-model="filters.vendor_name"
        placeholder="廠商名稱"
        clearable
        style="width: 180px"
        @keyup.enter="fetchList"
        @clear="fetchList"
      />
      <el-select
        v-model="filters.status"
        placeholder="狀態"
        clearable
        style="width: 130px"
        @change="fetchList"
      >
        <el-option label="待簽收" value="pending" />
        <el-option label="已簽收" value="signed" />
      </el-select>
      <el-select
        v-model="filters.payment_method"
        placeholder="收付方式"
        clearable
        style="width: 150px"
        @change="fetchList"
      >
        <el-option
          v-for="opt in paymentMethodOptions"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
      <el-button @click="fetchList">查詢</el-button>
    </div>

    <el-table :data="items" v-loading="loading" border stripe>
      <el-table-column prop="payment_date" label="付款日期" width="120" />
      <el-table-column prop="vendor_name" label="廠商" min-width="160" />
      <el-table-column label="金額" prop="amount" width="120" align="right">
        <template #default="{ row }">
          ${{ Number(row.amount || 0).toLocaleString() }}
        </template>
      </el-table-column>
      <el-table-column label="收付方式" width="110">
        <template #default="{ row }">
          {{ paymentMethodLabel(row.payment_method) }}
        </template>
      </el-table-column>
      <el-table-column prop="description" label="項目/說明" min-width="180" />
      <el-table-column label="狀態" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 'signed' ? 'success' : 'warning'" size="small">
            {{ row.status === 'signed' ? '已簽收' : '待簽收' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="簽收人" width="120">
        <template #default="{ row }">
          {{ row.signer_name || '—' }}
        </template>
      </el-table-column>
      <el-table-column label="附件" width="80" align="center">
        <template #default="{ row }">
          {{ row.attachments?.length || 0 }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="260" fixed="right" align="center">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">
            {{ canWrite ? '編輯' : '檢視' }}
          </el-button>
          <el-button
            v-if="canWrite && row.status === 'pending'"
            size="small"
            type="primary"
            @click="openSign(row)"
          >簽收</el-button>
          <el-button
            v-if="canWrite"
            size="small"
            type="danger"
            @click="handleDelete(row)"
          >刪除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination">
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

    <!-- 編輯 / 檢視 Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? (canWrite ? '編輯付款' : '檢視付款') : '新增付款'"
      width="560px"
      destroy-on-close
    >
      <el-form :model="form" label-width="100px">
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
        <el-form-item label="廠商名稱" required>
          <el-input v-model="form.vendor_name" maxlength="120" :disabled="!canWrite" />
        </el-form-item>
        <el-form-item label="金額" required>
          <el-input-number
            v-model="form.amount"
            :min="0"
            :max="99999999"
            :precision="0"
            :step="100"
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
        <el-form-item label="項目/說明">
          <el-input v-model="form.description" maxlength="255" :disabled="!canWrite" />
        </el-form-item>
        <el-form-item label="發票號">
          <el-input v-model="form.invoice_number" maxlength="60" :disabled="!canWrite" />
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="form.notes" type="textarea" :rows="2" :disabled="!canWrite" />
        </el-form-item>

        <el-form-item v-if="editingId" label="附件">
          <div class="attachments-section">
            <div v-if="!form.attachments?.length" class="attachments-empty">尚無附件</div>
            <div
              v-for="att in form.attachments || []"
              :key="att.key"
              class="attachment-row"
            >
              <span class="attachment-name">{{ att.filename }}</span>
              <span class="attachment-size">{{ formatSize(att.size) }}</span>
              <el-button
                size="small"
                link
                type="primary"
                tag="a"
                :href="downloadAttachmentUrl(editingId, att.key)"
                target="_blank"
              >下載</el-button>
              <el-button
                v-if="canWrite"
                size="small"
                link
                type="danger"
                @click="removeAttachment(att.key)"
              >刪除</el-button>
            </div>
            <el-upload
              v-if="canWrite"
              :auto-upload="true"
              :http-request="handleAttachmentUpload"
              :show-file-list="false"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
            >
              <el-button size="small">＋ 上傳附件</el-button>
            </el-upload>
          </div>
        </el-form-item>

        <el-form-item v-if="editingId && form.status === 'signed'" label="簽收">
          <div class="signed-info">
            <div>狀態：<el-tag type="success" size="small">已簽收</el-tag></div>
            <div>簽收人：{{ form.signer_name || '—' }}</div>
            <div>簽收時間：{{ formatDateTime(form.signed_at) }}</div>
            <div v-if="form.has_signature" class="signature-preview">
              <img :src="signatureUrl(editingId)" alt="簽名" />
            </div>
          </div>
        </el-form-item>
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
import {
  listVendorPayments,
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
} from '@/api/vendorPayment'
import { hasPermission, PERMISSION_NAMES } from '@/utils/auth'
import VendorPaymentSignDialog from '@/components/VendorPaymentSignDialog.vue'

const paymentMethodOptions = PAYMENT_METHOD_OPTIONS

const canWrite = computed(() => hasPermission(PERMISSION_NAMES.VENDOR_PAYMENT_WRITE))

interface Attachment { key: string; filename: string; size: number }
const items = ref<Record<string, unknown>[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)

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

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
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
  has_signature: boolean
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
  has_signature: false,
})

const signDialogVisible = ref(false)
const signingId = ref<number | null>(null)

const downloadAttachmentUrl = downloadVendorPaymentAttachmentUrl
const signatureUrl = vendorPaymentSignatureUrl

async function fetchList() {
  loading.value = true
  try {
    const params: Record<string, unknown> = {
      page: page.value,
      page_size: pageSize.value,
    }
    if (filters.dateRange?.length === 2) {
      params.start_date = filters.dateRange[0]
      params.end_date = filters.dateRange[1]
    }
    if (filters.vendor_name) params.vendor_name = filters.vendor_name
    if (filters.status) params.status = filters.status
    if (filters.payment_method) params.payment_method = filters.payment_method

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

function resetForm() {
  Object.assign(form, {
    payment_date: new Date().toISOString().slice(0, 10),
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
    has_signature: false,
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
    has_signature: row.has_signature,
  })
  dialogVisible.value = true
}

function openSign(row: Record<string, unknown>) {
  signingId.value = row.id as number | null
  signDialogVisible.value = true
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
    fetchList()
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
      { type: 'warning', confirmButtonText: '確定刪除', confirmButtonClass: 'el-button--danger' }
    )
    await deleteVendorPayment(row.id as number)
    ElMessage.success('已刪除')
    fetchList()
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
  fetchList()
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
  } catch (e) {
    ElMessage.warning('找不到該筆付款紀錄')
  }
}

onMounted(async () => {
  await fetchList()
  await tryOpenHighlight()
})
</script>

<style scoped>
.vendor-payment-view { padding: 16px; }
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.toolbar h2 { margin: 0; font-size: 20px; font-weight: 600; }
.filters {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
.attachments-section { width: 100%; }
.attachments-empty { color: #909399; font-size: 13px; margin-bottom: 8px; }
.attachment-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
}
.attachment-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attachment-size { color: #909399; font-size: 12px; }
.signed-info { line-height: 1.8; font-size: 13px; }
.signature-preview { margin-top: 8px; }
.signature-preview img {
  max-width: 200px;
  max-height: 100px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  background: #fff;
}
</style>
