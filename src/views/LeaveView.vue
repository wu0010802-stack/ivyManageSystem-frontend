<script setup lang="ts">
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { getLeaves, createLeave, updateLeave, approveLeave as approveLeaveApi, batchApproveLeaves, getLeaveImportTemplate, importLeaves } from '@/api/leaves'
import { useApprovalPolicyStore } from '@/stores/approvalPolicy'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { List, Plus, Paperclip, InfoFilled, Calendar, Loading } from '@element-plus/icons-vue'
import { useEmployeeStore } from '@/stores/employee'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import LoadingPanel from '@/components/common/LoadingPanel.vue'
import AdminListToolbar from '@/components/common/AdminListToolbar.vue'
import { useCrudDialog, useConfirmDelete, useDateQuery, useLeaveHoursCalculator, useApprovalOperation, useClientTableFilter } from '@/composables'
import { useApprovalModule } from '@/composables/useApprovalModule'
import { downloadFile } from '@/utils/download'
import { LEAVE_TYPES as leaveTypes, LEAVE_RULE_HINTS, validateLeaveRules } from '@/utils/leaves'
import LeaveAttachmentDialog from './leave/LeaveAttachmentDialog.vue'
import ApprovalLogDrawer from '@/components/common/ApprovalLogDrawer.vue'
import LeaveBatchRejectDialog from './leave/LeaveBatchRejectDialog.vue'
import LeaveImportDialog from './leave/LeaveImportDialog.vue'
import LeaveQuotaManager from './leave/LeaveQuotaManager.vue'
import LeaveRejectDialog from './leave/LeaveRejectDialog.vue'
import LeaveCalendar from './leave/LeaveCalendar.vue'
import LeaveQuotaExpiryTab from '@/components/leave/LeaveQuotaExpiryTab.vue'
import { hasPermission, getUserInfo } from '@/utils/auth'
import { useFormDraft } from '@/composables/useFormDraft'

const { currentYear, query } = useDateQuery()
const employeeStore = useEmployeeStore()

const loading = ref(false)
const leaveRecords = ref<Record<string, unknown>[]>([])
const formRef = ref<{ validate: () => Promise<boolean>; clearValidate?: () => void } | null>(null)

// 子元件 ref
const attachRef = ref<{ open: (row: { id: number; attachment_paths: string[] }) => void } | null>(null)
const rejectRef = ref<{ open: (row: Record<string, unknown>) => void } | null>(null)

// 行事曆 / 配額 Dialog 的顯示控制
const activeTab = ref('list')
const quotaDialogVisible = ref(false)

const ATTACHMENT_HINTS = {
  default: '請假超過 2 天時，核准前需補上證明附件',
}

const form = reactive<{
  id: number | null
  employee_id: number | string | null
  leave_type: string
  start_date: string
  end_date: string
  leave_hours: number
  reason: string
  is_hospitalized: boolean
}>({
  id: null,
  employee_id: null,
  leave_type: 'personal',
  start_date: '',
  end_date: '',
  leave_hours: 8,
  reason: '',
  is_hospitalized: false,
})

const selectedLeaveRule = computed(() => (LEAVE_RULE_HINTS as Record<string, string>)[form.leave_type] || '')

import type { FormItemRule } from 'element-plus'
const formRules: Partial<Record<string, FormItemRule | FormItemRule[]>> = {
  employee_id: [{ required: true, message: '請選擇員工', trigger: 'change' }],
  leave_type: [{ required: true, message: '請選擇假別', trigger: 'change' }],
  start_date: [{ required: true, message: '請選擇開始時間', trigger: 'change' }],
  end_date: [{ required: true, message: '請選擇結束時間', trigger: 'change' }],
  leave_hours: [
    { required: true, type: 'number', message: '請填寫請假時數', trigger: 'change' },
    {
      type: 'number',
      validator: (_rule: unknown, value: number, callback: (err?: Error) => void) => {
        if (value < 0.5) callback(new Error('請假時數至少 0.5 小時'))
        else if (Math.round(value * 2) !== value * 2) callback(new Error('請假時數必須為 0.5 小時的倍數'))
        else callback()
      },
      trigger: 'change',
    },
  ],
}

const {
  QUOTA_TYPES,
  calcHint,
  calcBreakdown,
  calcLoading,
  leaveMode,
  leaveSingleDate,
  quotaInfo,
  quotaLoading,
  quotaExceeded,
  effectiveRemaining,
  canSave,
  calcTooltipHtml,
  officeHoursWarning,
  resetCalculatorState,
  getExpectedMaxHours,
  populateFormFromRecord,
} = useLeaveHoursCalculator({ form: form as Record<string, unknown>, formRef: formRef as { value?: { clearValidate?: () => void } } | null })

// 結束日期不得早於開始日期
const disabledEndDate = (time: Date) => {
  if (!form.start_date) return false
  const s = new Date(form.start_date)
  s.setHours(0, 0, 0, 0)
  return time.getTime() < s.getTime()
}

const resetForm = () => {
  form.id = null
  form.employee_id = null
  form.leave_type = 'personal'
  form.start_date = ''
  form.end_date = ''
  form.leave_hours = 8
  form.reason = ''
  form.is_hospitalized = false
  resetCalculatorState()
}

const { dialogVisible, isEdit, openCreate, openEdit, closeDialog } = useCrudDialog({
  resetForm,
  populateForm: populateFormFromRecord,
})

// 表單草稿暫存：排除醫療旗標；保留 reason（核心欄位）
const LEAVE_DRAFT_EXCLUDE = ['id', 'is_hospitalized']
const leaveDraft = useFormDraft({
  formId: 'leave',
  state: form,
  recordId: () => form.id,
  userScope: () => (getUserInfo()?.employee_id as string | number | null) || 'anon',
  exclude: LEAVE_DRAFT_EXCLUDE,
  enabled: () => dialogVisible.value,
})

const openCreateWithDraft = async () => {
  openCreate()
  await nextTick()
  await leaveDraft.maybePromptRestore()
}
const openEditWithDraft = async (row: Record<string, unknown>) => {
  openEdit(row)
  await nextTick()
  await leaveDraft.maybePromptRestore()
}

const statusFilter = ref('')

// 客端關鍵字過濾：單月資料已全載，姓名/原因即打即濾，與上方年月/員工/狀態下拉（伺服器端）交集
const {
  searchQuery: leaveSearch,
  filtered: filteredLeaves,
  total: leaveTotal,
  shown: leaveShown,
} = useClientTableFilter<Record<string, unknown>>({
  source: () => leaveRecords.value,
  searchFields: (r) => [r.employee_name as string | undefined, r.reason as string | undefined],
})

const saveLoading = ref(false)

const {
  selectedItems: selectedLeaves,
  batchLoading,
  batchRejectVisible,
  batchRejectReason,
  handleSelectionChange,
  showBatchApproveConfirm,
  openBatchReject,
  confirmBatchReject,
  approvalLogDrawerVisible,
  approvalLogs,
  approvalLogLoading,
  openApprovalLogs,
  canApprove,
} = useApprovalModule({
  docType: 'leave',
  batchApproveFn: batchApproveLeaves as (ids: unknown[], approved: boolean, reason?: string) => Promise<{ data: { succeeded: { length: number }[]; failed: { id: unknown; reason: string }[] } }>,
  fetchFn: () => fetchLeaves(),
  recordLabel: '請假記錄',
})

// ── Excel 匯入 ──
const importVisible = ref(false)
const importLoading = ref(false)
interface LeaveImportResult {
  total: number
  created: number
  failed: number
  errors?: string[]
}
const importResult = ref<LeaveImportResult | null>(null)

const downloadImportTemplate = async () => {
  try {
    const res = await getLeaveImportTemplate()
    const blob = new Blob([res.data])
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = '請假匯入範本.xlsx'
    link.click()
    URL.revokeObjectURL(link.href)
  } catch (e) {
    ElMessage.error(friendlyError('下載請假匯入範本失敗', e))
  }
}

const handleImportFile = async (file: { raw?: File }) => {
  if (!file.raw) return false
  importLoading.value = true
  importResult.value = null
  try {
    const formData = new FormData()
    formData.append('file', file.raw)
    const res = await importLeaves(formData)
    importResult.value = res.data
    if (res.data.failed === 0) {
      ElMessage.success(`匯入完成，成功建立 ${res.data.created} 筆草稿假單`)
      fetchLeaves()
    }
  } catch (err) {
    ElMessage.error(friendlyError('匯入請假資料失敗', err))
  } finally {
    importLoading.value = false
  }
  return false
}

const fetchLeaves = async () => {
  loading.value = true
  try {
    const params: Record<string, unknown> = { year: query.year, month: query.month }
    if (query.employee_id) params.employee_id = query.employee_id
    if (statusFilter.value) params.status = statusFilter.value
    const response = await getLeaves(params)
    leaveRecords.value = response.data
  } catch (error) {
    ElMessage.error(friendlyError('載入請假記錄失敗', error))
  } finally {
    loading.value = false
  }
}

const saveLeave = async () => {
  // el-form 規則驗證
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  // 時間順序防呆
  const s = new Date(form.start_date)
  const e = new Date(form.end_date)
  if (leaveMode.value === 'full' ? e < s : e <= s) {
    ElMessage.warning(leaveMode.value === 'full' ? '結束日期不得早於開始日期' : '結束時間必須晚於開始時間')
    return
  }

  // 業務規則檢查：病假 4h 倍數、事假提前 2 日。管理端容許覆寫，需顯式 confirm
  const ruleViolations = validateLeaveRules({
    leave_type: form.leave_type,
    leave_hours: form.leave_hours,
    start_date: form.start_date,
  })
  if (ruleViolations.length > 0) {
    const confirmed = await ElMessageBox.confirm(
      `${ruleViolations.join('；')}。確認要繼續儲存嗎？`,
      '違反請假規則',
      { type: 'warning', confirmButtonText: '仍要儲存', cancelButtonText: '取消' },
    ).catch(() => false)
    if (!confirmed) return
  }

  // 時數合理性警告：優先用 API 算出的工時，否則降級為本地計算
  const maxHours = getExpectedMaxHours()
  if (form.leave_hours > maxHours + 0.5) {
    const confirmed = await ElMessageBox.confirm(
      `請假時數（${form.leave_hours}h）超過預期工作日時數（${maxHours}h），確認要儲存嗎？`,
      '時數異常確認',
      { type: 'warning', confirmButtonText: '確認儲存', cancelButtonText: '取消' }
    ).catch(() => false)
    if (!confirmed) return
  }

  // 配額超額警告（有配額資料才檢查）。
  // 用 effectiveRemaining（remaining + editBaseline）而非原始 remaining_hours，
  // 才能與畫面上的 quotaExceeded 警示一致；編輯既有假單時本筆時數已計入 used_hours。
  if (effectiveRemaining.value !== null && form.leave_hours > effectiveRemaining.value) {
    const over = (form.leave_hours - effectiveRemaining.value).toFixed(1)
    const confirmed = await ElMessageBox.confirm(
      `此次請假（${form.leave_hours}h）將超出剩餘配額（${effectiveRemaining.value}h），超出 ${over}h，確認要儲存嗎？`,
      '配額不足警告',
      { type: 'warning', confirmButtonText: '確認儲存', cancelButtonText: '取消' }
    ).catch(() => false)
    if (!confirmed) return
  }

  saveLoading.value = true
  try {
    const sd = form.start_date ? form.start_date.substring(0, 10) : ''
    const st = form.start_date && form.start_date.length > 10 ? form.start_date.substring(11, 16) : ''
    const ed = form.end_date ? form.end_date.substring(0, 10) : ''
    const et = form.end_date && form.end_date.length > 10 ? form.end_date.substring(11, 16) : ''

    // 後端 _apply_leave_update_and_revoke 對 start_time/end_time 是「None 清空、空字串 setattr」（2026-05-11 P1-7）
    // 半日→全日場景：時段欄空 → 送 null 才會清空、不會被存成 ''
    // 病假時帶 is_hospitalized 區分雙桶（未住院 240h / 住院 2080h）；其他假別後端忽略
    const isSick = form.leave_type === 'sick'
    if (isEdit.value) {
      await updateLeave(form.id!, {
        leave_type: form.leave_type,
        start_date: sd,
        start_time: st || null,
        end_date: ed,
        end_time: et || null,
        leave_hours: form.leave_hours,
        reason: form.reason,
        is_hospitalized: isSick ? form.is_hospitalized : false,
      })
      ElMessage.success('請假記錄已更新')
    } else {
      await createLeave({
        employee_id: form.employee_id,
        leave_type: form.leave_type,
        start_date: sd,
        start_time: st || null,
        end_date: ed,
        end_time: et || null,
        leave_hours: form.leave_hours,
        reason: form.reason,
        is_hospitalized: isSick ? form.is_hospitalized : false,
      })
      ElMessage.success('請假記錄已新增')
    }
    leaveDraft.clear()
    closeDialog()
    fetchLeaves()
  } catch (error) {
    ElMessage.error(friendlyError('儲存請假單失敗', error))
  } finally {
    saveLoading.value = false
  }
}

const { confirmDelete: deleteLeave } = useConfirmDelete({
  endpoint: '/leaves',
  onSuccess: fetchLeaves,
  successMsg: '已刪除',
})

const { execute: executeApproval } = useApprovalOperation({
  apiFn: approveLeaveApi as (id: unknown, payload: unknown) => Promise<unknown>,
  onSuccess: fetchLeaves,
})

const approveLeave = async (row: Record<string, unknown>) => {
  const payload: { approved: boolean; force_without_substitute?: boolean } = { approved: true }
  if (['pending', 'rejected'].includes(row.substitute_status as string)) {
    const warningText = row.substitute_status === 'pending'
      ? '代理人尚未接受此代理請求，仍要直接核准嗎？'
      : '代理人已拒絕此代理請求，仍要直接核准嗎？'
    try {
      await ElMessageBox.confirm(
        `${warningText} 系統會以「無代理人核准」方式通過此假單。`,
        '代理人未確認',
        { type: 'warning', confirmButtonText: '仍要核准', cancelButtonText: '取消' }
      )
      payload.force_without_substitute = true
    } catch {
      return
    }
  }
  await executeApproval(row.id, payload, '已核准')
}

const cancelApprove = (row: Record<string, unknown>) =>
  executeApproval(row.id, { approved: false, rejection_reason: '取消核准' }, '已取消核准')

// 行操作的「更多」dropdown：把次要/危險動作集中收斂，降低表格視覺密度
function handleRowCommand(cmd: string, row: Record<string, unknown>) {
  switch (cmd) {
    case 'reject':
      rejectRef.value?.open(row)
      break
    case 'cancel-approve':
      cancelApprove(row)
      break
    case 'edit':
      openEditWithDraft(row)
      break
    case 'logs':
      openApprovalLogs(row as { id: unknown })
      break
    case 'delete':
      deleteLeave(row)
      break
  }
}

const getLeaveTypeTag = (type: string) => {
  return leaveTypes.find(t => t.value === type) || { label: type, color: '' }
}

// Template helper: open attachment dialog with typed row
const openAttachment = (row: Record<string, unknown>) =>
  attachRef.value?.open(row as unknown as { id: number; attachment_paths: string[] })

// quotaInfo typed helper for template access
interface QuotaInfoTyped { remaining_hours: number; used_hours: number; pending_hours: number; total_hours: number }
const typedQuotaInfo = computed(() => quotaInfo.value as QuotaInfoTyped | null)

// approvalLogs cast for ApprovalLogDrawer (its ApprovalLog type is component-local)
const castApprovalLogsLeave = computed(() => approvalLogs.value as unknown as { id: number; action: string; created_at?: string; approver_username?: string; approver_role?: string }[])

// ── 審核流程（approvalPolicyStore 仍需 onMounted 中呼叫 fetchPolicies）──────
const approvalPolicyStore = useApprovalPolicyStore()

onMounted(() => {
  Promise.all([
    employeeStore.fetchEmployees(),
    fetchLeaves(),
    approvalPolicyStore.fetchPolicies(),
  ])
})
</script>

<template>
  <div class="leave-page">
    <h2>請假管理</h2>

    <el-tabs v-model="activeTab" class="leave-tabs">

      <!-- ─── 列表 Tab ─── -->
      <el-tab-pane name="list">
        <template #label><el-icon><List /></el-icon> 列表</template>

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
        <el-select v-model="statusFilter" placeholder="全部狀態" clearable style="width: 120px;">
          <el-option label="待審核" value="pending" />
          <el-option label="已核准" value="approved" />
          <el-option label="已駁回" value="rejected" />
        </el-select>
        <el-button type="primary" @click="fetchLeaves" :loading="loading">查詢</el-button>
        <el-button type="warning" @click="downloadFile(`/exports/leaves?year=${query.year}&month=${query.month}`, `${query.year}年${query.month}月請假記錄.xlsx`)">匯出 Excel</el-button>
        <el-button @click="quotaDialogVisible = true">配額管理</el-button>
        <el-button @click="downloadImportTemplate">下載範本</el-button>
        <el-button @click="importVisible = true">匯入 Excel</el-button>
        <el-button
          v-if="selectedLeaves.length > 0"
          type="success"
          :loading="batchLoading"
          @click="showBatchApproveConfirm"
        >批次核准 ({{ selectedLeaves.length }})</el-button>
        <el-button
          v-if="selectedLeaves.length > 0"
          type="danger"
          :loading="batchLoading"
          @click="openBatchReject"
        >批次駁回 ({{ selectedLeaves.length }})</el-button>
        <el-button type="success" @click="openCreateWithDraft">
          <el-icon><Plus /></el-icon> 新增請假
        </el-button>
      </div>
    </el-card>

    <AdminListToolbar
      v-model:search="leaveSearch"
      search-placeholder="搜尋員工姓名或請假原因"
      :total="leaveTotal"
      :shown="leaveShown"
    />

    <LoadingPanel
      :loading="loading && !leaveRecords.length"
      :empty="!loading && !leaveRecords.length"
      variant="skeleton"
      class="leave-table-panel"
    >
      <template #skeleton><TableSkeleton :columns="8" /></template>
      <template #empty><el-empty description="尚無請假紀錄" /></template>
      <el-table :data="filteredLeaves" border stripe style="width: 100%; margin-top: 20px;" v-loading="loading" max-height="600" @selection-change="handleSelectionChange">
      <template #empty>
        <el-empty :description="leaveSearch ? '沒有符合搜尋條件的請假紀錄' : '尚無請假紀錄'" />
      </template>
      <el-table-column type="selection" width="45" />
      <el-table-column prop="employee_name" label="員工" width="100" />
      <el-table-column label="假別" width="100">
        <template #default="scope">
          <el-tag :type="(getLeaveTypeTag(scope.row.leave_type as string).color as 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined)" size="small">
            {{ scope.row.leave_type_label }}
          </el-tag>
        </template>
      </el-table-column>
        <el-table-column label="開始時間" width="140">
          <template #default="scope">
            {{ scope.row.start_date }} {{ scope.row.start_time || '' }}
          </template>
        </el-table-column>
        <el-table-column label="結束時間" width="140">
          <template #default="scope">
            {{ scope.row.end_date }} {{ scope.row.end_time || '' }}
          </template>
        </el-table-column>
        <el-table-column label="時數" width="80">
          <template #default="scope">{{ scope.row.leave_hours }}h</template>
        </el-table-column>
        <el-table-column label="扣薪比例" width="90">
          <template #default="scope">
            {{ scope.row.deduction_ratio === 0 ? '不扣' : (scope.row.deduction_ratio === 1 ? '全扣' : '半薪') }}
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="原因" min-width="120" show-overflow-tooltip />
        <el-table-column label="附件" width="70" align="center">
          <template #default="scope">
            <el-button
              v-if="scope.row.attachment_paths && scope.row.attachment_paths.length > 0"
              link
              type="primary"
              size="small"
              @click="openAttachment(scope.row)"
            >
              <el-icon><Paperclip /></el-icon>
              {{ scope.row.attachment_paths.length }}
            </el-button>
            <span v-else class="text-secondary" style="font-size:12px">—</span>
          </template>
        </el-table-column>
        <el-table-column label="審核" width="120">
          <template #default="scope">
            <el-tag v-if="scope.row.status === 'approved'" type="success" size="small">已核准</el-tag>
            <template v-else-if="scope.row.status === 'rejected'">
              <el-tag type="danger" size="small">已駁回</el-tag>
              <el-tooltip v-if="scope.row.rejection_reason" :content="scope.row.rejection_reason" placement="top">
                <el-icon style="margin-left:4px;color:var(--el-color-danger);cursor:help;vertical-align:middle;"><InfoFilled /></el-icon>
              </el-tooltip>
            </template>
            <el-tag v-else type="info" size="small">待審核</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="代理人" width="140">
          <template #default="scope">
            <template v-if="scope.row.substitute_employee_name">
              <span style="font-size:12px;">{{ scope.row.substitute_employee_name }}</span>
              <el-tag
                size="small"
                :type="(({ not_required:'info', pending:'warning', accepted:'success', rejected:'danger', waived:'info' } as Record<string, string>)[scope.row.substitute_status as string] || 'info') as 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined"
                style="margin-left:4px;"
              >{{ ({ not_required:'—', pending:'待回應', accepted:'已接受', rejected:'已拒絕', waived:'主管略過' } as Record<string, string>)[scope.row.substitute_status as string] || scope.row.substitute_status }}</el-tag>
            </template>
            <span v-else style="color:var(--el-text-color-secondary);font-size:12px;">—</span>
          </template>
        </el-table-column>
        <el-table-column label="換班關聯" width="100" align="center">
          <template #default="scope">
            <el-tooltip
              v-if="scope.row.related_swap"
              placement="top"
              :content="`換班申請 #${scope.row.related_swap.id}（${scope.row.related_swap.swap_date}，狀態：${scope.row.related_swap.status}）`"
            >
              <el-tag type="warning" size="small" effect="plain">換班中</el-tag>
            </el-tooltip>
            <span v-else style="color:var(--el-text-color-secondary);font-size:12px;">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="scope">
            <!-- 主動作：依狀態決定，最常用的操作直接外露 -->
            <template v-if="scope.row.status === 'pending' && canApprove(scope.row)">
              <el-button type="success" size="small" link @click="approveLeave(scope.row)">核准</el-button>
            </template>
            <el-button
              v-else-if="scope.row.status === 'rejected' && canApprove(scope.row)"
              type="success"
              size="small"
              link
              @click="approveLeave(scope.row)"
            >核准</el-button>
            <el-button
              v-else
              type="primary"
              size="small"
              link
              @click="openEditWithDraft(scope.row)"
            >編輯</el-button>

            <!-- 次要/危險動作收進 dropdown，降低誤觸與視覺密度 -->
            <el-dropdown trigger="click" @command="(cmd) => handleRowCommand(cmd, scope.row)">
              <el-button type="info" size="small" link>更多 ▾</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-if="scope.row.status === 'pending' && canApprove(scope.row)"
                    command="reject"
                  >駁回</el-dropdown-item>
                  <el-dropdown-item
                    v-if="scope.row.status === 'approved' && canApprove(scope.row)"
                    command="cancel-approve"
                  >取消核准</el-dropdown-item>
                  <!-- 編輯：當主動作是「核准」（待審/已駁回 且可核准）時補上入口，
                       審核者常需在核准前先修錯字。其他情況主動作就是編輯，無需重複。 -->
                  <el-dropdown-item
                    v-if="scope.row.status !== 'approved' && canApprove(scope.row)"
                    command="edit"
                  >編輯</el-dropdown-item>
                  <el-dropdown-item command="logs">審核紀錄</el-dropdown-item>
                  <el-dropdown-item divided command="delete">刪除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>
    </LoadingPanel>

      </el-tab-pane>

      <!-- ─── 行事曆 Tab ─── -->
      <el-tab-pane name="calendar">
        <template #label><el-icon><Calendar /></el-icon> 行事曆</template>
        <LeaveCalendar :activeTab="activeTab" />
      </el-tab-pane>

      <!-- ─── 到期管理 Tab ─── -->
      <el-tab-pane
        v-if="hasPermission('LEAVES_READ') || hasPermission('SALARY_READ')"
        label="到期管理"
        name="expiry"
      >
        <LeaveQuotaExpiryTab v-if="activeTab === 'expiry'" />
      </el-tab-pane>

    </el-tabs>

    <!-- 子元件 -->
    <LeaveRejectDialog ref="rejectRef" @rejected="fetchLeaves()" />
    <LeaveQuotaManager v-model:visible="quotaDialogVisible" />
    <LeaveAttachmentDialog ref="attachRef" />

    <!-- Create/Edit Dialog -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '編輯請假' : '新增請假申請'" width="550px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <el-form-item label="員工" prop="employee_id">
          <el-select v-model="form.employee_id" filterable placeholder="選擇員工" :disabled="isEdit" style="width: 100%;">
            <el-option v-for="emp in employeeStore.employees" :key="emp.id" :label="emp.name" :value="emp.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="假別" prop="leave_type">
          <el-select v-model="form.leave_type" style="width: 100%;">
            <el-option v-for="lt in leaveTypes" :key="lt.value" :label="lt.label" :value="lt.value">
              <span>{{ lt.label }}</span>
              <el-tag
                size="small"
                :type="lt.deduction.includes('不扣') ? 'success' : lt.deduction.includes('半') ? 'warning' : 'danger'"
                style="margin-left: 8px; float: right;"
              >{{ lt.deduction }}</el-tag>
            </el-option>
          </el-select>
          <div style="margin-top: 5px; font-size: 12px; min-height: 20px;">
            <span v-if="quotaLoading" style="color: var(--el-color-info);">
              <el-icon class="is-loading" style="vertical-align: middle;"><Loading /></el-icon> 查詢配額…
            </span>
            <template v-else-if="typedQuotaInfo">
              <el-tag
                size="small"
                :type="typedQuotaInfo.remaining_hours <= 0 ? 'danger' : typedQuotaInfo.remaining_hours < 16 ? 'warning' : 'success'"
                style="margin-right: 6px;"
              >
                剩餘 {{ typedQuotaInfo.remaining_hours }}h
              </el-tag>
              <span style="color: var(--el-text-color-secondary);">
                已核准 {{ typedQuotaInfo.used_hours }}h
                <template v-if="typedQuotaInfo.pending_hours > 0">
                  ／待審 {{ typedQuotaInfo.pending_hours }}h
                </template>
                ／總計 {{ typedQuotaInfo.total_hours }}h
              </span>
            </template>
            <span v-else-if="form.employee_id && !QUOTA_TYPES.has(form.leave_type)" style="color: var(--el-text-color-placeholder);">
              此假別無年度上限
            </span>
          </div>
          <div v-if="selectedLeaveRule" style="margin-top: 5px; font-size: 12px; color: var(--el-color-primary); display: flex; align-items: center; gap: 4px;">
            <el-icon><InfoFilled /></el-icon>
            {{ selectedLeaveRule }}
          </div>
          <div style="margin-top: 5px; font-size: 12px; color: var(--el-color-warning); display: flex; align-items: center; gap: 4px;">
            <el-icon><InfoFilled /></el-icon>
            {{ ATTACHMENT_HINTS.default }}
          </div>
        </el-form-item>
        <el-form-item v-if="form.leave_type === 'sick'" label="住院病假">
          <el-switch v-model="form.is_hospitalized" active-text="住院（2080h 上限）" inactive-text="未住院（240h 上限）" />
          <div style="margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary);">
            依勞工請假規則第 4 條，未住院年度上限 30 日（240h），含住院最高 1 年（2080h）。
          </div>
        </el-form-item>
        <el-form-item label="請假模式">
          <el-radio-group v-model="leaveMode" size="small">
            <el-radio-button value="full">整天</el-radio-button>
            <el-radio-button value="morning">上午</el-radio-button>
            <el-radio-button value="afternoon">下午</el-radio-button>
            <el-radio-button value="custom">自訂時段</el-radio-button>
          </el-radio-group>
          <div style="margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary);">
            <template v-if="leaveMode === 'full'">整天或多日請假，只需選日期</template>
            <template v-else-if="leaveMode === 'morning'">僅限單日，自動帶入上班至12:00</template>
            <template v-else-if="leaveMode === 'afternoon'">僅限單日，自動帶入13:00至下班</template>
            <template v-else>自行填入起訖日期時間</template>
          </div>
        </el-form-item>

        <!-- 整天模式：只選日期 -->
        <template v-if="leaveMode === 'full'">
          <el-form-item label="開始日期" prop="start_date">
            <el-date-picker v-model="form.start_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" placeholder="選擇開始日期" />
          </el-form-item>
          <el-form-item label="結束日期" prop="end_date">
            <el-date-picker v-model="form.end_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" placeholder="選擇結束日期" :disabled-date="disabledEndDate" />
          </el-form-item>
        </template>

        <!-- 上午/下午模式：單日 -->
        <template v-else-if="leaveMode === 'morning' || leaveMode === 'afternoon'">
          <el-form-item label="請假日期" prop="start_date">
            <el-date-picker v-model="leaveSingleDate" type="date" value-format="YYYY-MM-DD" style="width: 100%;" placeholder="選擇請假日期" />
            <div v-if="form.start_date && form.end_date" style="margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary);">
              時段：{{ form.start_date.substring(11, 16) }} – {{ form.end_date.substring(11, 16) }}
              <el-icon v-if="calcLoading" class="is-loading" style="vertical-align: middle; margin-left: 6px;"><Loading /></el-icon>
            </div>
          </el-form-item>
        </template>

        <!-- 自訂時段模式 -->
        <template v-else>
          <el-form-item label="開始時間" prop="start_date">
            <el-date-picker v-model="form.start_date" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%;" placeholder="選擇開始日期時間" />
          </el-form-item>
          <el-form-item label="結束時間" prop="end_date">
            <el-date-picker v-model="form.end_date" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%;" placeholder="選擇結束日期時間" :disabled-date="disabledEndDate" />
          </el-form-item>
        </template>
        <el-form-item label="請假時數" prop="leave_hours">
          <div style="display: flex; align-items: center; gap: 8px;">
            <el-input-number v-model="form.leave_hours" :min="0.5" :step="0.5" :max="240" disabled />
            <el-tooltip v-if="calcTooltipHtml" placement="right" :content="calcTooltipHtml" raw-content>
              <el-icon style="cursor: help; color: var(--el-color-info); font-size: 16px;"><InfoFilled /></el-icon>
            </el-tooltip>
          </div>
          <div style="margin-top: 6px; font-size: 12px; line-height: 1.5;">
            <span v-if="calcLoading && leaveMode !== 'morning' && leaveMode !== 'afternoon'" style="color: var(--el-color-info);">
              <el-icon class="is-loading" style="vertical-align: middle;"><Loading /></el-icon> 查詢排班中…
            </span>
            <span v-else-if="calcHint" style="color: var(--el-color-info);">
              {{ calcHint }}
            </span>
          </div>
          <el-alert
            v-if="officeHoursWarning"
            type="warning"
            :title="officeHoursWarning"
            show-icon
            :closable="false"
            style="margin-top: 6px;"
          />
          <el-alert
            v-if="quotaExceeded"
            type="warning"
            :title="`剩餘配額不足：剩餘 ${typedQuotaInfo?.remaining_hours ?? 0}h，本次申請 ${form.leave_hours}h`"
            show-icon
            :closable="false"
            style="margin-top: 6px;"
          />
        </el-form-item>

        <!-- 每日排班明細（≤31 天才展開，以免過長） -->
        <el-form-item v-if="!calcLoading && calcBreakdown.length && calcBreakdown.length <= 31" label="每日明細">
          <div class="breakdown-table">
            <div
              v-for="day in calcBreakdown"
              :key="day.date"
              class="breakdown-row"
              :class="day.type"
            >
              <span class="bd-date">{{ day.date }}</span>
              <el-tag
                size="small"
                :type="day.type === 'workday' ? 'info' : day.type === 'holiday' ? 'danger' : 'info'"
                class="bd-tag"
              >
                {{ day.type === 'workday'
                  ? ((day as Record<string, unknown>).shift || '預設班') + (day.work_start ? ` ${day.work_start}–${day.work_end}` : '')
                  : day.type === 'holiday' ? (day as Record<string, unknown>).holiday_name
                  : '週末' }}
              </el-tag>
              <span class="bd-hours">
                {{ day.type === 'workday' ? `${day.hours}h` : '—' }}
              </span>
            </div>
          </div>
        </el-form-item>

        <el-form-item label="原因">
          <el-input v-model="form.reason" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeDialog">取消</el-button>
        <el-button type="primary" :disabled="!canSave || saveLoading" :loading="saveLoading" @click="saveLeave">儲存</el-button>
      </template>
    </el-dialog>

    <LeaveBatchRejectDialog
      v-model:visible="batchRejectVisible"
      v-model:reason="batchRejectReason"
      :loading="batchLoading"
      @confirm="confirmBatchReject"
    />

    <LeaveImportDialog
      v-model:visible="importVisible"
      :loading="importLoading"
      :result="importResult"
      :on-file-change="handleImportFile"
    />

    <ApprovalLogDrawer
      v-model:visible="approvalLogDrawerVisible"
      :loading="approvalLogLoading"
      :logs="castApprovalLogsLeave"
    />
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

/* 每日排班明細 */
.breakdown-table {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  padding: 6px;
  background: var(--el-fill-color-extra-light);
}

.breakdown-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 12px;
}

.breakdown-row.weekend,
.breakdown-row.holiday {
  opacity: 0.55;
}

.bd-date {
  min-width: 82px;
  color: var(--el-text-color-regular);
  font-variant-numeric: tabular-nums;
}

.bd-tag {
  flex: 1;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bd-hours {
  min-width: 32px;
  text-align: right;
  font-weight: 600;
  color: var(--el-color-primary);
}

.breakdown-row.weekend .bd-hours,
.breakdown-row.holiday .bd-hours {
  color: var(--el-text-color-secondary);
  font-weight: 400;
}

/* 讓 tab-pane 沒有多餘 top padding */
.leave-tabs :deep(.el-tabs__content) {
  padding-top: 4px;
}
</style>
