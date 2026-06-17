<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { listDsrRequests, approveDsrRequest, rejectDsrRequest } from '@/api/dsr'
import { apiError } from '@/utils/error'
import type { Schema } from '@/api/_generated/typed'
import AdminListToolbar from '@/components/common/AdminListToolbar.vue'

type DsrRecord = Schema<'DsrRequestAdminOut'>

// --- Label maps ---
const REQUEST_TYPE_LABEL: Record<string, string> = {
  delete: '刪除',
  correct: '更正',
  opt_out: '停止處理',
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待處理',
  approved: '已核准',
  rejected: '已駁回',
}

const STATUS_TAG_TYPE: Record<string, 'info' | 'success' | 'danger'> = {
  pending: 'info',
  approved: 'success',
  rejected: 'danger',
}

// --- State ---
const records = ref<DsrRecord[]>([])
const loading = ref(false)
const statusFilter = ref<string>('pending')
const dsrFilterGroups = [{
  key: 'status', label: '狀態', allLabel: '全部',
  options: [
    { label: '待處理', value: 'pending' },
    { label: '已核准', value: 'approved' },
    { label: '已駁回', value: 'rejected' },
  ],
}]
const dsrFilterValues = computed<Record<string, unknown>>(() => ({ status: statusFilter.value }))

// Approve dialog
const approveDialogVisible = ref(false)
const approveTarget = ref<DsrRecord | null>(null)
const approveNote = ref('')
const approveLoading = ref(false)

// Reject dialog
const rejectDialogVisible = ref(false)
const rejectTarget = ref<DsrRecord | null>(null)
const rejectNote = ref('')
const rejectLoading = ref(false)

// --- Fetch ---
const fetchList = async () => {
  loading.value = true
  try {
    const params = statusFilter.value ? { status: statusFilter.value } : undefined
    const res = await listDsrRequests(params)
    records.value = res.data
  } catch (err) {
    ElMessage.error(apiError(err, '載入 DSR 請求失敗'))
  } finally {
    loading.value = false
  }
}

const onStatusFilterChange = (v: Record<string, unknown>) => {
  statusFilter.value = (v.status as string) ?? ''
  return fetchList()
}

// --- Approve ---
const openApproveDialog = (row: DsrRecord) => {
  approveTarget.value = row
  approveNote.value = ''
  approveDialogVisible.value = true
}

const submitApprove = async () => {
  if (!approveTarget.value) return
  approveLoading.value = true
  try {
    await approveDsrRequest(approveTarget.value.id, { decision_note: approveNote.value })
    ElMessage.success('已核准')
    approveDialogVisible.value = false
    await fetchList()
  } catch (err) {
    ElMessage.error(apiError(err, '核准失敗'))
  } finally {
    approveLoading.value = false
  }
}

// --- Reject ---
const openRejectDialog = (row: DsrRecord) => {
  rejectTarget.value = row
  rejectNote.value = ''
  rejectDialogVisible.value = true
}

const submitReject = async () => {
  if (!rejectTarget.value) return
  if (!rejectNote.value.trim()) {
    ElMessage.warning('請填寫駁回說明')
    return
  }
  rejectLoading.value = true
  try {
    await rejectDsrRequest(rejectTarget.value.id, { decision_note: rejectNote.value })
    ElMessage.success('已駁回')
    rejectDialogVisible.value = false
    await fetchList()
  } catch (err) {
    ElMessage.error(apiError(err, '駁回失敗'))
  } finally {
    rejectLoading.value = false
  }
}

onMounted(fetchList)
</script>

<template>
  <div class="dsr-requests-view">
    <h2 class="page-title">個資請求佇列（DSR）</h2>

    <AdminListToolbar
      :searchable="false"
      :filters="dsrFilterGroups"
      :filter-values="dsrFilterValues"
      :total="records.length"
      @update:filter-values="onStatusFilterChange"
    />

    <el-table :data="records" v-loading="loading" style="width: 100%">
      <el-table-column prop="id" label="編號" width="80" />
      <el-table-column label="類型" width="120">
        <template #default="{ row }">
          {{ REQUEST_TYPE_LABEL[row.request_type] ?? row.request_type }}
        </template>
      </el-table-column>
      <el-table-column label="狀態" width="110">
        <template #default="{ row }">
          <el-tag :type="STATUS_TAG_TYPE[row.status] ?? 'info'" size="small">
            {{ STATUS_LABEL[row.status] ?? row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="主體" width="160">
        <template #default="{ row }">
          <span v-if="row.subject_entity_type">
            {{ row.subject_entity_type }}
            <span v-if="row.subject_entity_id"> #{{ row.subject_entity_id }}</span>
          </span>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column prop="reason" label="申請原因" show-overflow-tooltip />
      <el-table-column prop="submitted_at" label="提交時間" width="180" />
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <template v-if="row.status === 'pending'">
            <el-button link type="success" @click="openApproveDialog(row)">核准</el-button>
            <el-button link type="danger" @click="openRejectDialog(row)">駁回</el-button>
          </template>
          <span v-else style="color: var(--text-tertiary);">—</span>
        </template>
      </el-table-column>
    </el-table>

    <!-- Approve Dialog -->
    <el-dialog v-model="approveDialogVisible" title="核准 DSR 請求" width="480px">
      <p>
        請求類型：<strong>{{ REQUEST_TYPE_LABEL[approveTarget?.request_type ?? ''] ?? approveTarget?.request_type }}</strong>
      </p>
      <el-form label-width="90px">
        <el-form-item label="決議說明">
          <el-input
            v-model="approveNote"
            type="textarea"
            :rows="3"
            placeholder="（選填）核准說明"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="approveDialogVisible = false">取消</el-button>
        <el-button type="success" :loading="approveLoading" @click="submitApprove">確認核准</el-button>
      </template>
    </el-dialog>

    <!-- Reject Dialog -->
    <el-dialog v-model="rejectDialogVisible" title="駁回 DSR 請求" width="480px">
      <p>
        請求類型：<strong>{{ REQUEST_TYPE_LABEL[rejectTarget?.request_type ?? ''] ?? rejectTarget?.request_type }}</strong>
      </p>
      <el-form label-width="90px">
        <el-form-item label="駁回說明">
          <el-input
            v-model="rejectNote"
            type="textarea"
            :rows="3"
            placeholder="必填，請填寫駁回原因"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectDialogVisible = false">取消</el-button>
        <el-button type="danger" :loading="rejectLoading" @click="submitReject">確認駁回</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.dsr-requests-view {
  padding: 24px;
}

.page-title {
  margin-bottom: 20px;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}
</style>
