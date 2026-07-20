<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowRight, Check, Close, Document, Link, Loading, Paperclip, Stamp } from '@element-plus/icons-vue'
import { getLeaves, approveLeave as approveLeaveApi, getLeaveAttachment, batchApproveLeaves } from '@/api/leaves'
import { getOvertimes, approveOvertime as approveOvertimeApi, batchApproveOvertimes } from '@/api/overtimes'
import { getCorrections, approveCorrection as approveCorrectionApi, batchApproveCorrections } from '@/api/punchCorrections'
import { LEAVE_TYPE_MAP as leaveTypeMap } from '@/utils/leaves'
import { money, formatDate, formatTime } from '@/utils/format'
import { useFetchPending, useApprovalOperation } from '@/composables'
import { useApprovalModule } from '@/composables/useApprovalModule'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import LeaveBatchRejectDialog from '@/views/leave/LeaveBatchRejectDialog.vue'
import { ROLE_TAG_MAP, OVERTIME_TYPE_MAP, CORRECTION_TYPE_MAP, SUBSTITUTE_STATUS_MAP } from '@/constants/approvalEnums'
import { MODULE_TERMS } from '@/constants/moduleTerms'
import { getApprovalPolicies, type ApprovalPolicyRow } from '@/api/approvalSettings'
import { isSuperAdmin } from '@/utils/auth'

const router = useRouter()

const loading = ref(false)
// 首載完成後翻為 false；按「重新整理」雖然 loading 會再 true，isFirstLoad 不會回 true。
// 給模板區別「畫骨架」與「靜默重整」（重整時保持原有資料 + 表格，避免閃爍）。
const isFirstLoad = ref(true)

const { items: pendingLeaves,          fetch: fetchPendingLeaves    } = useFetchPending(getLeaves)
const { items: pendingOvertimes,       fetch: fetchPendingOvertimes } = useFetchPending(getOvertimes)
const { items: pendingPunchCorrections, fetch: fetchPendingCorrections } = useFetchPending(getCorrections)

type BatchFn = (ids: unknown[], approved: boolean, reason?: string) => Promise<{ data: { succeeded: { length: number }[]; failed: { id: unknown; reason: string }[] } }>

const {
  selectedItems: selectedLeaves, batchLoading: batchLoadingL,
  batchRejectVisible: batchRejectVisibleL, batchRejectReason: batchRejectReasonL,
  handleSelectionChange: handleSelectionChangeL, showBatchApproveConfirm: approveBatchL,
  openBatchReject: openBatchRejectL, confirmBatchReject: confirmBatchRejectL, canApprove: canApproveL,
} = useApprovalModule({ docType: 'leave', batchApproveFn: batchApproveLeaves as BatchFn, fetchFn: () => fetchPendingLeaves(), recordLabel: '請假記錄' })

const {
  selectedItems: selectedOvertimes, batchLoading: batchLoadingO,
  batchRejectVisible: batchRejectVisibleO, batchRejectReason: batchRejectReasonO,
  handleSelectionChange: handleSelectionChangeO, showBatchApproveConfirm: approveBatchO,
  openBatchReject: openBatchRejectO, confirmBatchReject: confirmBatchRejectO, canApprove: canApproveO,
} = useApprovalModule({ docType: 'overtime', batchApproveFn: batchApproveOvertimes as BatchFn, fetchFn: () => fetchPendingOvertimes(), recordLabel: '加班記錄' })

const {
  selectedItems: selectedCorrections, batchLoading: batchLoadingC,
  batchRejectVisible: batchRejectVisibleC, batchRejectReason: batchRejectReasonC,
  handleSelectionChange: handleSelectionChangeC, showBatchApproveConfirm: approveBatchC,
  openBatchReject: openBatchRejectC, confirmBatchReject: confirmBatchRejectC, canApprove: canApproveC,
} = useApprovalModule({ docType: 'punch_correction', batchApproveFn: batchApproveCorrections as BatchFn, fetchFn: () => fetchPendingCorrections(), recordLabel: '補打卡記錄' })

const roleTagMap        = ROLE_TAG_MAP
const overtimeTypeMap   = OVERTIME_TYPE_MAP
const correctionTypeMap = CORRECTION_TYPE_MAP
const substituteStatusMap = SUBSTITUTE_STATUS_MAP

const totalPending = computed(() =>
  pendingLeaves.value.length + pendingOvertimes.value.length + pendingPunchCorrections.value.length
)

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined
type StatusMap = Record<string, { label: string; type: string }>

const formatDateTime = (value: string | null | undefined) => (value ? formatDate(value) : '-')
const formatSubmitterRole = (role: string) => (roleTagMap as StatusMap)[role]?.label || role || '未設定'
const submitterRoleType = (role: string): ElTagType => ((roleTagMap as StatusMap)[role]?.type as ElTagType) || 'info'

const formatDeductionRatio = (ratio: number | null | undefined) => {
  if (ratio === null || ratio === undefined) return '-'
  if (Number(ratio) === 0) return '不扣薪'
  if (Number(ratio) === 1) return '全扣'
  if (Number(ratio) === 0.5) return '半薪'
  return `${Math.round(Number(ratio) * 100)}%`
}

const substituteStatusLabel = (status: string) => (substituteStatusMap as StatusMap)[status]?.label || status || '—'
const substituteStatusType = (status: string): ElTagType => ((substituteStatusMap as StatusMap)[status]?.type as ElTagType) || 'info'
const hasAttachments = (row: Record<string, unknown>) => Array.isArray(row.attachment_paths) && (row.attachment_paths as unknown[]).length > 0

const goToLeaveManagement = () => router.push({ name: 'leaves' })
const goToOvertimeManagement = () => router.push({ name: 'overtime' })
const goToAttendanceManagement = () => router.push({ name: 'attendance' })

const fetchAll = async () => {
  loading.value = true
  try {
    await Promise.all([fetchPendingLeaves(), fetchPendingOvertimes(), fetchPendingCorrections()])
  } finally {
    loading.value = false
    isFirstLoad.value = false
  }
}

type ApprovalFn = (id: unknown, payload: unknown) => Promise<unknown>
const { execute: executeLeaveApproval }      = useApprovalOperation({ apiFn: approveLeaveApi as ApprovalFn,      onSuccess: fetchPendingLeaves })
const { execute: executeOvertimeApproval }   = useApprovalOperation({ apiFn: approveOvertimeApi as ApprovalFn,   onSuccess: fetchPendingOvertimes })
const { execute: executeCorrectionApproval } = useApprovalOperation({ apiFn: approveCorrectionApi as ApprovalFn, onSuccess: fetchPendingCorrections })

const approveLeave = async (row: Record<string, unknown>, approved: boolean) => {
  const payload: { approved: boolean; rejection_reason?: string; force_without_substitute?: boolean } = { approved }
  if (!approved) {
    try {
      const result = await ElMessageBox.prompt('請填寫駁回原因', '駁回請假申請', {
        confirmButtonText: '確認駁回',
        cancelButtonText: '取消',
        inputType: 'textarea',
        inputPattern: /\S+/,
        inputErrorMessage: '請填寫駁回原因',
      })
      payload.rejection_reason = (result as { value: string }).value.trim()
    } catch {
      return
    }
  } else if (['pending', 'rejected'].includes(row.substitute_status as string)) {
    try {
      const warningText = row.substitute_status === 'pending'
        ? '代理人尚未接受此代理請求，仍要直接核准嗎？'
        : '代理人已拒絕此代理請求，仍要直接核准嗎？'
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
  await executeLeaveApproval(row.id, payload, approved ? '請假已核准' : '請假已駁回')
}

const approveOvertime = async (row: Record<string, unknown>, approved: boolean) => {
  const payload: { approved: boolean; rejection_reason?: string } = { approved }
  if (!approved) {
    try {
      const result = await ElMessageBox.prompt('請填寫駁回原因（至少 3 個字）', '駁回加班申請', {
        confirmButtonText: '確認駁回',
        cancelButtonText: '取消',
        inputType: 'textarea',
        inputPattern: /\S{3,}/,
        inputErrorMessage: '請填寫駁回原因（至少 3 個字）',
      })
      payload.rejection_reason = (result as { value: string }).value.trim()
    } catch {
      return
    }
  }
  await executeOvertimeApproval(row.id, payload, approved ? '加班已核准' : '加班已駁回')
}

const approveCorrection = async (row: Record<string, unknown>, approved: boolean) => {
  const payload: { approved: boolean; rejection_reason?: string } = { approved }
  if (!approved) {
    try {
      const result = await ElMessageBox.prompt('請填寫駁回原因', '駁回補打卡申請', {
        confirmButtonText: '確認駁回',
        cancelButtonText: '取消',
        inputPattern: /.+/,
        inputErrorMessage: '請填寫駁回原因',
      })
      payload.rejection_reason = (result as { value: string }).value
    } catch {
      return
    }
  }
  await executeCorrectionApproval(row.id, payload, approved ? '補打卡已核准，考勤已更新' : '補打卡已駁回')
}

interface AttachItem { name: string; url: string; isImage: boolean }

const attachDialogVisible = ref(false)
const attachItems = ref<AttachItem[]>([])
const attachLoading = ref(false)

const viewAttachments = async (row: Record<string, unknown>) => {
  attachItems.value = []
  attachDialogVisible.value = true
  attachLoading.value = true
  try {
    attachItems.value = await Promise.all(
      (row.attachment_paths as string[]).map((filename) =>
        getLeaveAttachment(row.id as number, filename)
          .then((res) => ({
            name: filename,
            url: URL.createObjectURL(res.data),
            isImage: /\.(jpg|jpeg|png|gif|heic|heif)$/i.test(filename),
          }))
      )
    )
  } catch {
    ElMessage.error('載入附件失敗')
  } finally {
    attachLoading.value = false
  }
}

const closeAttachDialog = () => {
  attachItems.value.forEach((item) => URL.revokeObjectURL(item.url))
  attachItems.value = []
  attachDialogVisible.value = false
}

const leaveTypeTagType = (leaveType: string): ElTagType => ((leaveTypeMap as StatusMap)[leaveType]?.type as ElTagType) || 'info'
const overtimeTypeTagType = (type: string): ElTagType => ((overtimeTypeMap as StatusMap)[type]?.type as ElTagType) || 'info'
const overtimeTypeLabel = (type: string) => (overtimeTypeMap as StatusMap)[type]?.label || type
const correctionTypeTagType = (type: string): ElTagType => ((correctionTypeMap as StatusMap)[type]?.type as ElTagType) || 'info'
const correctionTypeLabel = (type: string) => (correctionTypeMap as StatusMap)[type]?.label || type

// ── super_admin 核准整張（spec §6.2）──
// 按鈕可見性走前端 flags（isSuperAdmin），資格權威在後端（finalize_all 非 super_admin 即 403）
const showFinalize = isSuperAdmin()

const CIRCLED_DIGITS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']
const approvalPolicies = ref<ApprovalPolicyRow[]>([])

const fetchPolicies = async () => {
  try {
    const res = await getApprovalPolicies()
    approvalPolicies.value = res.data
  } catch {
    approvalPolicies.value = [] // 拿不到鏈資訊不阻擋終核，confirm 顯示降級文案
  }
}

// doc_type 專屬優先、fallback all（對齊後端政策查詢優先序，spec §4.1 M6）
const chainTextFor = (submitterRole: string, docType: string): string => {
  const find = (dt: string) =>
    approvalPolicies.value.find((p) => p.submitter_role === submitterRole && p.doc_type === dt && p.is_active)
  const policy = find(docType) ?? find('all')
  if (!policy) {
    return approvalPolicies.value.length === 0
      ? '（無法取得審核鏈資訊）'
      : '未設定審核鏈（fail-safe：僅超級管理員可核准）'
  }
  return policy.approver_roles
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r, i) => `${CIRCLED_DIGITS[i] || `${i + 1}.`}${formatSubmitterRole(r)}`)
    .join(' → ')
}

const confirmFinalize = async (row: Record<string, unknown>, docType: string): Promise<boolean> => {
  try {
    await ElMessageBox.confirm(
      `將以超級管理員身份跨過所有未完成關卡，直接核准整張單據（逐關補記留痕）。完整審核鏈：${chainTextFor(String(row.submitter_role ?? ''), docType)}`,
      '核准整張（終核）',
      { type: 'warning', confirmButtonText: '核准整張', cancelButtonText: '取消' },
    )
    return true
  } catch {
    return false
  }
}

const finalizeLeave = async (row: Record<string, unknown>) => {
  if (!(await confirmFinalize(row, 'leave'))) return
  await executeLeaveApproval(row.id, { approved: true, finalize_all: true }, '請假已核准（整張終核）')
}
const finalizeOvertime = async (row: Record<string, unknown>) => {
  if (!(await confirmFinalize(row, 'overtime'))) return
  await executeOvertimeApproval(row.id, { approved: true, finalize_all: true }, '加班已核准（整張終核）')
}
const finalizeCorrection = async (row: Record<string, unknown>) => {
  if (!(await confirmFinalize(row, 'punch_correction'))) return
  await executeCorrectionApproval(row.id, { approved: true, finalize_all: true }, '補打卡已核准（整張終核），考勤已更新')
}

defineExpose({ showFinalize, chainTextFor, finalizeLeave, finalizeOvertime, finalizeCorrection, fetchPolicies })

onMounted(() => {
  fetchAll()
  if (showFinalize) fetchPolicies()
})
</script>

<template>
  <!--
    Why no full-page v-loading：標題與快捷卡永遠該保留可見，避免重新整理時整頁
    閃白；首載用各 section 內的 skeleton 表達「資料載入中」，後續刷新只在 el-table
    上加 :loading 屬性局部遮罩。頂部進度條（App.vue）足以表示 navigation。
  -->
  <div class="approval-page">
    <div class="page-header">
      <div>
        <h2>審核工作台</h2>
        <p class="page-subtitle">集中查看待審請假、加班與補打卡，並可直接跳到對應管理頁處理。</p>
      </div>
      <div class="page-header__actions">
        <el-tag v-if="totalPending > 0" type="danger" effect="dark" size="large">
          {{ totalPending }} 項待審核
        </el-tag>
        <el-tag v-else type="success" effect="dark" size="large">
          全部已處理
        </el-tag>
        <el-button @click="fetchAll">重新整理</el-button>
      </div>
    </div>

    <div class="shortcut-grid">
      <el-card class="shortcut-card" shadow="hover">
        <div class="shortcut-card__meta">
          <span class="shortcut-card__title">請假管理</span>
          <el-tag :type="pendingLeaves.length > 0 ? 'warning' : 'success'" effect="plain">
            {{ pendingLeaves.length }} 筆待審
          </el-tag>
        </div>
        <p class="shortcut-card__desc">對照請假管理欄位顯示假別、扣薪比例、代理人、換班與附件。</p>
        <el-button link type="primary" @click="goToLeaveManagement">
          前往請假管理
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </el-card>

      <el-card class="shortcut-card" shadow="hover">
        <div class="shortcut-card__meta">
          <span class="shortcut-card__title">加班管理</span>
          <el-tag :type="pendingOvertimes.length > 0 ? 'warning' : 'success'" effect="plain">
            {{ pendingOvertimes.length }} 筆待審
          </el-tag>
        </div>
        <p class="shortcut-card__desc">補上加班類型、時段、補休設定與加班費，方便直接比對正式管理頁。</p>
        <el-button link type="primary" @click="goToOvertimeManagement">
          前往加班管理
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </el-card>

      <el-card class="shortcut-card" shadow="hover">
        <div class="shortcut-card__meta">
          <span class="shortcut-card__title">{{ MODULE_TERMS.attendance }}</span>
          <el-tag :type="pendingPunchCorrections.length > 0 ? 'warning' : 'success'" effect="plain">
            {{ pendingPunchCorrections.length }} 筆待審
          </el-tag>
        </div>
        <p class="shortcut-card__desc">補打卡欄位已帶出補正類型、申請時段與原因，可快速切去出勤管理追查。</p>
        <el-button link type="primary" @click="goToAttendanceManagement">
          前往{{ MODULE_TERMS.attendance }}
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </el-card>
    </div>

    <el-card class="section-card leave-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <div>
            <div class="card-header__title">待審請假</div>
            <div class="card-header__hint">顯示請假管理常用欄位：假別、區間、扣薪比例、代理與換班資訊</div>
          </div>
          <div class="card-header__actions">
            <el-badge :value="pendingLeaves.length" :type="pendingLeaves.length > 0 ? 'warning' : 'success'" />
            <el-button v-if="selectedLeaves.length > 0" type="success" size="small" :loading="batchLoadingL" @click="approveBatchL">批次核准 ({{ selectedLeaves.length }})</el-button>
            <el-button v-if="selectedLeaves.length > 0" type="danger" size="small" :loading="batchLoadingL" @click="openBatchRejectL">批次駁回 ({{ selectedLeaves.length }})</el-button>
            <el-button link type="primary" @click="goToLeaveManagement">
              請假管理
              <el-icon><ArrowRight /></el-icon>
            </el-button>
          </div>
        </div>
      </template>

      <TableSkeleton v-if="isFirstLoad && loading" :columns="9" :rows="3" />
      <el-table
        v-else-if="pendingLeaves.length > 0"
        v-loading="loading && !isFirstLoad"
        :data="pendingLeaves"
        stripe
        size="small"
        style="width: 100%"
        max-height="520"
        @selection-change="handleSelectionChangeL"
      >
        <el-table-column type="selection" width="45" :selectable="canApproveL" />
        <el-table-column label="員工" min-width="140">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="cell-strong">{{ row.employee_name }}</span>
              <el-tag size="small" effect="plain" :type="submitterRoleType(row.submitter_role)">
                {{ formatSubmitterRole(row.submitter_role) }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="假別" width="90">
          <template #default="{ row }">
            <el-tag :type="leaveTypeTagType(row.leave_type)" size="small">
              {{ (leaveTypeMap as StatusMap)[row.leave_type]?.label || row.leave_type }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="請假區間" min-width="220">
          <template #default="{ row }">
            <div class="cell-stack">
              <span>{{ row.start_date }} {{ row.start_time || '' }}</span>
              <span class="cell-muted">至 {{ row.end_date }} {{ row.end_time || '' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="時數 / 扣薪" width="120">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="cell-strong">{{ row.leave_hours }}h</span>
              <span class="cell-muted">{{ formatDeductionRatio(row.deduction_ratio) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="代理 / 換班" min-width="180">
          <template #default="{ row }">
            <div class="cell-stack">
              <template v-if="row.substitute_employee_name">
                <span>{{ row.substitute_employee_name }}</span>
                <el-tag size="small" :type="substituteStatusType(row.substitute_status)">
                  {{ substituteStatusLabel(row.substitute_status) }}
                </el-tag>
              </template>
              <span v-else class="cell-muted">未指定代理人</span>
              <span v-if="row.related_swap" class="swap-note">
                換班 #{{ row.related_swap.id }} / {{ row.related_swap.swap_date }}
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="原因" min-width="150" show-overflow-tooltip />
        <el-table-column label="附件" width="80" align="center">
          <template #default="{ row }">
            <el-button
              v-if="hasAttachments(row)"
              link
              type="primary"
              size="small"
              @click="viewAttachments(row)"
              title="查看附件"
            >
              <el-icon><Paperclip /></el-icon>
              {{ row.attachment_paths.length }}
            </el-button>
            <span v-else class="cell-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="申請時間" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="管理頁" width="100" align="center" fixed="right">
          <template #default>
            <el-button link type="primary" @click="goToLeaveManagement">
              <el-icon><Link /></el-icon>
              查看
            </el-button>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="center" fixed="right">
          <template #default="{ row }">
            <el-button aria-label="核准請假申請" type="success" size="small" circle @click="approveLeave(row, true)" title="核准">
              <el-icon><Check /></el-icon>
            </el-button>
            <el-button
              v-if="showFinalize"
              aria-label="核准整張請假申請"
              type="warning"
              size="small"
              circle
              title="核准整張（跨過所有未完成關卡）"
              @click="finalizeLeave(row)"
            ><el-icon><Stamp /></el-icon></el-button>
            <el-button aria-label="駁回請假申請" type="danger" size="small" circle @click="approveLeave(row, false)" title="駁回">
              <el-icon><Close /></el-icon>
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else-if="!isFirstLoad" description="沒有待審核的請假申請" :image-size="60" />
    </el-card>

    <el-card class="section-card overtime-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <div>
            <div class="card-header__title">待審加班</div>
            <div class="card-header__hint">顯示加班管理常用欄位：加班類型、時段、補休設定與加班費</div>
          </div>
          <div class="card-header__actions">
            <el-badge :value="pendingOvertimes.length" :type="pendingOvertimes.length > 0 ? 'warning' : 'success'" />
            <el-button v-if="selectedOvertimes.length > 0" type="success" size="small" :loading="batchLoadingO" @click="approveBatchO">批次核准 ({{ selectedOvertimes.length }})</el-button>
            <el-button v-if="selectedOvertimes.length > 0" type="danger" size="small" :loading="batchLoadingO" @click="openBatchRejectO">批次駁回 ({{ selectedOvertimes.length }})</el-button>
            <el-button link type="primary" @click="goToOvertimeManagement">
              加班管理
              <el-icon><ArrowRight /></el-icon>
            </el-button>
          </div>
        </div>
      </template>

      <TableSkeleton v-if="isFirstLoad && loading" :columns="9" :rows="3" />
      <el-table
        v-else-if="pendingOvertimes.length > 0"
        v-loading="loading && !isFirstLoad"
        :data="pendingOvertimes"
        stripe
        size="small"
        style="width: 100%"
        max-height="520"
        @selection-change="handleSelectionChangeO"
      >
        <el-table-column type="selection" width="45" :selectable="canApproveO" />
        <el-table-column label="員工" min-width="140">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="cell-strong">{{ row.employee_name }}</span>
              <el-tag size="small" effect="plain" :type="submitterRoleType(row.submitter_role)">
                {{ formatSubmitterRole(row.submitter_role) }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="overtime_date" label="日期" width="120" />
        <el-table-column label="類型 / 時段" min-width="180">
          <template #default="{ row }">
            <div class="cell-stack">
              <el-tag :type="overtimeTypeTagType(row.overtime_type)" size="small">
                {{ overtimeTypeLabel(row.overtime_type) }}
              </el-tag>
              <span class="cell-muted">{{ row.start_time || '-' }} ~ {{ row.end_time || '-' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="時數 / 補休" width="130">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="cell-strong">{{ row.hours }}h</span>
              <el-tag size="small" :type="row.use_comp_leave ? 'success' : 'info'" effect="plain">
                {{ row.use_comp_leave ? '換補休' : '領加班費' }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="加班費" width="110">
          <template #default="{ row }">
            <div class="cell-stack">
              <span class="cell-strong">{{ money(row.overtime_pay) }}</span>
              <span v-if="row.use_comp_leave" class="cell-muted">
                {{ row.comp_leave_granted ? '補休已入帳' : '待入帳' }}
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="原因" min-width="120" show-overflow-tooltip />
        <el-table-column label="申請時間" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="管理頁" width="100" align="center" fixed="right">
          <template #default>
            <el-button link type="primary" @click="goToOvertimeManagement">
              <el-icon><Link /></el-icon>
              查看
            </el-button>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="center" fixed="right">
          <template #default="{ row }">
            <el-button aria-label="核准加班申請" type="success" size="small" circle @click="approveOvertime(row, true)" title="核准">
              <el-icon><Check /></el-icon>
            </el-button>
            <el-button
              v-if="showFinalize"
              aria-label="核准整張加班申請"
              type="warning"
              size="small"
              circle
              title="核准整張（跨過所有未完成關卡）"
              @click="finalizeOvertime(row)"
            ><el-icon><Stamp /></el-icon></el-button>
            <el-button aria-label="駁回加班申請" type="danger" size="small" circle @click="approveOvertime(row, false)" title="駁回">
              <el-icon><Close /></el-icon>
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else-if="!isFirstLoad" description="沒有待審核的加班申請" :image-size="60" />
    </el-card>

    <el-card class="section-card correction-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <div>
            <div class="card-header__title">待審補打卡</div>
            <div class="card-header__hint">帶出補打卡類型、申請時間與說明，並可直接切到出勤管理追查</div>
          </div>
          <div class="card-header__actions">
            <el-badge :value="pendingPunchCorrections.length" :type="pendingPunchCorrections.length > 0 ? 'warning' : 'success'" />
            <el-button v-if="selectedCorrections.length > 0" type="success" size="small" :loading="batchLoadingC" @click="approveBatchC">批次核准 ({{ selectedCorrections.length }})</el-button>
            <el-button v-if="selectedCorrections.length > 0" type="danger" size="small" :loading="batchLoadingC" @click="openBatchRejectC">批次駁回 ({{ selectedCorrections.length }})</el-button>
            <el-button link type="primary" @click="goToAttendanceManagement">
              {{ MODULE_TERMS.attendance }}
              <el-icon><ArrowRight /></el-icon>
            </el-button>
          </div>
        </div>
      </template>

      <TableSkeleton v-if="isFirstLoad && loading" :columns="8" :rows="3" />
      <el-table
        v-else-if="pendingPunchCorrections.length > 0"
        v-loading="loading && !isFirstLoad"
        :data="pendingPunchCorrections"
        stripe
        size="small"
        style="width: 100%"
        max-height="520"
        @selection-change="handleSelectionChangeC"
      >
        <el-table-column type="selection" width="45" :selectable="canApproveC" />
        <el-table-column prop="employee_name" label="員工" min-width="120" />
        <el-table-column prop="attendance_date" label="考勤日期" width="120" />
        <el-table-column label="補正類型" width="110">
          <template #default="{ row }">
            <el-tag :type="correctionTypeTagType(row.correction_type)" size="small">
              {{ correctionTypeLabel(row.correction_type) || row.correction_type_label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="申請時段" min-width="150">
          <template #default="{ row }">
            <div class="cell-stack">
              <span>上班 {{ formatTime(row.requested_punch_in) }}</span>
              <span class="cell-muted">下班 {{ formatTime(row.requested_punch_out) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="說明原因" min-width="120" show-overflow-tooltip />
        <el-table-column label="申請時間" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="管理頁" width="100" align="center" fixed="right">
          <template #default>
            <el-button link type="primary" @click="goToAttendanceManagement">
              <el-icon><Link /></el-icon>
              查看
            </el-button>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="center" fixed="right">
          <template #default="{ row }">
            <el-button aria-label="核准補打卡申請" type="success" size="small" circle @click="approveCorrection(row, true)" title="核准">
              <el-icon><Check /></el-icon>
            </el-button>
            <el-button
              v-if="showFinalize"
              aria-label="核准整張補打卡申請"
              type="warning"
              size="small"
              circle
              title="核准整張（跨過所有未完成關卡）"
              @click="finalizeCorrection(row)"
            ><el-icon><Stamp /></el-icon></el-button>
            <el-button aria-label="駁回補打卡申請" type="danger" size="small" circle @click="approveCorrection(row, false)" title="駁回">
              <el-icon><Close /></el-icon>
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else-if="!isFirstLoad" description="沒有待審核的補打卡申請" :image-size="60" />
    </el-card>

    <LeaveBatchRejectDialog v-model:visible="batchRejectVisibleL" v-model:reason="batchRejectReasonL" :loading="batchLoadingL" @confirm="confirmBatchRejectL" />
    <LeaveBatchRejectDialog v-model:visible="batchRejectVisibleO" v-model:reason="batchRejectReasonO" :loading="batchLoadingO" @confirm="confirmBatchRejectO" />
    <LeaveBatchRejectDialog v-model:visible="batchRejectVisibleC" v-model:reason="batchRejectReasonC" :loading="batchLoadingC" @confirm="confirmBatchRejectC" />

    <el-dialog
      v-model="attachDialogVisible"
      title="假單附件"
      width="640px"
      :before-close="closeAttachDialog"
    >
      <div v-if="attachLoading" style="display:flex;align-items:center;gap:8px;padding:24px;justify-content:center;color:var(--text-secondary);">
        <el-icon class="is-loading"><Loading /></el-icon> 載入中…
      </div>
      <div v-else-if="attachItems.length === 0" style="text-align:center;padding:24px;color:var(--text-secondary);">
        無附件
      </div>
      <div v-else class="attach-grid">
        <div v-for="item in attachItems" :key="item.url" class="attach-item">
          <el-image
            v-if="item.isImage"
            :src="item.url"
            :preview-src-list="attachItems.filter((attach) => attach.isImage).map((attach) => attach.url)"
            :initial-index="attachItems.filter((attach) => attach.isImage).findIndex((attach) => attach.url === item.url)"
            fit="cover"
            class="attach-thumb"
          />
          <a
            v-else
            :href="item.url"
            :download="item.name"
            class="attach-file"
          >
            <el-icon :size="32"><Document /></el-icon>
            <span class="attach-file__name">{{ item.name }}</span>
            <span class="attach-file__hint">點擊下載</span>
          </a>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.approval-page {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0 0 6px;
}

.page-subtitle {
  margin: 0;
  color: var(--text-secondary);
}

.page-header__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.shortcut-card {
  border-radius: 14px;
}

.shortcut-card__meta {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 10px;
}

.shortcut-card__title {
  font-size: 16px;
  font-weight: 700;
}

.shortcut-card__desc {
  margin: 0 0 12px;
  min-height: 44px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.section-card {
  margin-bottom: var(--space-5);
}

/* 三張模組卡的彩色左條已移除（design system 禁區 pattern）：
   卡片各有標題與計數區分模組，色條非唯一辨識通道，統一走 el-card 預設 1px 框。 */

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.card-header__title {
  font-size: var(--text-lg);
  font-weight: 600;
}

.card-header__hint {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}

.card-header__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cell-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
  line-height: 1.45;
}

.cell-strong {
  font-weight: 600;
}

.cell-muted {
  color: var(--text-secondary);
  font-size: 12px;
}

.swap-note {
  color: var(--el-color-warning-dark-2);
  font-size: 12px;
}

.attach-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

.attach-item {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.attach-thumb {
  width: 100%;
  height: 140px;
  display: block;
}

.attach-file {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  text-decoration: none;
  color: var(--text-primary);
  height: 140px;
  transition: background-color 0.2s;
}

.attach-file:hover {
  background-color: var(--bg-color-soft);
}

.attach-file__name {
  font-size: 12px;
  text-align: center;
  word-break: break-all;
  color: var(--text-secondary);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attach-file__hint {
  font-size: 12px;
  color: var(--color-primary);
}

@media (max-width: 900px) {
  .page-header {
    flex-direction: column;
  }

  .card-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
