<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getOvertimes, createOvertime, updateOvertime, approveOvertime as approveOvertimeApi, batchApproveOvertimes, getOvertimeImportTemplate, importOvertimes } from '@/api/overtimes'
import { getApprovalLogs, getApprovalPolicies } from '@/api/approvalSettings'
import { getUserInfo, hasPermission } from '@/utils/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useEmployeeStore } from '@/stores/employee'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import { useCrudDialog, useConfirmDelete, useDateQuery } from '@/composables'
import { apiError } from '@/utils/error'
import { downloadFile } from '@/utils/download'
import { money } from '@/utils/format'
import MeetingManagementPanel from '@/components/overtime/MeetingManagementPanel.vue'

const { currentYear, query } = useDateQuery()
const employeeStore = useEmployeeStore()
const route = useRoute()
const router = useRouter()

const canViewOvertime = hasPermission('OVERTIME_READ')
const canViewMeetings = hasPermission('MEETINGS')
const activeSection = ref('overtime')

const loading = ref(false)
const overtimeRecords = ref([])
const pendingRecords = ref([])

const overtimeTypes = [
  { value: 'weekday', label: '平日',           desc: '前2h ×1.34，超過2h ×1.67' },
  { value: 'weekend', label: '休息日',          desc: '前2h ×1.33，3~8h ×1.67，超8h ×2.67（最低計2h）' },
  { value: 'holiday', label: '例假日/國定假日', desc: '全部 ×2.0' },
]

const form = reactive({
  id: null,
  employee_id: null,
  overtime_date: '',
  overtime_type: 'weekday',
  start_time: '',
  end_time: '',
  hours: 1,
  reason: '',
  use_comp_leave: false,
})

const resetForm = () => {
  form.id = null
  form.employee_id = null
  form.overtime_date = ''
  form.overtime_type = 'weekday'
  form.start_time = ''
  form.end_time = ''
  form.hours = 1
  form.reason = ''
  form.use_comp_leave = false
}

const populateForm = (row) => {
  form.id = row.id
  form.employee_id = row.employee_id
  form.overtime_date = row.overtime_date
  form.overtime_type = row.overtime_type
  form.start_time = row.start_time || ''
  form.end_time = row.end_time || ''
  form.hours = row.hours
  form.reason = row.reason || ''
  form.use_comp_leave = row.use_comp_leave || false
}

const { dialogVisible, isEdit, openCreate, openEdit, closeDialog } = useCrudDialog({ resetForm, populateForm })

const resolveSectionFromRoute = () => {
  if (route.query.tab === 'meetings' && canViewMeetings) return 'meetings'
  if (canViewOvertime) return 'overtime'
  if (canViewMeetings) return 'meetings'
  return 'overtime'
}

const fetchOvertimes = async () => {
  if (!canViewOvertime) return
  loading.value = true
  try {
    const params = { year: query.year, month: query.month }
    if (query.employee_id) params.employee_id = query.employee_id
    const response = await getOvertimes(params)
    overtimeRecords.value = Array.isArray(response.data) ? response.data : []
  } catch (error) {
    ElMessage.error('載入加班記錄失敗')
  } finally {
    loading.value = false
  }
}

const fetchPendingOvertimes = async () => {
  if (!canViewOvertime) return
  try {
    const response = await getOvertimes({ status: 'pending' })
    pendingRecords.value = Array.isArray(response.data) ? response.data : []
  } catch {
    // silent
  }
}

const saveOvertimeLoading = ref(false)
const approveActionLoading = ref(false)

const saveOvertime = async () => {
  if (!form.employee_id || !form.overtime_date) {
    ElMessage.warning('請填寫必要欄位')
    return
  }
  saveOvertimeLoading.value = true
  try {
    const payload = {
      employee_id: form.employee_id,
      overtime_date: form.overtime_date,
      overtime_type: form.overtime_type,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      hours: form.hours,
      reason: form.reason || null,
      use_comp_leave: form.use_comp_leave,
    }
    if (isEdit.value) {
      const { employee_id, ...updatePayload } = payload
      const resp = await updateOvertime(form.id, updatePayload)
      ElMessage.success(`加班記錄已更新，加班費: $${resp.data.overtime_pay?.toLocaleString() || 0}`)
    } else {
      const resp = await createOvertime(payload)
      ElMessage.success(`加班記錄已新增，加班費: $${resp.data.overtime_pay?.toLocaleString() || 0}`)
    }
    closeDialog()
    fetchOvertimes()
    fetchPendingOvertimes()
  } catch (error) {
    ElMessage.error('儲存失敗: ' + apiError(error, error.message))
  } finally {
    saveOvertimeLoading.value = false
  }
}

const onDeleteSuccess = () => {
  fetchOvertimes()
  fetchPendingOvertimes()
}

const { confirmDelete: deleteOvertime } = useConfirmDelete({
  endpoint: '/overtimes',
  onSuccess: onDeleteSuccess,
  successMsg: '已刪除',
})

const approveOvertime = async (row, approved) => {
  approveActionLoading.value = true
  try {
    await approveOvertimeApi(row.id, approved)
    ElMessage.success(approved ? '已核准' : '已駁回')
    fetchOvertimes()
    fetchPendingOvertimes()
  } catch (error) {
    ElMessage.error('操作失敗：' + apiError(error, error.message))
  } finally {
    approveActionLoading.value = false
  }
}


const overtimeSummary = computed(() =>
  overtimeRecords.value.reduce(
    (acc, r) => {
      acc.totalHours += r.hours || 0
      acc.totalPay += r.overtime_pay || 0
      return acc
    },
    { totalHours: 0, totalPay: 0 },
  ),
)

// ── 批次審核 ──
const selectedOvertimes = ref([])
const batchRejectVisible = ref(false)
const batchRejectReason = ref('')
const batchLoading = ref(false)

const handleSelectionChange = (selection) => {
  selectedOvertimes.value = selection
}

const showBatchApproveConfirm = async () => {
  try {
    await ElMessageBox.confirm(
      `確認批次核准選取的 ${selectedOvertimes.value.length} 筆加班記錄？`,
      '批次核准',
      { type: 'warning', confirmButtonText: '確認核准', cancelButtonText: '取消' }
    )
    batchLoading.value = true
    const ids = selectedOvertimes.value.map(r => r.id)
    const res = await batchApproveOvertimes(ids, true)
    const { succeeded, failed } = res.data
    if (failed.length === 0) {
      ElMessage.success(`已成功核准 ${succeeded.length} 筆`)
    } else {
      ElMessage.warning(
        `核准完成：成功 ${succeeded.length} 筆，失敗 ${failed.length} 筆（${failed.map(f => `#${f.id}: ${f.reason}`).join('；')}）`
      )
    }
    fetchOvertimes()
    fetchPendingOvertimes()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error('批次核准失敗：' + (err.response?.data?.detail || err.message))
  } finally {
    batchLoading.value = false
  }
}

const openBatchReject = () => {
  batchRejectReason.value = ''
  batchRejectVisible.value = true
}

const confirmBatchReject = async () => {
  if (!batchRejectReason.value.trim()) {
    ElMessage.warning('請填寫駁回原因')
    return
  }
  batchLoading.value = true
  try {
    const ids = selectedOvertimes.value.map(r => r.id)
    const res = await batchApproveOvertimes(ids, false, batchRejectReason.value.trim())
    const { succeeded, failed } = res.data
    batchRejectVisible.value = false
    if (failed.length === 0) {
      ElMessage.success(`已成功駁回 ${succeeded.length} 筆`)
    } else {
      ElMessage.warning(`駁回完成：成功 ${succeeded.length} 筆，失敗 ${failed.length} 筆`)
    }
    fetchOvertimes()
    fetchPendingOvertimes()
  } catch (err) {
    ElMessage.error('批次駁回失敗：' + (err.response?.data?.detail || err.message))
  } finally {
    batchLoading.value = false
  }
}

// ── Excel 匯入 ──
const importVisible = ref(false)
const importLoading = ref(false)
const importResult = ref(null)

const downloadImportTemplate = async () => {
  try {
    const res = await getOvertimeImportTemplate()
    const blob = new Blob([res.data])
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = '加班匯入範本.xlsx'
    link.click()
    URL.revokeObjectURL(link.href)
  } catch {
    ElMessage.error('下載範本失敗')
  }
}

const handleImportFile = async (file) => {
  importLoading.value = true
  importResult.value = null
  try {
    const formData = new FormData()
    formData.append('file', file.raw)
    const res = await importOvertimes(formData)
    importResult.value = res.data
    if (res.data.failed === 0) {
      ElMessage.success(`匯入完成，成功建立 ${res.data.created} 筆草稿加班單`)
      fetchOvertimes()
      fetchPendingOvertimes()
    }
  } catch (err) {
    ElMessage.error('匯入失敗：' + (err.response?.data?.detail || err.message))
  } finally {
    importLoading.value = false
  }
  return false
}

// ── 簽核記錄 Drawer ─────────────────────────────────────────────────────────
const approvalLogDrawerVisible = ref(false)
const approvalLogs = ref([])
const approvalLogLoading = ref(false)

const openApprovalLogs = async (row) => {
  approvalLogDrawerVisible.value = true
  approvalLogLoading.value = true
  approvalLogs.value = []
  try {
    const res = await getApprovalLogs('overtime', row.id)
    approvalLogs.value = res.data
  } catch {
    ElMessage.error('載入簽核記錄失敗')
  } finally {
    approvalLogLoading.value = false
  }
}

const ACTION_LABELS = { approved: '核准', rejected: '駁回', cancelled: '取消' }
const ACTION_TAG_TYPES = { approved: 'success', rejected: 'danger', cancelled: 'warning' }

// ── 審核資格判斷 ─────────────────────────────────────────────────────────────
const approvalPolicies = ref([])
const currentUserInfo = getUserInfo()

const fetchApprovalPoliciesForView = async () => {
  try {
    const res = await getApprovalPolicies()
    approvalPolicies.value = res.data
  } catch {
    // 靜默
  }
}

const canApprove = (row) => {
  const myRole = currentUserInfo?.role
  if (!myRole || myRole === 'teacher') return false
  const submitterRole = row.submitter_role || 'teacher'
  const policy = approvalPolicies.value.find(p => p.submitter_role === submitterRole)
  if (!policy) return myRole === 'admin'
  return policy.approver_roles.split(',').map(r => r.trim()).includes(myRole)
}

onMounted(() => {
  activeSection.value = resolveSectionFromRoute()
  Promise.all([
    employeeStore.fetchEmployees(),
    fetchOvertimes(),
    fetchPendingOvertimes(),
    fetchApprovalPoliciesForView(),
  ])
})

watch(
  () => route.query.tab,
  () => {
    activeSection.value = resolveSectionFromRoute()
  },
)

watch(activeSection, async (value) => {
  const nextTab = value === 'meetings' ? 'meetings' : undefined
  const currentTab = typeof route.query.tab === 'string' ? route.query.tab : undefined
  if (nextTab === currentTab || (!nextTab && !currentTab)) return

  const nextQuery = { ...route.query }
  if (nextTab) nextQuery.tab = nextTab
  else delete nextQuery.tab
  await router.replace({ query: nextQuery })
})
</script>

<template>
  <div class="overtime-page">
    <h2>加班 / 園務會議</h2>

    <el-tabs v-model="activeSection" class="overtime-section-tabs">
      <el-tab-pane v-if="canViewOvertime" label="一般加班" name="overtime">
        <el-card class="control-panel">
          <div class="controls">
            <el-select v-model="query.employee_id" placeholder="全部員工" clearable filterable style="width: 180px;">
              <el-option v-for="emp in employeeStore.employees" :key="emp.id" :label="emp.name" :value="emp.id" />
            </el-select>
            <el-select v-model="query.year" style="width: 110px;">
              <el-option v-for="y in 5" :key="y" :label="(currentYear - 2 + y) + ' 年'" :value="currentYear - 2 + y" />
            </el-select>
            <el-select v-model="query.month" style="width: 90px;">
              <el-option v-for="m in 12" :key="m" :label="m + ' 月'" :value="m" />
            </el-select>
            <el-button type="primary" @click="fetchOvertimes" :loading="loading">查詢</el-button>
            <el-button type="warning" @click="downloadFile(`/exports/overtimes?year=${query.year}&month=${query.month}`, `${query.year}年${query.month}月加班記錄.xlsx`)">匯出 Excel</el-button>
            <el-button @click="downloadImportTemplate">下載範本</el-button>
            <el-button @click="importVisible = true">匯入 Excel</el-button>
            <el-button
              v-if="selectedOvertimes.length > 0"
              type="success"
              :loading="batchLoading"
              @click="showBatchApproveConfirm"
            >批次核准 ({{ selectedOvertimes.length }})</el-button>
            <el-button
              v-if="selectedOvertimes.length > 0"
              type="danger"
              :loading="batchLoading"
              @click="openBatchReject"
            >批次駁回 ({{ selectedOvertimes.length }})</el-button>
            <el-button type="success" @click="openCreate">
              <el-icon><Plus /></el-icon> 新增加班
            </el-button>
          </div>
        </el-card>

        <el-card v-if="pendingRecords.length > 0" class="pending-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>待審核項目 ({{ pendingRecords.length }})</span>
              <el-tag type="warning" effect="dark" size="small">需處理</el-tag>
            </div>
          </template>
          <el-table :data="pendingRecords" style="width: 100%" size="small">
            <el-table-column prop="employee_name" label="員工" width="100" />
            <el-table-column prop="overtime_date" label="日期" width="110" />
            <el-table-column label="類型" width="90">
              <template #default="{ row }">{{ row.overtime_type_label }}</template>
            </el-table-column>
            <el-table-column prop="hours" label="時數" width="70">
              <template #default="{ row }">{{ row.hours }}h</template>
            </el-table-column>
            <el-table-column label="方式" width="80">
              <template #default="{ row }">
                <el-tag v-if="row.use_comp_leave" type="success" size="small">補休</el-tag>
                <el-tag v-else size="small">加班費</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="reason" label="原因" show-overflow-tooltip />
            <el-table-column label="操作" width="140" align="right">
              <template #default="{ row }">
                <el-button type="success" size="small" circle @click="approveOvertime(row, true)">
                  <el-icon><Check /></el-icon>
                </el-button>
                <el-button type="danger" size="small" circle @click="approveOvertime(row, false)">
                  <el-icon><Close /></el-icon>
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <TableSkeleton v-if="loading && !overtimeRecords.length" :columns="8" />
        <el-table v-else :data="overtimeRecords" border stripe style="width: 100%; margin-top: 20px;" v-loading="loading" max-height="600" @selection-change="handleSelectionChange">
          <el-table-column type="selection" width="45" />
          <el-table-column prop="employee_name" label="員工" width="100" />
          <el-table-column prop="overtime_date" label="日期" width="120" />
          <el-table-column label="類型" width="100">
            <template #default="scope">
              <el-tag :type="scope.row.overtime_type === 'weekday' ? 'info' : 'warning'" size="small">
                {{ scope.row.overtime_type_label }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="時間" width="130">
            <template #default="scope">
              {{ scope.row.start_time || '-' }} ~ {{ scope.row.end_time || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="時數" width="80">
            <template #default="scope">{{ scope.row.hours }}h</template>
          </el-table-column>
          <el-table-column label="方式" width="90">
            <template #default="scope">
              <el-tag v-if="scope.row.use_comp_leave" type="success" size="small">補休 {{ scope.row.hours }}h</el-tag>
              <el-tag v-else size="small">加班費</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="加班費" width="110">
            <template #default="scope">
              <span v-if="scope.row.use_comp_leave" style="color: var(--el-text-color-secondary);">--</span>
              <strong v-else>{{ money(scope.row.overtime_pay) }}</strong>
            </template>
          </el-table-column>
          <el-table-column prop="reason" label="原因" min-width="120" show-overflow-tooltip />
          <el-table-column label="審核" width="100">
            <template #default="scope">
              <el-tag v-if="scope.row.is_approved === true" type="success" size="small">已核准</el-tag>
              <el-tag v-else-if="scope.row.is_approved === false" type="danger" size="small">已駁回</el-tag>
              <el-tag v-else type="warning" size="small">待審核</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="240" fixed="right">
            <template #default="scope">
              <el-button v-if="scope.row.is_approved !== true && canApprove(scope.row)" type="success" size="small" link @click="approveOvertime(scope.row, true)">核准</el-button>
              <el-button v-if="scope.row.is_approved !== false && canApprove(scope.row)" type="warning" size="small" link @click="approveOvertime(scope.row, false)">駁回</el-button>
              <el-button type="primary" size="small" link @click="openEdit(scope.row)">編輯</el-button>
              <el-button type="danger" size="small" link @click="deleteOvertime(scope.row)">刪除</el-button>
              <el-button type="info" size="small" link @click="openApprovalLogs(scope.row)">記錄</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-card v-if="overtimeRecords.length > 0" class="summary-card">
          <div class="summary">
            <span>本月加班合計: <strong>{{ overtimeSummary.totalHours }} 小時</strong></span>
            <span>加班費合計: <strong>{{ money(overtimeSummary.totalPay) }}</strong></span>
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane v-if="canViewMeetings" label="園務會議" name="meetings">
        <MeetingManagementPanel embedded />
      </el-tab-pane>
    </el-tabs>

    <!-- 批次駁回 Dialog -->
    <el-dialog v-model="batchRejectVisible" title="批次駁回加班" width="420px">
      <el-form label-width="80px">
        <el-form-item label="駁回原因">
          <el-input
            v-model="batchRejectReason"
            type="textarea"
            :rows="3"
            placeholder="選填：駁回原因（將套用至所有選取加班單）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchRejectVisible = false">取消</el-button>
        <el-button type="danger" :loading="batchLoading" @click="confirmBatchReject">確認駁回</el-button>
      </template>
    </el-dialog>

    <!-- 匯入 Excel Dialog -->
    <el-dialog v-model="importVisible" title="批次匯入加班" width="500px">
      <div style="margin-bottom: 12px;">
        <el-alert type="info" :closable="false" show-icon>
          <template #title>上傳 Excel 檔案（.xlsx），系統將批次建立草稿加班單，需後續人工審核。</template>
        </el-alert>
      </div>
      <el-upload
        drag
        :auto-upload="false"
        :on-change="handleImportFile"
        accept=".xlsx"
        :limit="1"
        :show-file-list="false"
      >
        <el-icon class="el-icon--upload" style="font-size: 48px; color: var(--el-color-primary);"><UploadFilled /></el-icon>
        <div class="el-upload__text">拖曳 Excel 至此，或 <em>點擊選取</em></div>
        <template #tip><div class="el-upload__tip">僅支援 .xlsx 格式</div></template>
      </el-upload>
      <div v-if="importLoading" style="text-align:center; margin-top: 16px;">
        <el-icon class="is-loading" style="font-size: 24px;"><Loading /></el-icon> 匯入中…
      </div>
      <el-card v-if="importResult" style="margin-top: 16px;" shadow="never">
        <div style="display: flex; gap: 16px; align-items: center;">
          <span>共 <strong>{{ importResult.total }}</strong> 筆</span>
          <el-tag type="success">成功 {{ importResult.created }}</el-tag>
          <el-tag v-if="importResult.failed > 0" type="danger">失敗 {{ importResult.failed }}</el-tag>
        </div>
        <div v-if="importResult.errors?.length" style="margin-top: 8px; max-height: 150px; overflow-y: auto;">
          <p v-for="e in importResult.errors" :key="e" style="font-size:12px; color:var(--el-color-danger); margin: 2px 0;">{{ e }}</p>
        </div>
      </el-card>
      <template #footer>
        <el-button @click="importVisible = false">關閉</el-button>
      </template>
    </el-dialog>

    <!-- Create/Edit Dialog -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '編輯加班' : '新增加班'" width="550px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="員工" required>
          <el-select v-model="form.employee_id" filterable placeholder="選擇員工" :disabled="isEdit" style="width: 100%;">
            <el-option v-for="emp in employeeStore.employees" :key="emp.id" :label="emp.name" :value="emp.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="加班日期" required>
          <el-date-picker v-model="form.overtime_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="加班類型" required>
          <el-select v-model="form.overtime_type" style="width: 100%;">
            <el-option v-for="ot in overtimeTypes" :key="ot.value" :label="`${ot.label}（${ot.desc}）`" :value="ot.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="開始時間">
          <el-time-picker v-model="form.start_time" format="HH:mm" value-format="HH:mm" placeholder="選擇時間" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="結束時間">
          <el-time-picker v-model="form.end_time" format="HH:mm" value-format="HH:mm" placeholder="選擇時間" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="加班時數" required>
          <el-input-number v-model="form.hours" :min="0.5" :step="0.5" :max="12" />
        </el-form-item>
        <el-form-item label="補休方式">
          <el-switch
            v-model="form.use_comp_leave"
            active-text="補休（加班費為 0）"
            inactive-text="計薪"
            active-color="#67c23a"
          />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="form.reason" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeDialog">取消</el-button>
        <el-button type="primary" :loading="saveOvertimeLoading" @click="saveOvertime">儲存</el-button>
      </template>
    </el-dialog>

    <!-- 簽核記錄 Drawer -->
    <el-drawer v-model="approvalLogDrawerVisible" title="簽核記錄" direction="rtl" size="420px">
      <div v-loading="approvalLogLoading">
        <el-empty v-if="!approvalLogLoading && approvalLogs.length === 0" description="尚無簽核記錄" />
        <el-timeline v-else>
          <el-timeline-item
            v-for="log in approvalLogs"
            :key="log.id"
            :timestamp="log.created_at ? new Date(log.created_at).toLocaleString('zh-TW') : ''"
            placement="top"
          >
            <el-card shadow="never" style="padding: 8px 12px;">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <el-tag :type="ACTION_TAG_TYPES[log.action] || 'info'" size="small">
                  {{ ACTION_LABELS[log.action] || log.action }}
                </el-tag>
                <span style="font-weight: 500;">{{ log.approver_username }}</span>
                <el-tag size="small" type="info">{{ log.approver_role }}</el-tag>
              </div>
              <div v-if="log.comment" style="margin-top: 6px; color: #606266; font-size: 13px;">
                {{ log.comment }}
              </div>
            </el-card>
          </el-timeline-item>
        </el-timeline>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.control-panel {
  margin-bottom: var(--space-5);
}
.controls {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}
.summary-card {
  margin-top: var(--space-4);
}

.overtime-section-tabs {
  margin-top: var(--space-4);
}
.summary {
  display: flex;
  gap: 40px;
  font-size: var(--text-lg);
}
.pending-card {
  margin-bottom: var(--space-5);
  border-left: 5px solid var(--color-warning) !important;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
