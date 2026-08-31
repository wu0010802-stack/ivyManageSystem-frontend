<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { getAssignments, saveAssignments, copyMonthAssignments, getDaily, saveDaily, deleteDaily, getScheduleRoster, getSwapHistory, getShiftImportTemplate, importShifts, exportShifts, getLeaveContext } from '@/api/shifts'
import { computeWeekCoverage, leaveWindowForDate, type LeaveContextItem, type DailyOverrideLike, type AbsenceWindow } from '@/utils/scheduleCoverage'
import type { ApiResponse } from '@/api/_generated/typed'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { ArrowRight, Loading, UploadFilled } from '@element-plus/icons-vue'
import { useShiftStore } from '@/stores/shift'
import { storeToRefs } from 'pinia'
import { apiError } from '@/utils/error'
import AdminListToolbar from '@/components/common/AdminListToolbar.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import { useIsMobile } from '@/composables/useIsMobile'
import { useClientTableFilter } from '@/composables'

// 手機版（≤767.98px）：兩個清單改卡片視圖（比照 EmployeeListView 範式）
const { isMobile } = useIsMobile()

// 班別指派卡片欄位：班別下拉與起訖時間為 slot（沿用表格內同一套 getter）
const assignmentCardColumns = [
  { label: '班級', prop: '__classroom', formatter: (r: Record<string, unknown>) => (r.classroom_name as string) || '-' },
  { label: '班別', prop: '__shift' },
  { label: '上班時間', prop: '__start' },
  { label: '下班時間', prop: '__end' },
]

// 換班紀錄卡片欄位
const swapCardColumns = [
  { label: '換班日期', prop: 'swap_date' },
  { label: '發起人', prop: '__requester' },
  { label: '對象', prop: '__target' },
  { label: '狀態', prop: '__status' },
  { label: '申請時間', prop: 'created_at' },
  { label: '回覆時間', prop: '__responded', formatter: (r: Record<string, unknown>) => (r.target_responded_at as string) || '—' },
  { label: '原因', prop: 'reason', block: true, formatter: (r: Record<string, unknown>) => (r.reason as string) || '—' },
]

// --- State ---
interface AssignmentEntry { shift_type_id: number | null; notes: string | null }
// 排班名冊列（GET /shifts/roster 最小欄位；勿改回全量 EmployeeOut）
type EmployeeRow = ApiResponse<'/shifts/roster', 'get'>[number]
type ShiftImportResult = ApiResponse<'/shifts/import', 'post'>
type WeeklyWarning = NonNullable<ApiResponse<'/shifts/assignments', 'post'>['warnings']>[number]

const loading = ref(false)
const saving = ref(false)
const shiftStore = useShiftStore()
const { activeShiftTypes: shiftTypes } = storeToRefs(shiftStore)
const roster = ref<EmployeeRow[]>([])
const assignments = ref<Record<string | number, AssignmentEntry>>({}) // { employee_id: { shift_type_id, notes } }

const fetchRoster = async () => {
  try {
    const res = await getScheduleRoster()
    roster.value = res.data
  } catch (e) {
    ElMessage.error(friendlyError('載入排班名冊失敗', e))
  }
}

// Week selector - default to current week's Monday
const getMonday = (d: Date) => {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  return date
}

const formatDate = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

const monday = getMonday(new Date())
const weekStart = ref(formatDate(monday))

const weekLabel = computed(() => {
  const d = new Date(weekStart.value)
  const end = new Date(d)
  end.setDate(end.getDate() + 4) // Friday
  return `${d.getMonth() + 1}/${d.getDate()} ~ ${end.getMonth() + 1}/${end.getDate()}`
})

// Filter: only show active employees with classroom assignment (teachers)
// roster 預設只回在職者；沿用「有班級指派」的既有篩選語意
const teacherEmployees = computed(() => {
  return roster.value.filter((e) => e.classroom_id)
})

// --- 請假整合（2026-08-28）：週請假摘要＋全員每日調整 → 空班判定 ---
const weekLeaves = ref<LeaveContextItem[]>([])
const weekDailyOverrides = ref<DailyOverrideLike[]>([])

const weekEndDate = computed(() => {
  const d = new Date(weekStart.value)
  d.setDate(d.getDate() + 6)
  return formatDate(d)
})

const fetchLeaveContext = async () => {
  try {
    const res = await getLeaveContext({ start_date: weekStart.value, end_date: weekEndDate.value })
    weekLeaves.value = res.data as LeaveContextItem[]
  } catch (e) {
    ElMessage.error(friendlyError('載入請假資訊失敗', e))
  }
}

// 全員每日調整（供空班判定用；每日調整 dialog 另按單一員工查詢）
const fetchWeekDailyOverrides = async () => {
  try {
    const res = await getDaily({ start_date: weekStart.value, end_date: weekEndDate.value })
    weekDailyOverrides.value = (res.data as { employee_id: number; date: string; shift_type_id: number | null }[])
      .map((d) => ({ employee_id: d.employee_id, date: d.date, shift_type_id: d.shift_type_id }))
  } catch (e) {
    ElMessage.error(friendlyError('載入每日調整失敗', e))
  }
}

const fetchAssignments = async () => {
  loading.value = true
  // 請假摘要與全員每日調整跟著週切換一起刷新（各自有錯誤處理，不擋主流程）
  fetchLeaveContext()
  fetchWeekDailyOverrides()
  try {
    const res = await getAssignments({ week_start: weekStart.value })
    // Build map: employee_id -> assignment
    const map: Record<string | number, AssignmentEntry> = {}
    for (const a of (res.data as { employee_id: number; shift_type_id: number | null; notes: string | null }[])) {
      map[a.employee_id] = { shift_type_id: a.shift_type_id, notes: a.notes }
    }
    assignments.value = map
  } catch (e) {
    ElMessage.error(friendlyError('載入排班失敗', e))
  } finally {
    loading.value = false
  }
}

// --- Week Navigation ---
const changeWeek = (offset: number) => {
  const d = new Date(weekStart.value)
  d.setDate(d.getDate() + offset * 7)
  weekStart.value = formatDate(d)
  fetchAssignments()
}

const onWeekChange = (val: string) => {
  // Align to Monday
  const d = new Date(val)
  weekStart.value = formatDate(getMonday(d))
  fetchAssignments()
}

// --- Assignment ---
const getAssignment = (empId: number): number | null => {
  return assignments.value[empId]?.shift_type_id || null
}

const setAssignment = (empId: number, shiftTypeId: number | null) => {
  if (!assignments.value[empId]) {
    assignments.value[empId] = { shift_type_id: null, notes: '' }
  }
  assignments.value[empId].shift_type_id = shiftTypeId
}

const shiftTypeMap = computed(() => {
  const map = new Map()
  for (const st of shiftTypes.value) map.set(st.id, st)
  return map
})

const getShiftInfo = (shiftTypeId: number | null) => shiftTypeId != null ? shiftTypeMap.value.get(shiftTypeId) : undefined

// --- Save ---
// 後端超時預警（>40h/週）——過去整包被丟棄，現以常駐 alert 呈現到下次儲存
const saveWarnings = ref<WeeklyWarning[]>([])

const saveAll = async () => {
  saving.value = true
  try {
    const items = []
    for (const emp of teacherEmployees.value) {
      const a = assignments.value[emp.id]
      items.push({
        employee_id: emp.id,
        shift_type_id: a?.shift_type_id || null,
        notes: a?.notes || null,
      })
    }
    const res = await saveAssignments({
      week_start_date: weekStart.value,
      assignments: items,
    })
    saveWarnings.value = res.data.warnings ?? []
    if (saveWarnings.value.length) {
      ElMessage.warning(`排班已儲存，但有 ${saveWarnings.value.length} 位員工週工時超過上限，詳見下方警告`)
    } else {
      ElMessage.success('排班已儲存')
    }
  } catch (error) {
    ElMessage.error(apiError(error, '儲存失敗'))
  } finally {
    saving.value = false
  }
}

// --- 排班複製 ---

// 複製指定來源週排班到當前週的 local state（需手動儲存）
const copyFromWeek = async (sourceWeekStart: string) => {
  try {
    const res = await getAssignments({ week_start: sourceWeekStart })
    if (res.data.length === 0) {
      ElMessage.warning('來源週無排班資料')
      return
    }
    const map: Record<string | number, AssignmentEntry> = {}
    for (const a of (res.data as { employee_id: number; shift_type_id: number | null; notes: string | null }[])) {
      map[a.employee_id] = { shift_type_id: a.shift_type_id, notes: a.notes }
    }
    assignments.value = map
    ElMessage.success('已複製，請確認後儲存')
  } catch (e) {
    ElMessage.error(friendlyError('複製排班失敗', e))
  }
}

// 快捷：複製上週
const copyPrevWeek = () => {
  const d = new Date(weekStart.value)
  d.setDate(d.getDate() - 7)
  copyFromWeek(formatDate(d))
}

// 週選擇器狀態
const copySourceWeek = ref('')
const copyWeekPickerVisible = ref(false)

const onCopyWeekConfirm = () => {
  if (!copySourceWeek.value) { ElMessage.warning('請選擇來源週'); return }
  const d = new Date(copySourceWeek.value)
  copyFromWeek(formatDate(getMonday(d)))
  copyWeekPickerVisible.value = false
}

// 複製上月整月：改走後端單一 transaction 端點（preview → 確認 → 套用）。
// 舊版前端逐週 await 迴圈是部分成功黑洞：中途失敗不回滾也不告知已寫入週數。
const monthCopyLoading = ref(false)

const copyPrevMonth = async () => {
  const cur = new Date(weekStart.value)
  const ty = cur.getFullYear()
  const tm = cur.getMonth() + 1 // 1-based

  // 上一個月
  let sy = ty, sm = tm - 1
  if (sm === 0) { sy -= 1; sm = 12 }

  const payload = {
    source_year: sy,
    source_month: sm,
    target_year: ty,
    target_month: tm,
    mode: 'overwrite' as const,
  }

  monthCopyLoading.value = true
  try {
    // 先 dry_run 取預覽：封存阻擋與筆數先攤在確認框，不做半套
    const preview = await copyMonthAssignments({ ...payload, dry_run: true })
    const p = preview.data
    if (p.blocked.length) {
      ElMessage.error(`無法複製，以下月份薪資已封存：${p.blocked.join('、')}`)
      return
    }
    if (p.created + p.updated === 0) {
      ElMessage.warning('來源月無可複製的週排班')
      return
    }
    try {
      await ElMessageBox.confirm(
        `將 ${sy}年${sm}月 排班複製到 ${ty}年${tm}月（配對 ${p.weeks_paired} 週）：新增 ${p.created} 筆、覆蓋 ${p.updated} 筆。每日調班不受影響。`,
        '複製上月整月',
        { confirmButtonText: '確認複製', cancelButtonText: '取消', type: 'warning' }
      )
    } catch {
      return // 使用者取消
    }
    const res = await copyMonthAssignments({ ...payload, dry_run: false })
    ElMessage.success(`已複製：新增 ${res.data.created} 筆、覆蓋 ${res.data.updated} 筆`)
    fetchAssignments() // 重新載入當前週
  } catch (e) {
    ElMessage.error(friendlyError('整月複製排班失敗', e))
  } finally {
    monthCopyLoading.value = false
  }
}

onMounted(async () => {
  await Promise.all([fetchRoster(), shiftStore.fetchShiftTypes()])
  fetchAssignments()
})

// --- Daily Shift Dialog ---
const dailyDialogVisible = ref(false)
const currentEmployee = ref<EmployeeRow | null>(null)
const dailyShifts = ref<Record<string, unknown>[]>([]) // list of daily shifts from API
const dailyShiftMap = ref<Record<string, Record<string, unknown>>>({}) // date -> shift record

// Generate dates for current week（週一～週日整週 7 天——週末也可指定日班/排休，
// 舊版寫死 5 天讓假日班與週末排休完全沒有入口）
const currentWeekDates = computed(() => {
  if (!weekStart.value) return []
  const start = new Date(weekStart.value)
  const dates = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    dates.push(formatDate(d))
  }
  return dates
})

const getDayName = (dateStr: string) => {
  const d = new Date(dateStr)
  const days = ['日', '一', '二', '三', '四', '五', '六']
  return days[d.getDay()]
}

// --- 請假覆蓋／空班判定（純邏輯在 utils/scheduleCoverage，含測試） ---
const weekCoverage = computed(() =>
  computeWeekCoverage({
    dates: currentWeekDates.value,
    employeeIds: teacherEmployees.value.map((e) => e.id),
    weeklyShiftByEmp: Object.fromEntries(
      teacherEmployees.value.map((e) => [e.id, getAssignment(e.id)])
    ),
    dailyOverrides: weekDailyOverrides.value,
    shiftTypes: shiftTypes.value,
    leaves: weekLeaves.value,
  })
)

// 桌機恆列 7 天；手機只列有請假或空班的天，避免整條空卡
const coverageDaysToShow = computed(() =>
  isMobile.value
    ? weekCoverage.value.filter((d) => d.leaves.length || d.gaps.length)
    : weekCoverage.value
)

const leavesByEmployee = computed(() => {
  const map = new Map<number, LeaveContextItem[]>()
  for (const lv of weekLeaves.value) {
    const list = map.get(lv.employee_id)
    if (list) list.push(lv)
    else map.set(lv.employee_id, [lv])
  }
  return map
})

const empWeekLeaves = (empId: number) => leavesByEmployee.value.get(empId) ?? []

const empLeavesOnDate = (empId: number, dateStr: string) =>
  empWeekLeaves(empId)
    .map((lv) => ({ lv, window: leaveWindowForDate(lv, dateStr) }))
    .filter((x): x is { lv: LeaveContextItem; window: AbsenceWindow } => x.window != null)

const windowLabel = (win: AbsenceWindow) =>
  win.start === '00:00' && win.end === '24:00' ? '全天' : `${win.start}~${win.end}`

const openDailyDialog = async (emp: EmployeeRow) => {
  currentEmployee.value = emp
  dailyDialogVisible.value = true
  dailyShiftMap.value = {} // reset
  await fetchDailyShiftsForDialog()
}

const fetchDailyShiftsForDialog = async () => {
  if (!currentEmployee.value) return

  // Calculate end date（週日；整週 7 天）
  const start = new Date(weekStart.value)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)

  try {
    const res = await getDaily({
      start_date: weekStart.value,
      end_date: formatDate(end),
      employee_id: currentEmployee.value.id
    })
    
    dailyShifts.value = res.data as Record<string, unknown>[]
    // Map to date -> id
    const map: Record<string, Record<string, unknown>> = {}
    for (const ds of (res.data as Record<string, unknown>[])) {
      map[ds.date as string] = ds
    }
    dailyShiftMap.value = map
  } catch (e) {
    ElMessage.error(friendlyError('載入每日排班失敗', e))
  }
}

// 三態 select 的哨兵值：明確排休（後端 day_off=true → DailyShift.shift_type_id=NULL）
const DAY_OFF_VALUE = -1

/** 三態顯示值：無列=null（繼承）；列的 shift_type_id=null → 排休哨兵；否則班別 id */
const getDailySelectValue = (dateStr: string): number | null => {
  const ds = dailyShiftMap.value[dateStr]
  if (!ds) return null
  return (ds.shift_type_id as number | null) ?? DAY_OFF_VALUE
}

const getDailyShiftRecordId = (dateStr: string): number | null => {
  const ds = dailyShiftMap.value[dateStr]
  return ds ? (ds.id as number) : null
}

// --- Swap History ---
const activeTab = ref('schedule')
const swapHistory = ref<Record<string, unknown>[]>([])
const swapLoading = ref(false)
const swapFilter = reactive({
  start_date: '',
  end_date: '',
  status: '',
})

// 客端關鍵字過濾：查詢區間內資料已全載，發起人/對象姓名即打即濾，與上方日期/狀態下拉（伺服器端）交集
const {
  searchQuery: swapSearch,
  filtered: filteredSwapHistory,
  total: swapTotal,
  shown: swapShown,
} = useClientTableFilter<Record<string, unknown>>({
  source: () => swapHistory.value,
  searchFields: (r) => [r.requester_name as string | undefined, r.target_name as string | undefined],
})

const fetchSwapHistory = async () => {
  swapLoading.value = true
  try {
    const params: Record<string, string> = {}
    if (swapFilter.start_date) params.start_date = swapFilter.start_date
    if (swapFilter.end_date) params.end_date = swapFilter.end_date
    if (swapFilter.status) params.status = swapFilter.status
    const res = await getSwapHistory(params)
    swapHistory.value = res.data
  } catch (e) {
    ElMessage.error(friendlyError('載入換班紀錄失敗', e))
  } finally {
    swapLoading.value = false
  }
}

const onTabChange = (tab: string | number) => {
  if (tab === 'swap-history') {
    fetchSwapHistory()
  }
}

const swapStatusLabel = (status: string) => {
  return ({ pending: '待回覆', accepted: '已接受', rejected: '已拒絕', cancelled: '已撤銷' } as Record<string, string>)[status] || status
}

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined
const swapStatusType = (status: string): ElTagType => {
  const map: Record<string, ElTagType> = { pending: 'warning', accepted: 'success', rejected: 'danger', cancelled: 'info' }
  return map[status] ?? 'info'
}

// --- 排班 Excel 匯入/匯出 ---
const shiftImportVisible = ref(false)
const shiftImportLoading = ref(false)
const shiftImportResult = ref<ShiftImportResult | null>(null)

const downloadShiftTemplate = async () => {
  try {
    const res = await getShiftImportTemplate()
    const url = URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = '排班匯入範本.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    ElMessage.error(friendlyError('下載排班範本失敗', e))
  }
}

const exportCurrentWeekShifts = async () => {
  try {
    const res = await exportShifts(weekStart.value)
    const url = URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = `排班表_${weekStart.value}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    ElMessage.error(friendlyError('匯出排班失敗', e))
  }
}

const handleShiftImportFile = async (file: { raw?: File }) => {
  if (!file.raw) return
  const formData = new FormData()
  formData.append('file', file.raw)
  shiftImportLoading.value = true
  shiftImportResult.value = null
  try {
    const res = await importShifts(formData, weekStart.value)
    shiftImportResult.value = res.data
    // 後端欄位名是 saved（typed wrapper 上線前曾誤讀 upserted → UI 顯示 undefined）
    if (res.data.failed === 0) {
      ElMessage.success(`匯入完成，共 ${res.data.saved} 筆排班`)
    } else {
      ElMessage.warning(`匯入完成，成功 ${res.data.saved} 筆，失敗 ${res.data.failed} 筆`)
    }
    fetchAssignments()
  } catch (error) {
    ElMessage.error(apiError(error, '匯入失敗'))
  } finally {
    shiftImportLoading.value = false
  }
}

const handleDailyShiftChange = async (dateStr: string, value: number | null) => {
  if (!currentEmployee.value) return

  try {
    if (value === DAY_OFF_VALUE) {
      // 明確排休：留一筆 shift_type_id=NULL 的列（與「清除＝恢復繼承」是不同語意）
      await saveDaily({
        employee_id: currentEmployee.value.id,
        day_off: true,
        date: dateStr,
      })
      ElMessage.success('已標記休假（該日不上班）')
    } else if (value) {
      // Upsert 指定日班
      await saveDaily({
        employee_id: currentEmployee.value.id,
        shift_type_id: value,
        day_off: false,
        date: dateStr,
      })
      ElMessage.success('已更新每日排班')
    } else {
      // 清除＝刪列＝恢復繼承週排班
      const recordId = getDailyShiftRecordId(dateStr)
      if (recordId != null) {
        await deleteDaily(recordId)
        ElMessage.success('已清除（恢復繼承週排班）')
      }
    }
    // Refresh（dialog 單人清單＋全員每日調整都要刷新，空班判定才會跟上）
    await fetchDailyShiftsForDialog()
    fetchWeekDailyOverrides()
  } catch (error) {
    ElMessage.error(friendlyError('更新排班失敗', error))
  }
}
</script>

<template>
  <div class="schedule-page">
    <h2>排班管理</h2>

    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane label="每週排班" name="schedule">
        <!-- Week Controls -->
        <el-card class="control-panel">
          <div class="controls">
            <el-button @click="changeWeek(-1)" :icon="'ArrowLeft'">上週</el-button>
            <el-date-picker
              v-model="weekStart"
              type="date"
              placeholder="選擇日期"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
              style="width: 160px;"
              @change="onWeekChange"
            />
            <el-button @click="changeWeek(1)">下週 <el-icon><ArrowRight /></el-icon></el-button>
            <span class="week-label">{{ weekLabel }}</span>
            <div class="spacer" />
            <el-dropdown split-button @click="copyPrevWeek" :loading="monthCopyLoading">
              複製上週排班
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="copyPrevWeek">複製上週排班</el-dropdown-item>
                  <el-dropdown-item @click="copyWeekPickerVisible = true">複製指定週...</el-dropdown-item>
                  <el-dropdown-item @click="copyPrevMonth" :disabled="monthCopyLoading">複製上月整月...</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button @click="exportCurrentWeekShifts">匯出本週班表</el-button>
            <el-button @click="downloadShiftTemplate">下載範本</el-button>
            <el-button @click="shiftImportVisible = true">匯入班表</el-button>
            <el-button type="primary" @click="saveAll" :loading="saving">儲存排班</el-button>
          </div>
        </el-card>

        <!-- 週工時超時預警（後端 warnings；常駐到下次儲存或手動關閉） -->
        <el-alert
          v-if="saveWarnings.length"
          type="warning"
          title="週工時超上限預警"
          :closable="true"
          data-test="weekly-warnings"
          style="margin-top: 12px;"
          @close="saveWarnings = []"
        >
          <div v-for="w in saveWarnings" :key="w.employee_id">{{ w.message }}</div>
        </el-alert>

        <!-- 本週請假與空班概覽（資料：GET /shifts/leave-context＋全員每日調整） -->
        <div
          v-if="coverageDaysToShow.length"
          class="week-leave-strip"
          :class="{ mobile: isMobile }"
          data-test="leave-strip"
        >
          <div
            v-for="day in coverageDaysToShow"
            :key="day.date"
            class="day-card"
            :class="{ 'has-gap': day.gaps.length }"
          >
            <div class="day-head">{{ day.date.slice(5).replace('-', '/') }}（{{ getDayName(day.date) }}）</div>
            <div
              v-for="gap in day.gaps"
              :key="gap.shiftTypeId"
              class="gap-alert"
              :class="gap.severity"
              :data-test="`gap-${day.date}`"
            >
              ⚠ {{ gap.shiftTypeName }}（{{ gap.workStart }}~{{ gap.workEnd }}）{{ gap.severity === 'empty' ? '無人上班' : '待審通過將無人' }}
            </div>
            <div
              v-for="entry in day.leaves"
              :key="entry.leave.id"
              class="leave-entry"
              :class="{ pending: entry.leave.status === 'pending' }"
            >
              <span class="leave-name">{{ entry.leave.employee_name }}</span>
              <span class="leave-window">{{ windowLabel(entry.window) }}</span>
              <span class="leave-type">{{ entry.leave.leave_type_label }}</span>
              <el-tag v-if="entry.leave.status === 'pending'" type="warning" size="small">待審</el-tag>
            </div>
            <div v-if="!day.leaves.length && !day.gaps.length" class="leave-none">無請假</div>
          </div>
        </div>

        <!-- Assignment Table -->
        <el-table v-if="!isMobile" :data="teacherEmployees" v-loading="loading" style="width: 100%; margin-top: 16px;" stripe>
          <el-table-column label="姓名" width="130" fixed>
            <template #default="{ row }">
              {{ row.name }}
              <el-tag
                v-if="empWeekLeaves(row.id).length"
                size="small"
                type="warning"
                class="row-leave-tag"
                data-test="row-leave-tag"
              >請假</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="班級" width="120">
            <template #default="{ row }">
              {{ row.classroom_name || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="班別" min-width="240">
            <template #default="{ row }">
              <el-select
                :model-value="getAssignment(row.id)"
                @update:model-value="(val) => setAssignment(row.id, val)"
                placeholder="選擇班別"
                clearable
                style="width: 100%;"
              >
                <el-option
                  v-for="st in shiftTypes"
                  :key="st.id"
                  :label="`${st.name} (${st.work_start}~${st.work_end})`"
                  :value="st.id"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="上班時間" min-width="120">
            <template #default="{ row }">
              <template v-if="getAssignment(row.id)">
                {{ getShiftInfo(getAssignment(row.id))?.work_start || '' }}
              </template>
              <span v-else class="text-muted">-</span>
            </template>
          </el-table-column>
          <el-table-column label="下班時間" min-width="120">
            <template #default="{ row }">
              <template v-if="getAssignment(row.id)">
                {{ getShiftInfo(getAssignment(row.id))?.work_end || '' }}
              </template>
              <span v-else class="text-muted">-</span>
            </template>
          </el-table-column>
          <el-table-column label="每日調整" min-width="100" align="center">
            <template #default="{ row }">
              <el-button size="small" @click="openDailyDialog(row)">調整</el-button>
            </template>
          </el-table-column>
        </el-table>
        <AdminListCards
          v-else
          :items="(teacherEmployees as unknown as Record<string, unknown>[])"
          :columns="assignmentCardColumns"
          row-key="id"
          :loading="loading"
          empty-text="尚無班導老師資料（需有班級指派的員工）"
        >
          <template #title="{ item }">
            {{ item.name }}
            <el-tag
              v-if="empWeekLeaves(item.id as number).length"
              size="small"
              type="warning"
              class="row-leave-tag"
            >請假</el-tag>
          </template>
          <template #cell-__shift="{ item }">
            <el-select
              :model-value="getAssignment(item.id as number)"
              placeholder="選擇班別"
              clearable
              class="card-shift-select"
              @update:model-value="(val) => setAssignment(item.id as number, val)"
            >
              <el-option
                v-for="st in shiftTypes"
                :key="st.id"
                :label="`${st.name} (${st.work_start}~${st.work_end})`"
                :value="st.id"
              />
            </el-select>
          </template>
          <template #cell-__start="{ item }">
            <template v-if="getAssignment(item.id as number)">
              {{ getShiftInfo(getAssignment(item.id as number))?.work_start || '' }}
            </template>
            <span v-else class="text-muted">-</span>
          </template>
          <template #cell-__end="{ item }">
            <template v-if="getAssignment(item.id as number)">
              {{ getShiftInfo(getAssignment(item.id as number))?.work_end || '' }}
            </template>
            <span v-else class="text-muted">-</span>
          </template>
          <template #actions="{ item }">
            <el-button size="small" @click="openDailyDialog(item as unknown as EmployeeRow)">每日調整</el-button>
          </template>
        </AdminListCards>

        <el-empty v-if="teacherEmployees.length === 0 && !loading" description="尚無班導老師資料（需有班級指派的員工）" />
      </el-tab-pane>

      <el-tab-pane label="換班紀錄" name="swap-history">
        <el-card class="control-panel">
          <div class="controls">
            <el-date-picker
              v-model="swapFilter.start_date"
              type="date"
              placeholder="開始日期"
              value-format="YYYY-MM-DD"
              style="width: 150px"
            />
            <el-date-picker
              v-model="swapFilter.end_date"
              type="date"
              placeholder="結束日期"
              value-format="YYYY-MM-DD"
              style="width: 150px"
            />
            <el-select v-model="swapFilter.status" placeholder="狀態" clearable style="width: 120px">
              <el-option label="待回覆" value="pending" />
              <el-option label="已接受" value="accepted" />
              <el-option label="已拒絕" value="rejected" />
              <el-option label="已撤銷" value="cancelled" />
            </el-select>
            <el-button type="primary" @click="fetchSwapHistory">查詢</el-button>
          </div>
        </el-card>

        <AdminListToolbar
          v-model:search="swapSearch"
          search-placeholder="搜尋發起人或對象姓名"
          :total="swapTotal"
          :shown="swapShown"
        />

        <el-table v-if="!isMobile" :data="filteredSwapHistory" v-loading="swapLoading" style="width: 100%; margin-top: 16px;" stripe>
          <template #empty>
            <el-empty :description="swapSearch ? '沒有符合搜尋條件的換班紀錄' : '尚無換班紀錄'" />
          </template>
          <el-table-column prop="swap_date" label="換班日期" width="120" />
          <el-table-column prop="requester_name" label="發起人" width="100" />
          <el-table-column prop="requester_shift" label="發起人班別" width="110" />
          <el-table-column prop="target_name" label="對象" width="100" />
          <el-table-column prop="target_shift" label="對象班別" width="110" />
          <el-table-column prop="reason" label="原因" min-width="120" show-overflow-tooltip />
          <el-table-column label="狀態" width="90">
            <template #default="{ row }">
              <el-tag :type="swapStatusType(row.status)" size="small">{{ swapStatusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="target_responded_at" label="回覆時間" width="160" />
          <el-table-column prop="created_at" label="申請時間" width="160" />
        </el-table>
        <AdminListCards
          v-else
          :items="filteredSwapHistory"
          :columns="swapCardColumns"
          row-key="id"
          :loading="swapLoading"
          :empty-text="swapSearch ? '沒有符合搜尋條件的換班紀錄' : '尚無換班紀錄'"
        >
          <!-- 卡片標題用「發起人 → 對象」把換班雙方一眼帶出 -->
          <template #title="{ item }">
            {{ item.requester_name }} <el-icon><ArrowRight /></el-icon> {{ item.target_name }}
          </template>
          <template #cell-__requester="{ item }">
            {{ item.requester_name }}<span v-if="item.requester_shift">（{{ item.requester_shift }}）</span>
          </template>
          <template #cell-__target="{ item }">
            {{ item.target_name }}<span v-if="item.target_shift">（{{ item.target_shift }}）</span>
          </template>
          <template #cell-__status="{ item }">
            <el-tag :type="swapStatusType(item.status as string)" size="small">{{ swapStatusLabel(item.status as string) }}</el-tag>
          </template>
        </AdminListCards>
      </el-tab-pane>
    </el-tabs>

    <!-- 複製指定週 Dialog -->
    <el-dialog v-model="copyWeekPickerVisible" title="複製指定週排班" width="340px">
      <el-date-picker
        v-model="copySourceWeek"
        type="date"
        placeholder="選擇來源週任一日期"
        format="YYYY-MM-DD"
        value-format="YYYY-MM-DD"
        style="width: 100%;"
      />
      <template #footer>
        <el-button @click="copyWeekPickerVisible = false">取消</el-button>
        <el-button type="primary" @click="onCopyWeekConfirm">確認複製</el-button>
      </template>
    </el-dialog>

    <!-- 排班批次匯入 Dialog -->
    <el-dialog v-model="shiftImportVisible" title="批次匯入排班" width="500px">
      <p style="margin-bottom:12px; color: var(--text-secondary); font-size: 13px;">
        上傳 Excel 檔，格式：員工編號 | 員工姓名 | 班別名稱。
        匯入後將覆蓋當週 ({{ weekStart }}) 的週排班設定。
      </p>
      <el-upload
        drag
        :auto-upload="false"
        :on-change="handleShiftImportFile"
        accept=".xlsx"
        :show-file-list="false"
        :disabled="shiftImportLoading"
      >
        <div style="padding: 20px 0;">
          <el-icon :size="28" style="margin-bottom: 8px; color: var(--text-tertiary);"><UploadFilled /></el-icon>
          <div>拖曳或點擊上傳 .xlsx 檔案</div>
        </div>
      </el-upload>
      <div v-if="shiftImportLoading" style="text-align: center; margin-top: 12px;">
        <el-icon class="is-loading"><Loading /></el-icon> 匯入中...
      </div>
      <div v-if="shiftImportResult" style="margin-top: 16px;">
        <el-alert
          :type="shiftImportResult.failed === 0 ? 'success' : 'warning'"
          :title="`共 ${shiftImportResult.total} 筆，成功 ${shiftImportResult.saved} 筆，失敗 ${shiftImportResult.failed} 筆`"
          :closable="false"
        />
        <div v-if="shiftImportResult.errors?.length" style="margin-top: 8px; max-height: 150px; overflow-y: auto;">
          <div v-for="(err, i) in shiftImportResult.errors" :key="i" style="color: #f56c6c; font-size: 13px;">{{ err }}</div>
        </div>
      </div>
      <template #footer>
        <el-button @click="shiftImportVisible = false">關閉</el-button>
      </template>
    </el-dialog>

    <!-- Daily Shift Dialog -->
    <el-dialog
      v-model="dailyDialogVisible"
      title="每日排班調整 (調班/換班)"
      width="600px"
    >
      <div v-if="currentEmployee">
        <p class="mb-4">
          員工：<strong>{{ currentEmployee.name }}</strong> |
          本週預設：{{ getShiftInfo(getAssignment(currentEmployee.id))?.name || '無' }}
        </p>

        <el-table :data="currentWeekDates.map(d => ({ date: d }))" border stripe>
          <el-table-column label="日期" width="120">
            <template #default="{ row }">
              {{ row.date }} ({{ getDayName(row.date) }})
            </template>
          </el-table-column>
          <el-table-column label="請假" width="150">
            <template #default="{ row }">
              <template v-if="currentEmployee && empLeavesOnDate(currentEmployee.id, row.date).length">
                <div
                  v-for="e in empLeavesOnDate(currentEmployee.id, row.date)"
                  :key="e.lv.id"
                  class="dlg-leave"
                  :class="{ pending: e.lv.status === 'pending' }"
                >
                  {{ e.lv.leave_type_label }} {{ windowLabel(e.window) }}<span v-if="e.lv.status === 'pending'">（待審）</span>
                </div>
              </template>
              <span v-else class="text-muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="當日安排">
            <template #default="{ row }">
              <el-select
                :model-value="getDailySelectValue(row.date)"
                @update:model-value="(val) => handleDailyShiftChange(row.date, val)"
                placeholder="繼承週排班"
                clearable
                style="width: 100%"
              >
                <el-option
                  v-for="st in shiftTypes"
                  :key="st.id"
                  :label="st.name"
                  :value="st.id"
                />
                <el-option
                  :value="DAY_OFF_VALUE"
                  label="休假（明確不上班）"
                  class="day-off-option"
                />
              </el-select>
            </template>
          </el-table-column>
        </el-table>
        <div class="mt-4 text-gray-500 text-sm">
          * 三種狀態：留空＝繼承「週排班」；選班別＝該日指定班；「休假」＝該日明確不上班（不再回落週排班）。清除選擇即恢復繼承。
        </div>
      </div>
    </el-dialog>
  </div>
</template>


<style scoped>
.control-panel {
  margin-bottom: 4px;
}
.controls {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}
.week-label {
  font-size: var(--text-lg);
  font-weight: bold;
  color: var(--text-primary);
}
.spacer {
  flex: 1;
}
.text-muted {
  color: var(--neutral-300);
}
.mb-4 {
  margin-bottom: var(--space-4);
}
.mt-4 {
  margin-top: var(--space-4);
}
.text-gray-500 {
  color: var(--text-secondary);
}
.text-sm {
  font-size: var(--text-base);
}
/* 手機卡片內的班別下拉：撐滿可用寬度，避免在窄卡片被壓成細長條 */
.card-shift-select {
  width: 100%;
  min-width: 160px;
}

/* 本週請假與空班概覽 */
.week-leave-strip {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--space-2);
  margin-top: 12px;
}
.week-leave-strip.mobile {
  grid-template-columns: 1fr;
}
.day-card {
  border: 1px solid var(--el-border-color, #e4e7ed);
  border-radius: 8px;
  padding: var(--space-2);
  font-size: 12px;
  min-width: 0;
}
.day-card.has-gap {
  border-color: var(--el-color-danger, #f56c6c);
}
.day-head {
  font-weight: bold;
  margin-bottom: 4px;
  color: var(--text-primary);
}
.gap-alert {
  border-radius: 4px;
  padding: 2px 6px;
  margin-bottom: 4px;
  font-weight: bold;
}
.gap-alert.empty {
  color: var(--el-color-danger, #f56c6c);
  background: var(--el-color-danger-light-9, rgba(245, 108, 108, 0.12));
}
.gap-alert.risk {
  color: var(--el-color-warning, #e6a23c);
  background: var(--el-color-warning-light-9, rgba(230, 162, 60, 0.12));
}
.leave-entry {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  margin-bottom: 2px;
}
.leave-entry.pending {
  opacity: 0.75;
}
.leave-window,
.leave-type {
  color: var(--text-secondary);
}
.leave-none {
  color: var(--neutral-300);
}
.row-leave-tag {
  margin-left: 4px;
}
.dlg-leave {
  font-size: 12px;
  color: var(--el-color-danger, #f56c6c);
}
.dlg-leave.pending {
  color: var(--el-color-warning, #e6a23c);
}
</style>
