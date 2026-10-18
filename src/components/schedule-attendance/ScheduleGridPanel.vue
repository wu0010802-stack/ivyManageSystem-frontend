<template>
  <div class="schedule-grid-panel">
    <GridToolbar
      ref="toolbarRef"
      :week-start="weekStart"
      :filter="filter"
      :keyword="keyword"
      :can-edit-plan="caller.can_edit_plan"
      :pending-count="state.pendingCount.value"
      :saving="state.saving.value"
      :busy="busy || state.loading.value"
      :issue-count="issueCount"
      :view="isMonth ? 'month' : 'week'"
      :date="date"
      :can-month="!isMobile && !!month"
      @update:view="(v: GridView) => emit('update:view', v)"
      @update:date="(v: string) => emit('update:date', v)"
      @update:week-start="(v: string) => emit('update:date', v)"
      @update:filter="(v: GridFilter) => emit('update:filter', v)"
      @update:keyword="(v: string) => (keyword = v)"
      @copy-prev-week="copyPrevWeek"
      @command="onCommand"
      @save="save"
    />

    <el-alert
      v-if="state.warnings.value.length"
      type="warning"
      title="週工時超上限預警"
      data-test="weekly-warnings"
      class="schedule-grid-panel__alert"
      @close="state.warnings.value = []"
    >
      <div v-for="w in state.warnings.value" :key="w.employee_id">{{ w.message }}</div>
    </el-alert>

    <template v-if="isMonth">
      <div v-if="monthError" class="schedule-grid-panel__status" role="alert" data-test="month-load-error">
        <p>這個月的班表與打卡載入失敗。</p>
        <el-button @click="reloadMonth">重新載入</el-button>
      </div>
      <p v-else-if="monthLoading && !monthData" role="status">正在載入整月班表與打卡…</p>
      <MonthGrid
        v-if="monthData"
        :groups="monthData.groups"
        :employees="monthData.employees"
        :days="monthDays"
        :cells="monthCells"
        :today="monthData.today"
        :filter="filter"
        :keyword="keyword"
        :max-height="gridMaxHeight"
        :person-notes="personNotes"
        @select="openMonthCell"
        @open-week="openWeek"
      />
    </template>
    <template v-else>
      <div v-if="state.loadError.value" class="schedule-grid-panel__status" role="alert">
        <p>這一週的班表與打卡載入失敗。</p>
        <el-button @click="state.reload()">重新載入</el-button>
      </div>
      <p v-else-if="state.loading.value && !gridData" role="status">正在載入班表與打卡…</p>

      <ShiftGrid
        v-if="gridData"
        :groups="gridData.groups"
        :employees="gridData.employees"
        :days="days"
        :cells="state.cells.value"
        :today="gridData.today"
        :filter="filter"
        :keyword="keyword"
        :can-edit-plan="caller.can_edit_plan"
        :shift-options="gridData?.shift_types ?? []"
        :weekly-value="state.weeklyValue"
        :changed-ids="changedIds"
        :coverage="coverage"
        :mobile="isMobile"
        :can-import="caller.can_edit_attendance"
        :max-height="gridMaxHeight"
        :person-notes="personNotes"
        @select="openCell"
        @weekly-change="state.setWeekly"
        @import-punches="(date: string) => emit('import-punches', date)"
      />
    </template>

    <PersonDayDrawer
      v-if="drawerGrid"
      ref="drawerRef"
      v-model="drawerOpen"
      :cell="selectedCell"
      :employee="selectedEmployee"
      :day="selectedDay"
      :group-label="selectedGroupLabel"
      :shift-types="drawerGrid.shift_types"
      :same-day-cells="sameDayCells"
      :employee-names="employeeNames"
      :weekly-shift-id="drawerWeeklyShiftId"
      :today="drawerGrid.today"
      :caller="drawerGrid.caller"
      :mobile="isMobile"
      :nav="drawerNav"
      @navigate="onNavigate"
      @changed="onChanged"
      @records="onRecords"
      @import="(ctx: ImportContext) => emit('import', ctx)"
    />

    <BatchConfirmDialog
      v-model="batchOpen"
      :units="batchUnits"
      :employee-names="employeeNames"
      :shift-names="shiftNames"
      @done="onChanged"
    />

    <FormDialog
      v-model="copyWeekOpen"
      title="複製指定週排班"
      submit-text="複製到本週"
      :disabled="!copySource"
      @submit="copySpecificWeek"
    >
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="來源週（選該週任一天）">
          <el-date-picker v-model="copySource" type="date" format="YYYY-MM-DD" value-format="YYYY-MM-DD" style="width: 100%" data-test="copy-week-source" />
        </el-form-item>
      </el-form>
    </FormDialog>

    <el-dialog v-model="importOpen" title="匯入班表" class="schedule-grid-panel__import" append-to-body>
      <p class="schedule-grid-panel__hint">上傳 Excel 檔，格式：員工編號｜員工姓名｜班別名稱。匯入後會覆蓋 {{ weekStart }} 這週的週排班；已有打卡的週會逐列回報錯誤。</p>
      <el-upload drag :auto-upload="false" :on-change="onImportFile" accept=".xlsx" :show-file-list="false" :disabled="importing">
        <div class="schedule-grid-panel__drop">拖曳或點擊上傳 .xlsx 檔案</div>
      </el-upload>
      <p v-if="importing" role="status">匯入中…</p>
      <template v-if="importResult">
        <el-alert
          :type="importResult.failed === 0 ? 'success' : 'warning'"
          :title="`共 ${importResult.total} 筆，成功 ${importResult.saved} 筆，失敗 ${importResult.failed} 筆`"
          :closable="false"
        />
        <ul v-if="importResult.errors?.length" class="schedule-grid-panel__errors">
          <li v-for="(err, i) in importResult.errors" :key="i">{{ err }}</li>
        </ul>
      </template>
      <template #footer><el-button @click="importOpen = false">關閉</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { confirmDiscardChanges, useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import FormDialog from '@/components/common/FormDialog.vue'
import GridToolbar, { type ToolbarCommand } from './GridToolbar.vue'
import ShiftGrid from './ShiftGrid.vue'
import MonthGrid from './MonthGrid.vue'
import PersonDayDrawer from './PersonDayDrawer.vue'
import BatchConfirmDialog from './BatchConfirmDialog.vue'
import { useScheduleGrid } from '@/composables/useScheduleGrid'
import { attendanceRouteProps } from '@/router/attendanceRouteProps'
import { useIsMobile } from '@/composables/useIsMobile'
import type { MonthGridState } from '@/composables/useMonthGrid'
import { copyMonthAssignments, getAssignments, importShifts } from '@/api/shifts'
import type { ApiResponse } from '@/api/_generated/typed'
import { downloadFile } from '@/utils/download'
import { apiError } from '@/utils/error'
import { computeWeekCoverage } from '@/utils/scheduleCoverage'
import { patternSummary, patternTag } from '@/utils/attendancePatterns'
import {
  addDaysISO,
  cellKey,
  coverageInputs,
  gridSections,
  isIssue,
  mondayOf,
  uncoveredDates,
  visibleDays,
  type BatchUnit,
  type GridCell,
  type GridFilter,
  type GridOut,
  type GridView,
} from '@/utils/scheduleAttendanceGrid'

type ImportResult = ApiResponse<'/shifts/import', 'post'>
type ImportContext = { employee_id: number; employee_name: string; date: string }

const props = defineProps<{
  /** 錨點日期（YYYY-MM-DD）；週模式顯示它所在的週 */
  date: string
  filter: GridFilter
  /** 深連結：開頁即開這個人這天的抽屜 */
  focusEmployeeId?: number | null
  focusDate?: string | null
  /** 格子以外的異動（明細處理異常、匯入打卡、套用輪值表）遞增；變動即重新載入 */
  revision?: number
  /** 週（預設）／月；月模式唯讀，由頁面依網址與裝置決定 */
  view?: GridView
  /** 頁面建立的整月格子資料（與本月進度共用，D-06） */
  month?: MonthGridState
}>()
const emit = defineEmits<{
  'update:date': [value: string]
  'update:filter': [value: GridFilter]
  records: [employeeId: number, date: string]
  import: [context: ImportContext]
  /** 整週都還沒匯入時的空狀態入口：開整月匯入（不帶人員） */
  'import-punches': [date: string]
  changed: []
  /** 週／月切換；帶 date＝切到該週（月格子週次欄頭） */
  'update:view': [view: GridView, date?: string]
}>()

const { isMobile } = useIsMobile()
/** 人員搜尋（姓名或工號）：只在本面板內，不進網址 */
const keyword = ref('')
const weekStartRef = ref(mondayOf(props.date))
watch(() => props.date, (d) => { weekStartRef.value = mondayOf(d) })
const weekStart = computed(() => weekStartRef.value)
const state = useScheduleGrid(weekStartRef)
onMounted(() => { void state.reload() })
watch(() => props.revision, () => { void state.reload() })

// ── 未儲存的週班別 ───────────────────────────────────────────────
// 換週會清掉緩衝（useScheduleGrid），所以任何換週的入口都要先問：頁內入口（上週／下週／日期／換月）
// 由頁面在改錨點前呼叫 confirmWeekChange；網址被外部改到別週走 onBeforeRouteUpdate；
// 離開頁面與關分頁走 useUnsavedChangesGuard。頁籤切換不換週（v-show 保留緩衝），不必問。
const changedIds = computed(() => new Set(state.changedEmployeeIds.value))
const hasPendingEdits = () => state.pendingCount.value > 0
useUnsavedChangesGuard(hasPendingEdits)

async function confirmWeekChange(date: string, opts: { routeGuard?: boolean } = {}): Promise<boolean> {
  if (mondayOf(date) === weekStartRef.value) return true
  if (state.saving.value) {
    // 儲存途中換週會讓儲存半途取消（部分送出），不能用「捨棄變更」帶過
    ElMessage.warning('排班儲存中，請等儲存完成再換週')
    return false
  }
  if (!hasPendingEdits()) return true
  const ok = await confirmDiscardChanges({
    title: '未儲存的排班',
    message: `這週有 ${state.pendingCount.value} 處排班變更還沒儲存，切換週次會捨棄這些變更。`,
    cancelText: '留在這週',
    routeGuard: opts.routeGuard,
  })
  if (ok) state.discardEdits()
  return ok
}

// 與頁面 props 同一套解析（重複參數取第一個、格式不對＝undefined），否則守衛與實際換不換週會不一致
onBeforeRouteUpdate((to) => {
  const date = attendanceRouteProps(to.query).date
  return date ? confirmWeekChange(date, { routeGuard: true }) : true
})

defineExpose({ confirmWeekChange })

// ── 表格捲動容器高度 ─────────────────────────────────────────────
// 工具列在桌機固定於捲動區頂端；它會依寬度換成 1–3 行。表格高度＝捲動區可視高度－工具列實際高度，
// 寫死估算值時工具列一換行，表格固定的日期表頭就會疊到工具列上、蓋住「儲存排班」。
const toolbarRef = ref<InstanceType<typeof GridToolbar> | null>(null)
const gridMaxHeight = ref<number | null>(null)
const GRID_BOTTOM_GAP = 8
const GRID_MIN_HEIGHT = 320
let resizeObserver: ResizeObserver | null = null
function measureGrid(): void {
  const toolbar = toolbarRef.value?.$el as HTMLElement | undefined
  const main = toolbar?.closest('.el-main') as HTMLElement | null | undefined
  if (!toolbar || !main || !main.clientHeight) return
  gridMaxHeight.value = Math.max(GRID_MIN_HEIGHT, main.clientHeight - toolbar.offsetHeight - GRID_BOTTOM_GAP)
}
onMounted(() => {
  const toolbar = toolbarRef.value?.$el as HTMLElement | undefined
  const main = toolbar?.closest('.el-main')
  if (!toolbar || !main || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(measureGrid)
  resizeObserver.observe(toolbar)
  resizeObserver.observe(main)
})
onBeforeUnmount(() => resizeObserver?.disconnect())

const NO_CALLER: GridOut['caller'] = { can_view_attendance: false, can_edit_plan: false, can_confirm: false, can_edit_attendance: false }
const gridData = computed(() => state.grid.value)
const caller = computed(() => gridData.value?.caller ?? NO_CALLER)
const days = computed(() => (gridData.value ? visibleDays(gridData.value.days, gridData.value.cells, gridData.value.caller.can_edit_plan) : []))
// 月模式的抽屜（疑似換班對象的姓名）取整月人員；週資料的人員一併保留（儲存結果的提示仍是週資料）
const employeeNames = computed<Record<number, string>>(() =>
  Object.fromEntries([...(gridData.value?.employees ?? []), ...(monthData.value?.employees ?? [])].map((e) => [e.employee_id, e.name])),
)
const shiftNames = computed<Record<number, string>>(() =>
  Object.fromEntries((gridData.value?.shift_types ?? []).map((s) => [s.shift_type_id, s.name])),
)
const isMonth = computed(() => props.view === 'month' && !!props.month)
const monthData = computed(() => (isMonth.value ? props.month!.data.value : null))
const issueCount = computed(() => {
  const g = isMonth.value ? monthData.value : gridData.value
  if (!g) return 0
  const uncovered = uncoveredDates(g.days)
  return g.cells.filter((c) => isIssue(c, g.today, uncovered)).length
})
/** 本月型態（整月資料算的）：人員欄註記，週、月格子共用 */
const personNotes = computed<Record<number, { tag: string; detail: string }>>(() =>
  Object.fromEntries((props.month?.patterns.value ?? []).map((p) => [p.employeeId, { tag: patternTag(p), detail: patternSummary(p) }])),
)
const EMPTY_CELLS: Map<string, GridCell> = new Map()
const monthLoading = computed(() => (isMonth.value ? props.month!.loading.value : false))
const monthError = computed(() => (isMonth.value ? props.month!.loadError.value : ''))
const monthCells = computed(() => (isMonth.value ? props.month!.cells.value : EMPTY_CELLS))
/** 月格子欄：平日＋有人上班的週末（SPEC-027 §2「當月平日欄」） */
const monthDays = computed(() => (monthData.value ? visibleDays(monthData.value.days, monthData.value.cells) : []))
function reloadMonth(): void {
  void props.month?.reload()
}
/**
 * 週次欄頭切回週模式：跨月週的週一在上個月（10 月第一週的週一是 9/28），錨點若設成週一，
 * 頁首年月、本月進度、出勤明細與匯出都會跳到上個月。錨點改用該週在本月的第一天；
 * 週模式以 mondayOf(錨點) 顯示，仍是整個 9/28–10/4 那週。
 */
function openWeek(monday: string): void {
  const monthStart = props.month?.range.value.start
  emit('update:view', 'week', monthStart && monday < monthStart ? monthStart : monday)
}
const coverage = computed(() => {
  const g = gridData.value
  if (!g) return []
  const weekly = Object.fromEntries(g.employees.map((e) => [e.employee_id, state.weeklyValue(e.employee_id)]))
  // 沒有 SCHEDULE 就不會載入週排班：改由每格計畫推算（來源為週排班／輪值表的格子）
  return computeWeekCoverage({ dates: state.weekDates.value, ...coverageInputs(g, weekly, { fromPlan: !g.caller.can_edit_plan }) })
})

// ── 抽屜 ───────────────────────────────────────────────────────
const drawerOpen = ref(false)
const selected = ref<{ employeeId: number; date: string } | null>(null)
// 月模式點格用整月資料（D-06：唯讀總覽，抽屜內動作照舊）；週模式用該週資料
const drawerGrid = computed(() => (isMonth.value ? monthData.value : gridData.value))
const drawerCells = computed(() => (isMonth.value ? monthCells.value : state.cells.value))
const selectedCell = computed(() => (selected.value ? drawerCells.value.get(cellKey(selected.value.employeeId, selected.value.date)) ?? null : null))
const selectedEmployee = computed(() => drawerGrid.value?.employees.find((e) => e.employee_id === selected.value?.employeeId) ?? null)
const selectedDay = computed(() => drawerGrid.value?.days.find((d) => d.date === selected.value?.date) ?? null)
const selectedGroupLabel = computed(() => drawerGrid.value?.groups.find((g) => g.key === selectedEmployee.value?.group_key)?.label ?? '')
const sameDayCells = computed(() => (drawerGrid.value?.cells ?? []).filter((c) => c.date === selected.value?.date))

function openCell(employeeId: number, date: string): void {
  pendingAdvance = null
  selected.value = { employeeId, date }
  drawerOpen.value = true
}

// ── 抽屜的待處理佇列：上一筆／下一筆、處理完自動跳下一筆 ─────────────────
/** 畫面上看得到的格子，順序與格子相同：列（班級分組、篩選與搜尋後）由上而下，每人由左而右 */
const navOrder = computed<GridCell[]>(() => {
  const g = drawerGrid.value
  if (!g) return []
  const navDays = isMonth.value ? monthDays.value : days.value
  const cells = drawerCells.value
  const sections = gridSections({ groups: g.groups, employees: g.employees, days: navDays, cells, filter: props.filter, today: g.today, keyword: keyword.value, uncovered: uncoveredDates(g.days) })
  return sections
    .flatMap((section) => section.employees)
    .flatMap((emp) => navDays.map((d) => cells.get(cellKey(emp.employee_id, d.date))).filter((c): c is GridCell => c !== undefined))
})
const issueKeys = computed<string[]>(() => {
  const g = drawerGrid.value
  if (!g) return []
  const uncovered = uncoveredDates(g.days)
  return navOrder.value.filter((c) => isIssue(c, g.today, uncovered)).map((c) => cellKey(c.employee_id, c.date))
})
/** 目前這格在佇列裡的位置：前後的待處理（不在畫面上的格子＝從頭開始） */
const navState = computed(() => {
  const sel = selected.value
  if (!sel || !drawerGrid.value) return null
  const key = cellKey(sel.employeeId, sel.date)
  const issues = new Set(issueKeys.value)
  const keys = navOrder.value.map((c) => cellKey(c.employee_id, c.date))
  const index = keys.indexOf(key)
  const before = index >= 0 ? keys.slice(0, index).filter((k) => issues.has(k)) : []
  const after = index >= 0 ? keys.slice(index + 1).filter((k) => issues.has(k)) : issueKeys.value.filter((k) => k !== key)
  const position = issueKeys.value.indexOf(key)
  return { key, before, after, position: position >= 0 ? position + 1 : null }
})
const drawerNav = computed(() => {
  const n = navState.value
  if (!n) return null
  return { position: n.position, total: issueKeys.value.length, hasPrev: n.before.length > 0, hasNext: n.after.length > 0 }
})

function selectKey(key: string): void {
  const [employeeId, date] = key.split('|')
  if (isMonth.value) void openMonthCell(Number(employeeId), date)
  else openCell(Number(employeeId), date)
}
function onNavigate(direction: 1 | -1): void {
  const n = navState.value
  const target = direction === 1 ? n?.after[0] : n?.before[n.before.length - 1]
  if (target) selectKey(target)
}

/**
 * 處理完自動跳下一筆：送出前記下這格與它後面的待處理，重抓後這格不再是待處理就跳到後面第一筆
 * 還沒處理的（到底了就回到最前面）。月模式要等整月資料重抓（頁面遞增 revision）才看得到結果，
 * 所以等「這格的新資料」到了才判斷，不在 onChanged 裡直接判斷。
 */
let pendingAdvance: { key: string; after: string[] } | null = null
watch(drawerOpen, (open) => { if (!open) pendingAdvance = null })
watch(() => (selected.value ? drawerCells.value.get(cellKey(selected.value.employeeId, selected.value.date)) : undefined), (cell) => {
  const pending = pendingAdvance
  const g = drawerGrid.value
  if (!pending || !cell || !g || cellKey(cell.employee_id, cell.date) !== pending.key) return
  pendingAdvance = null
  if (isIssue(cell, g.today, uncoveredDates(g.days))) return
  const remaining = new Set(issueKeys.value)
  const target = pending.after.find((k) => remaining.has(k)) ?? issueKeys.value.find((k) => k !== pending.key) ?? null
  if (!target) {
    ElMessage.success(isMonth.value ? '這個月的待處理都處理完了' : '這週的待處理都處理完了')
    return
  }
  selectKey(target)
  const [employeeId, date] = target.split('|')
  const [, m, d] = date.split('-').map(Number)
  ElMessage.success(`已處理。下一筆待處理：${employeeNames.value[Number(employeeId)] ?? ''} ${m}/${d}`)
})

/**
 * 月模式點的格子多半不在目前這週：抽屜「來源」的週排班層與「不另外調整」的說明要用該格那週的週排班，
 * 所以點格時補抓那一週（沒有排班權限就不抓，抽屜會以格子計畫推算）。
 */
const monthWeekly = ref<number | null>(null)
let monthWeeklySeq = 0
async function openMonthCell(employeeId: number, date: string): Promise<void> {
  openCell(employeeId, date)
  monthWeekly.value = null
  // 深連結開頁時週資料常比整月資料先回來（7 天 vs 31 天）：整月資料還沒到就用週資料的權限判斷（同一位呼叫者）
  if (!(monthData.value ?? gridData.value)?.caller.can_edit_plan) return
  const current = ++monthWeeklySeq
  try {
    const rows = (await getAssignments({ week_start: mondayOf(date) })).data
    if (current === monthWeeklySeq) monthWeekly.value = rows.find((r) => r.employee_id === employeeId)?.shift_type_id ?? null
  } catch {
    // 讀不到週排班：抽屜退回以格子計畫推算週排班層
  }
}
const drawerWeeklyShiftId = computed(() => {
  if (!selected.value) return null
  return isMonth.value ? monthWeekly.value : state.assignments.value[selected.value.employeeId]?.shift_type_id ?? null
})

let focusHandled = false
watch(gridData, (g) => {
  if (focusHandled || !g || !props.focusEmployeeId || !props.focusDate) return
  if (state.cells.value.has(cellKey(props.focusEmployeeId, props.focusDate))) {
    focusHandled = true
    // 月模式的抽屜也要該格那週的週排班（來源層與說明），走點格同一條路徑
    if (isMonth.value) void openMonthCell(props.focusEmployeeId, props.focusDate)
    else openCell(props.focusEmployeeId, props.focusDate)
  }
})

/**
 * 「看他整月」：抽屜是 append-to-body，不先關會蓋住切換後的出勤明細頁籤。匯入則不關（對話框疊在抽屜上）。
 * 程式關閉不經 el-drawer 的 before-close，先問抽屜有沒有打到一半的原因。
 */
const drawerRef = ref<InstanceType<typeof PersonDayDrawer> | null>(null)
async function onRecords(employeeId: number, date: string): Promise<void> {
  if (drawerRef.value && !(await drawerRef.value.requestClose())) return
  drawerOpen.value = false
  emit('records', employeeId, date)
}

async function onChanged(): Promise<void> {
  const n = navState.value
  pendingAdvance = drawerOpen.value && n && n.position !== null ? { key: n.key, after: n.after } : null
  await state.reload()
  emit('changed')
}

// ── 排班工具 ─────────────────────────────────────────────────────
const busy = ref(false)
const copyWeekOpen = ref(false)
const copySource = ref<string | null>(null)

async function copyPrevWeek(): Promise<void> {
  await copyFrom(addDaysISO(weekStart.value, -7), '上週')
}

async function copySpecificWeek(): Promise<void> {
  if (!copySource.value) return
  copyWeekOpen.value = false
  await copyFrom(mondayOf(copySource.value), '該週')
}

async function copyFrom(source: string, label: string): Promise<void> {
  busy.value = true
  try {
    const copied = await state.copyFromWeek(source)
    if (copied === 0) ElMessage.warning(`${label}沒有可複製的週排班`)
    else ElMessage.success(`已帶入 ${copied} 人的${label}排班，確認後按「儲存排班」`)
  } catch (err) {
    ElMessage.error(apiError(err, '讀取來源週排班失敗'))
  } finally {
    busy.value = false
  }
}

async function copyPrevMonth(): Promise<void> {
  const [ty, tm] = props.date.split('-').map(Number)
  const sy = tm === 1 ? ty - 1 : ty
  const sm = tm === 1 ? 12 : tm - 1
  const payload = { source_year: sy, source_month: sm, target_year: ty, target_month: tm, mode: 'overwrite' as const }
  busy.value = true
  try {
    const p = (await copyMonthAssignments({ ...payload, dry_run: true })).data
    if (p.blocked.length) {
      ElMessage.error(`無法複製，以下月份或週次受限：${p.blocked.join('、')}`)
      return
    }
    if (p.created + p.updated === 0) {
      ElMessage.warning('來源月沒有可複製的週排班')
      return
    }
    try {
      await ElMessageBox.confirm(
        `將 ${sy}年${sm}月 排班複製到 ${ty}年${tm}月（配對 ${p.weeks_paired} 週）：新增 ${p.created} 筆、覆蓋 ${p.updated} 筆。每日調整不受影響。`,
        '複製上月整月',
        { confirmButtonText: '確認複製', cancelButtonText: '取消', type: 'warning' },
      )
    } catch {
      return
    }
    const res = await copyMonthAssignments({ ...payload, dry_run: false })
    ElMessage.success(`已複製：新增 ${res.data.created} 筆、覆蓋 ${res.data.updated} 筆`)
    await onChanged()
  } catch (err) {
    ElMessage.error(apiError(err, '整月複製排班失敗'))
  } finally {
    busy.value = false
  }
}

const importOpen = ref(false)
const importing = ref(false)
const importResult = ref<ImportResult | null>(null)

async function onImportFile(file: { raw?: File }): Promise<void> {
  if (!file.raw) return
  const form = new FormData()
  form.append('file', file.raw)
  importing.value = true
  importResult.value = null
  try {
    const res = await importShifts(form, weekStart.value)
    importResult.value = res.data
    if (res.data.failed === 0) ElMessage.success(`匯入完成，共 ${res.data.saved} 筆排班`)
    else ElMessage.warning(`匯入完成，成功 ${res.data.saved} 筆，失敗 ${res.data.failed} 筆`)
    await onChanged()
  } catch (err) {
    ElMessage.error(apiError(err, '匯入失敗'))
  } finally {
    importing.value = false
  }
}

function onCommand(command: ToolbarCommand): void {
  if (command === 'copy-week') {
    copySource.value = null
    copyWeekOpen.value = true
  } else if (command === 'copy-prev-month') {
    void copyPrevMonth()
  } else if (command === 'import') {
    importResult.value = null
    importOpen.value = true
  } else if (command === 'template') {
    void downloadFile('/shifts/import-template', '排班匯入範本.xlsx')
  } else if (command === 'export') {
    void downloadFile('/exports/shifts', `排班表_${weekStart.value}.xlsx`, { week_start: weekStart.value })
  }
}

// ── 儲存（含整週拆分與批次確認）────────────────────────────────────
const batchOpen = ref(false)
const batchUnits = ref<BatchUnit[]>([])

async function save(): Promise<void> {
  try {
    const startWeek = weekStartRef.value
    const outcome = await state.save()
    if (weekStartRef.value !== startWeek) {
      // 儲存途中換了週：舊週的結果不得顯示在新週（批次確認會開到錯的週）
      if (outcome.errors.length) ElMessage.error(outcome.errors.join('；'))
      emit('changed')
      return
    }
    const notes: string[] = []
    if (outcome.weeklySaved) notes.push(`已儲存 ${outcome.weeklySaved} 人的週排班`)
    if (outcome.dailySaved) notes.push(`未打卡的 ${outcome.dailySaved} 天改為每日調整`)
    if (notes.length) ElMessage.success(notes.join('，'))
    if (outcome.blocked.length) {
      const text = outcome.blocked
        .map((b) => `${employeeNames.value[b.employeeId] ?? b.employeeId}：${b.dates.join('、') || '整週'}`)
        .join('；')
      ElMessage.warning(`以下已打卡的日子沒有變更（本人、已封存、沒有權限或要清除週排班）：${text}`)
    }
    if (outcome.errors.length) ElMessage.error(outcome.errors.join('；'))
    if (outcome.units.length) {
      batchUnits.value = outcome.units
      batchOpen.value = true
    }
    emit('changed')
  } catch (err) {
    ElMessage.error(apiError(err, '儲存排班失敗'))
  }
}
</script>

<style scoped>
.schedule-grid-panel__alert { margin-bottom: var(--space-3); }
.schedule-grid-panel__status { display: grid; justify-items: center; gap: var(--space-3); padding: var(--space-6); border: 1px solid var(--el-border-color-light); border-radius: var(--radius-md); }
.schedule-grid-panel__hint { margin: 0 0 var(--space-3); color: var(--el-text-color-secondary); font-size: var(--text-sm); }
.schedule-grid-panel__drop { padding: var(--space-5) 0; }
.schedule-grid-panel__errors { margin: var(--space-2) 0 0; padding-left: var(--space-4); color: var(--el-color-danger); font-size: var(--text-sm); max-height: 150px; overflow-y: auto; }
</style>
