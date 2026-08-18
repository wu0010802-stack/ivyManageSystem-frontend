<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getOvertimes, createOvertime, updateOvertime, approveOvertime as approveOvertimeApi, batchApproveOvertimes, getOvertimeImportTemplate, importOvertimes } from '@/api/overtimes'
import { useApprovalPolicyStore } from '@/stores/approvalPolicy'
import { hasPermission } from '@/utils/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { Plus, Check, Close, UploadFilled, Loading, Warning } from '@element-plus/icons-vue'
import { useEmployeeStore } from '@/stores/employee'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import LoadingPanel from '@/components/common/LoadingPanel.vue'
import AdminListToolbar from '@/components/common/AdminListToolbar.vue'
import { useCrudDialog, useConfirmDelete, useDateQuery, useFetchPending, useApprovalOperation, useClientTableFilter } from '@/composables'
import { useApprovalModule } from '@/composables/useApprovalModule'
import { downloadFile } from '@/utils/download'
import { money } from '@/utils/format'
import MeetingManagementPanel from '@/components/overtime/MeetingManagementPanel.vue'
import BatchOvertimeDialog from '@/components/overtime/BatchOvertimeDialog.vue'
import ApprovalLogDrawer from '@/components/common/ApprovalLogDrawer.vue'
import { OVERTIME_TYPES as overtimeTypes } from '@/constants/approvalEnums'
import { PAGE_TERMS } from '@/constants/moduleTerms'
import AdminListCards from '@/components/common/AdminListCards.vue'
import { useIsMobile } from '@/composables/useIsMobile'

const { currentYear, query } = useDateQuery()
const employeeStore = useEmployeeStore()
const route = useRoute()
const router = useRouter()

// 手機版（≤767.98px）：清單改卡片視圖（比照 EmployeeListView 範式）；
// 批次勾選為桌機工作流，手機以單筆核准/駁回為主
const { isMobile } = useIsMobile()

// 手機卡片視圖欄位（__ 前綴為 slot-only 欄，值由對應 #cell- slot 渲染）
const overtimeCardColumns = [
  { label: '日期', prop: 'overtime_date' },
  { label: '類型', prop: '__type' },
  { label: '時間', prop: '__time', formatter: (r: Record<string, unknown>) => `${r.start_time || '-'} ~ ${r.end_time || '-'}` },
  { label: '時數', prop: '__hours', formatter: (r: Record<string, unknown>) => `${r.hours}h` },
  { label: '方式', prop: '__method' },
  { label: '加班費', prop: '__pay' },
  { label: '原因', prop: 'reason', block: true, formatter: (r: Record<string, unknown>) => (r.reason as string) || '—' },
  { label: '審核', prop: '__status' },
]

// 待審核項目卡片欄位（手機），與待審表格同欄
const pendingCardColumns = [
  { label: '日期', prop: 'overtime_date' },
  { label: '類型', prop: 'overtime_type_label' },
  { label: '時數', prop: '__hours', formatter: (r: Record<string, unknown>) => `${r.hours}h` },
  { label: '方式', prop: '__method' },
  { label: '原因', prop: 'reason', block: true, formatter: (r: Record<string, unknown>) => (r.reason as string) || '—' },
]

const canViewOvertime = computed(() => hasPermission('OVERTIME_READ'))
const canViewMeetings = computed(() => hasPermission('MEETINGS'))
const activeSection = ref('overtime')

const loading = ref(false)
const overtimeRecords = ref<Record<string, unknown>[]>([])
// >0 表示後端還有未載入的資料（伺服器單次上限），值為過濾條件下的全量筆數
const truncatedTotal = ref(0)
const { items: pendingRecords, fetch: silentFetchPending } = useFetchPending(getOvertimes)

// 客端關鍵字過濾：單月資料已全載，姓名/事由即打即濾，與上方年月/員工下拉（伺服器端）交集
const {
  searchQuery: overtimeSearch,
  filtered: filteredOvertimes,
  total: overtimeTotal,
  shown: overtimeShown,
} = useClientTableFilter<Record<string, unknown>>({
  source: () => overtimeRecords.value,
  searchFields: (r) => [r.employee_name as string | undefined, r.reason as string | undefined],
})

// 全域搜尋（Ctrl+K）深連結：?search=<員工姓名> 預填客端關鍵字過濾
// （route 在無 router 的測試掛載下為 undefined，防禦式取值）
{
  const s = route?.query?.search
  if (typeof s === 'string' && s) overtimeSearch.value = s
}


const form = reactive<{
  id: number | null
  employee_id: string | number | null
  overtime_date: string
  overtime_type: string
  start_time: string
  end_time: string
  hours: number
  reason: string
  use_comp_leave: boolean
}>({
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

const populateForm = (row: Record<string, unknown>) => {
  form.id = (row.id as number | null) ?? null
  form.employee_id = (row.employee_id as string | number | null) ?? null
  form.overtime_date = String(row.overtime_date ?? '')
  form.overtime_type = String(row.overtime_type ?? 'weekday')
  form.start_time = String(row.start_time ?? '')
  form.end_time = String(row.end_time ?? '')
  form.hours = Number(row.hours ?? 1)
  form.reason = String(row.reason ?? '')
  form.use_comp_leave = Boolean(row.use_comp_leave)
}

// 起迄時間 vs 時數一致性檢查
const overtimeTimeError = ref('')
const overtimeHoursWarning = ref('')
const checkOvertimeTimeConsistency = () => {
  overtimeTimeError.value = ''
  overtimeHoursWarning.value = ''
  if (!form.start_time || !form.end_time) return
  if (form.end_time <= form.start_time) {
    overtimeTimeError.value = '結束時間必須晚於開始時間'
    return
  }
  const [sh, sm] = form.start_time.split(':').map(Number)
  const [eh, em] = form.end_time.split(':').map(Number)
  const minutes = (eh * 60 + em) - (sh * 60 + sm)
  const calculated = Math.round(minutes / 60 * 2) / 2
  if (Math.abs(calculated - Number(form.hours)) > 0.001) {
    overtimeHoursWarning.value = `依時段計算為 ${calculated}h，與輸入時數 ${form.hours}h 不一致`
  }
}
watch([() => form.start_time, () => form.end_time, () => form.hours], checkOvertimeTimeConsistency)

const { dialogVisible, isEdit, openCreate, openEdit, closeDialog } = useCrudDialog({ resetForm, populateForm })

const resolveSectionFromRoute = () => {
  if (route.query.tab === 'meetings' && canViewMeetings.value) return 'meetings'
  if (canViewOvertime.value) return 'overtime'
  if (canViewMeetings.value) return 'meetings'
  return 'overtime'
}

const fetchOvertimes = async () => {
  if (!canViewOvertime.value) return
  loading.value = true
  try {
    const params: Record<string, unknown> = { year: query.year, month: query.month }
    if (query.employee_id) params.employee_id = query.employee_id
    const page = await getOvertimes(params)
    overtimeRecords.value = page.items
    // 後端單次最多回 5000 筆；超量時明講，不讓使用者以為看到了全部
    truncatedTotal.value = page.hasMore ? page.total : 0
  } catch (error) {
    ElMessage.error(friendlyError('載入加班記錄失敗', error))
  } finally {
    loading.value = false
  }
}

const fetchPendingOvertimes = () => {
  if (!canViewOvertime.value) return
  return silentFetchPending()
}

const saveOvertimeLoading = ref(false)
const batchCreateVisible = ref(false)
const openBatchCreate = () => { batchCreateVisible.value = true }

const refreshAllData = async () => {
  await Promise.all([fetchOvertimes(), fetchPendingOvertimes()])
}

const saveOvertime = async () => {
  if (!form.employee_id || !form.overtime_date) {
    ElMessage.warning('請填寫必要欄位')
    return
  }
  if (overtimeTimeError.value) {
    ElMessage.error(overtimeTimeError.value)
    return
  }
  if (overtimeHoursWarning.value) {
    const confirmed = await ElMessageBox.confirm(
      `${overtimeHoursWarning.value}。仍要以輸入的時數儲存嗎？`,
      '時數與時段不一致',
      { type: 'warning', confirmButtonText: '仍要儲存', cancelButtonText: '取消' },
    ).catch(() => false)
    if (!confirmed) return
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
      // 後端 OvertimeUpdate 禁止翻轉 use_comp_leave（2026-05-11 P2-14），update payload 必須剔除
      const { employee_id, use_comp_leave: _useCompLeave, ...updatePayload } = payload
      const resp = await updateOvertime(form.id!, updatePayload)
      ElMessage.success(`加班記錄已更新，加班費: $${resp.data.overtime_pay?.toLocaleString() || 0}`)
    } else {
      const resp = await createOvertime(payload)
      ElMessage.success(`加班記錄已新增，加班費: $${resp.data.overtime_pay?.toLocaleString() || 0}`)
    }
    closeDialog()
    await refreshAllData()
  } catch (error) {
    ElMessage.error(friendlyError('儲存加班單失敗', error))
  } finally {
    saveOvertimeLoading.value = false
  }
}

const onDeleteSuccess = async () => {
  await refreshAllData()
}

const { confirmDelete: deleteOvertime, deleting: deleteOvertimeLoading } = useConfirmDelete({
  endpoint: '/overtimes',
  onSuccess: onDeleteSuccess,
  successMsg: '已刪除',
})

const { execute: executeApproval } = useApprovalOperation({
  apiFn: approveOvertimeApi as (id: unknown, payload: unknown) => Promise<unknown>,
  onSuccess: refreshAllData,
})
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
      payload.rejection_reason = (result as unknown as { value: string }).value.trim()
    } catch {
      return
    }
  }
  await executeApproval(row.id, payload, approved ? '已核准' : '已駁回')
}


const overtimeSummary = computed(() =>
  overtimeRecords.value.reduce(
    (acc: { totalHours: number; totalPay: number }, r) => {
      acc.totalHours += Number(r.hours) || 0
      acc.totalPay += Number(r.overtime_pay) || 0
      return acc
    },
    { totalHours: 0, totalPay: 0 },
  ),
)

const {
  selectedItems: selectedOvertimes,
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
  docType: 'overtime',
  batchApproveFn: batchApproveOvertimes as (ids: unknown[], approved: boolean, reason?: string) => Promise<{ data: { succeeded: { length: number }[]; failed: { id: unknown; reason: string }[] } }>,
  fetchFn: refreshAllData,
  recordLabel: '加班記錄',
})

// ── Excel 匯入 ──
const importVisible = ref(false)
const importLoading = ref(false)
interface ImportResult {
  total: number
  created: number
  failed: number
  errors?: string[]
}
const importResult = ref<ImportResult | null>(null)

const downloadImportTemplate = async () => {
  try {
    const res = await getOvertimeImportTemplate()
    const blob = new Blob([res.data])
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = '加班匯入範本.xlsx'
    link.click()
    URL.revokeObjectURL(link.href)
  } catch (e) {
    ElMessage.error(friendlyError('下載加班匯入範本失敗', e))
  }
}

const handleImportFile = async (file: { raw?: File }) => {
  if (!file.raw) return false
  importLoading.value = true
  importResult.value = null
  try {
    const formData = new FormData()
    formData.append('file', file.raw)
    const res = await importOvertimes(formData)
    importResult.value = res.data
    if (res.data.failed === 0) {
      ElMessage.success(`匯入完成，成功建立 ${res.data.created} 筆草稿加班單`)
    }
    // 只要有建立任何草稿（含部分成功 failed>0）就刷新主表，否則已建立的單不會出現
    // 在列表，使用者要手動重查才看得到。部分失敗的明細仍由 importResult 卡片呈現。
    if (res.data.created > 0) {
      await refreshAllData()
    }
  } catch (err) {
    ElMessage.error(friendlyError('匯入加班資料失敗', err))
  } finally {
    importLoading.value = false
  }
  return false
}

// approvalLogs cast for ApprovalLogDrawer (its ApprovalLog type is component-local)
const castApprovalLogs = computed(() => approvalLogs.value as unknown as { id: number; action: string; created_at?: string; approver_username?: string; approver_role?: string }[])

// BatchOvertimeDialog needs { id: number; name: string; is_active?: boolean }[];
// employeeStore.employees is unknown[] from createFetchStore — safe to narrow to known EmployeeOut shape
type EmployeeListItem = { id: number; name: string; is_active?: boolean }
const batchOvertimeEmployees = computed<EmployeeListItem[]>(
  () => employeeStore.employees as unknown as EmployeeListItem[],
)

// ── 審核流程（approvalPolicyStore 仍需 onMounted 中呼叫 fetchPolicies）──────
const approvalPolicyStore = useApprovalPolicyStore()

onMounted(() => {
  activeSection.value = resolveSectionFromRoute()
  Promise.all([
    employeeStore.fetchEmployees(),
    fetchOvertimes(),
    fetchPendingOvertimes(),
    approvalPolicyStore.fetchPolicies(),
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
    <h2>{{ PAGE_TERMS.overtime }}</h2>

    <el-tabs v-model="activeSection" class="overtime-section-tabs">
      <el-tab-pane v-if="canViewOvertime" label="一般加班" name="overtime">
        <el-card class="control-panel">
          <div class="controls">
            <el-select v-model="query.employee_id" placeholder="全部員工" clearable filterable class="ctl-emp">
              <el-option v-for="emp in employeeStore.employees" :key="emp.id" :label="emp.name" :value="emp.id" />
            </el-select>
            <el-select v-model="query.year" class="ctl-year">
              <el-option v-for="y in 5" :key="y" :label="(currentYear - 2 + y) + ' 年'" :value="currentYear - 2 + y" />
            </el-select>
            <el-select v-model="query.month" class="ctl-month">
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
            <el-button v-if="hasPermission('OVERTIME_WRITE')" type="primary" plain @click="openBatchCreate">
              <el-icon><Plus /></el-icon> 批次加班
            </el-button>
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
          <el-table v-if="!isMobile" :data="pendingRecords" style="width: 100%" size="small">
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
                <el-button aria-label="核准加班申請" type="success" size="small" circle @click="approveOvertime(row, true)">
                  <el-icon><Check /></el-icon>
                </el-button>
                <el-button aria-label="駁回加班申請" type="danger" size="small" circle @click="approveOvertime(row, false)">
                  <el-icon><Close /></el-icon>
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          <AdminListCards v-else :items="(pendingRecords as Record<string, unknown>[])" :columns="pendingCardColumns" row-key="id">
            <template #title="{ item }">{{ item.employee_name }}</template>
            <template #cell-__method="{ item }">
              <el-tag v-if="item.use_comp_leave" type="success" size="small">補休</el-tag>
              <el-tag v-else size="small">加班費</el-tag>
            </template>
            <template #actions="{ item }">
              <el-button type="success" size="small" @click="approveOvertime(item, true)">
                <el-icon><Check /></el-icon> 核准
              </el-button>
              <el-button type="danger" size="small" @click="approveOvertime(item, false)">
                <el-icon><Close /></el-icon> 駁回
              </el-button>
            </template>
          </AdminListCards>
        </el-card>

        <el-alert
          v-if="truncatedTotal"
          type="warning"
          show-icon
          :closable="false"
          class="overtime-truncated-alert"
          :title="`查詢結果共 ${truncatedTotal} 筆，目前僅載入前 ${overtimeRecords.length} 筆`"
          description="請縮小查詢範圍（例如指定員工或改查單一月份）以取得完整資料。"
        />

        <AdminListToolbar
          v-model:search="overtimeSearch"
          search-placeholder="搜尋員工姓名或加班事由"
          :total="overtimeTotal"
          :shown="overtimeShown"
        />

        <LoadingPanel
          :loading="loading && !overtimeRecords.length"
          :empty="!loading && !overtimeRecords.length"
          variant="skeleton"
          class="overtime-table-panel"
        >
          <template #skeleton><TableSkeleton :columns="8" /></template>
          <template #empty><el-empty description="尚無加班紀錄" /></template>
          <el-table v-if="!isMobile" :data="filteredOvertimes" border stripe style="width: 100%; margin-top: 20px;" v-loading="loading" max-height="600" @selection-change="handleSelectionChange">
          <template #empty>
            <el-empty :description="overtimeSearch ? '沒有符合搜尋條件的加班紀錄' : '尚無加班紀錄'" />
          </template>
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
              <el-tag v-if="scope.row.status === 'approved'" type="success" size="small">已核准</el-tag>
              <el-tag v-else-if="scope.row.status === 'rejected'" type="danger" size="small">已駁回</el-tag>
              <el-tag v-else type="warning" size="small">待審核</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="240" fixed="right">
            <template #default="scope">
              <el-button v-if="scope.row.status !== 'approved' && canApprove(scope.row)" type="success" size="small" link @click="approveOvertime(scope.row, true)">核准</el-button>
              <el-button v-if="scope.row.status !== 'rejected' && canApprove(scope.row)" type="warning" size="small" link @click="approveOvertime(scope.row, false)">駁回</el-button>
              <el-button type="primary" size="small" link @click="openEdit(scope.row)">編輯</el-button>
              <el-button type="danger" size="small" link @click="deleteOvertime(scope.row)" :loading="deleteOvertimeLoading">刪除</el-button>
              <el-button type="info" size="small" link @click="openApprovalLogs(scope.row)">記錄</el-button>
            </template>
          </el-table-column>
        </el-table>
        <AdminListCards
          v-else
          :items="filteredOvertimes"
          :columns="overtimeCardColumns"
          row-key="id"
          :loading="loading"
          :empty-text="overtimeSearch ? '沒有符合搜尋條件的加班紀錄' : '尚無加班紀錄'"
        >
          <template #title="{ item }">{{ item.employee_name }}</template>
          <template #cell-__type="{ item }">
            <el-tag :type="item.overtime_type === 'weekday' ? 'info' : 'warning'" size="small">
              {{ item.overtime_type_label }}
            </el-tag>
          </template>
          <template #cell-__method="{ item }">
            <el-tag v-if="item.use_comp_leave" type="success" size="small">補休 {{ item.hours }}h</el-tag>
            <el-tag v-else size="small">加班費</el-tag>
          </template>
          <template #cell-__pay="{ item }">
            <span v-if="item.use_comp_leave" style="color: var(--el-text-color-secondary);">--</span>
            <strong v-else>{{ money(item.overtime_pay as number) }}</strong>
          </template>
          <template #cell-__status="{ item }">
            <el-tag v-if="item.status === 'approved'" type="success" size="small">已核准</el-tag>
            <el-tag v-else-if="item.status === 'rejected'" type="danger" size="small">已駁回</el-tag>
            <el-tag v-else type="warning" size="small">待審核</el-tag>
          </template>
          <template #actions="{ item }">
            <el-button v-if="item.status !== 'approved' && canApprove(item)" type="success" size="small" link @click="approveOvertime(item, true)">核准</el-button>
            <el-button v-if="item.status !== 'rejected' && canApprove(item)" type="warning" size="small" link @click="approveOvertime(item, false)">駁回</el-button>
            <el-button type="primary" size="small" link @click="openEdit(item)">編輯</el-button>
            <el-button type="danger" size="small" link @click="deleteOvertime(item)" :loading="deleteOvertimeLoading">刪除</el-button>
            <el-button type="info" size="small" link @click="openApprovalLogs({ id: item.id })">記錄</el-button>
          </template>
        </AdminListCards>
        </LoadingPanel>

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
        <el-form-item label="結束時間" :error="overtimeTimeError">
          <el-time-picker v-model="form.end_time" format="HH:mm" value-format="HH:mm" placeholder="選擇時間" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="加班時數" required>
          <el-input-number v-model="form.hours" :min="0.5" :step="0.5" :max="12" />
          <div v-if="overtimeHoursWarning" style="margin-top: 4px; font-size: 12px; color: var(--el-color-warning);">
            <el-icon style="vertical-align: middle;"><Warning /></el-icon>
            {{ overtimeHoursWarning }}
          </div>
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

    <BatchOvertimeDialog
      v-model="batchCreateVisible"
      :employees="batchOvertimeEmployees"
      @created="refreshAllData"
    />

    <!-- 簽核記錄 Drawer -->
    <ApprovalLogDrawer
      v-model:visible="approvalLogDrawerVisible"
      :loading="approvalLogLoading"
      :logs="castApprovalLogs"
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
.ctl-emp { width: 180px; }
.ctl-year { width: 110px; }
.ctl-month { width: 90px; }

/* 手機：查詢列控制項改流式填滿、按鈕觸控目標對齊 44px */
@media (--to-sm) {
  .ctl-emp { width: auto; flex: 1 1 100%; }
  .ctl-year { width: auto; flex: 1 1 40%; }
  .ctl-month { width: auto; flex: 1 1 28%; }
  .controls .el-button {
    min-height: var(--touch-target-min);
  }
  .summary {
    flex-direction: column;
    gap: var(--space-2);
  }
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
  /* 待審卡由彩色左條改為 1px 全框 warning（design system 禁區 pattern）；
     內含表格故不加底色 tint，避免壓縮內容對比 */
  border: 1px solid var(--color-warning);
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
