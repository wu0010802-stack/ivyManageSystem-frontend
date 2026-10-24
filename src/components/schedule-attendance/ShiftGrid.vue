<template>
  <div class="shift-grid" :class="{ 'shift-grid--mobile': mobile }">
    <!-- mode：核對（打卡＋判定）／排班（只有計畫與假別，可改本週班別、看空班警示） -->
    <div v-if="!visibleRows.length" class="shift-grid__empty" role="status">
      <p>{{ emptyText }}</p>
      <el-button v-if="showImportHint && canImport" type="primary" data-test="grid-empty-import" @click="emit('import-punches', missingImportDates[0])">匯入打卡紀錄</el-button>
    </div>

    <!-- 桌機：列＝人（依班級分組），欄＝日；核對每格兩行：計畫／打卡＋判定，排班每格只有計畫與假別。
         限高的捲動容器讓日期表頭與人員欄在捲動時固定（外層 el-main 捲動時 sticky 不會作用在表格上） -->
    <div v-else-if="!mobile" class="shift-grid__scroller" :style="maxHeight ? { maxHeight: `${maxHeight}px` } : undefined">
    <table class="shift-grid__table" data-test="shift-grid-table" @keydown="onGridKeydown">
      <caption class="shift-grid__caption">{{ caption }}</caption>
      <thead>
        <tr>
          <th scope="col" class="shift-grid__corner">人員</th>
          <th v-for="d in shownDays" :key="d.date" scope="col" class="shift-grid__day" :class="{ 'shift-grid__day--off': !d.is_workday, 'shift-grid__day--today': d.date === today }" :data-test="`day-${d.date}`">
            <span class="shift-grid__date">{{ dayLabel(d) }}<span v-if="d.date === today" class="shift-grid__today">今天</span></span>
            <!-- 假日名可能很長（「中華民國開國紀念日補假」）：外層不計入欄的內容寬，tag 最寬到欄寬、超出省略，外層 title 看全名
                 （title 放外層：el-tag 根是 transition，屬性落點隨環境不同） -->
            <span v-if="d.is_holiday" class="shift-grid__holiday" :title="d.holiday_name || '假日'"><el-tag size="small" type="info">{{ d.holiday_name || '假日' }}</el-tag></span>
            <el-tag v-else-if="d.is_makeup_workday" size="small" type="warning">補班</el-tag>
            <el-tag v-if="d.is_workday && d.import_covered === false && d.date < today" size="small" type="info" :data-test="`not-imported-${d.date}`">未匯入</el-tag>
            <span
              v-for="gap in gapsOf(d.date)"
              :key="gap.shiftTypeId"
              class="shift-grid__gap"
              :class="d.date < today ? 'shift-grid__gap--past' : `shift-grid__gap--${gap.severity}`"
              :data-test="`gap-${d.date}`"
            >{{ gap.shiftTypeName }}{{ gap.severity === 'empty' ? '無人上班' : '待審通過將無人' }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="section in sections" :key="section.group.key">
          <tr class="shift-grid__group">
            <th :colspan="shownDays.length + 1" scope="colgroup"><span class="shift-grid__group-label">{{ section.group.label }}</span></th>
          </tr>
          <tr v-for="emp in section.employees" :key="emp.employee_id" :data-test="`row-${emp.employee_id}`">
            <th scope="row" class="shift-grid__person">
              <span class="shift-grid__who">
                <span class="shift-grid__name">{{ emp.name }}</span>
                <span v-if="emp.role_label" class="shift-grid__role">{{ emp.role_label }}</span>
                <button
                  v-if="noteOf(emp.employee_id)"
                  type="button"
                  class="shift-grid__note"
                  :title="noteOf(emp.employee_id)!.detail"
                  :aria-label="`${emp.name}：${noteOf(emp.employee_id)!.tag}，${noteOf(emp.employee_id)!.detail}。開本月設定檢查`"
                  :data-test="`person-note-${emp.employee_id}`"
                  @click="emit('show-patterns')"
                >{{ noteOf(emp.employee_id)!.tag }}</button>
              </span>
              <el-select
                v-if="mode === 'plan' && canEditPlan"
                :model-value="weeklyValue(emp.employee_id) ?? undefined"
                size="small"
                clearable
                placeholder="本週班別"
                :aria-label="`${emp.name} 本週班別`"
                class="shift-grid__weekly"
                :data-test="`weekly-${emp.employee_id}`"
                @update:model-value="(v: number | undefined) => emit('weekly-change', emp.employee_id, v ?? null)"
              >
                <el-option v-for="s in optionsFor(emp.employee_id)" :key="s.shift_type_id" :value="s.shift_type_id" :disabled="!s.is_active" :label="`${s.name} ${s.work_start}–${s.work_end}${s.is_active ? '' : '（已停用）'}`" />
              </el-select>
              <span v-if="mode === 'plan' && changedIds?.has(emp.employee_id)" class="shift-grid__unsaved" :data-test="`unsaved-${emp.employee_id}`">未儲存</span>
            </th>
            <td v-for="(d, col) in shownDays" :key="d.date" class="shift-grid__cell-wrap" :class="{ 'shift-grid__cell-wrap--off': !d.is_workday }">
              <button
                v-if="cellOf(emp.employee_id, d.date)"
                type="button"
                class="shift-grid__cell"
                :class="cellClasses(emp.employee_id, d.date)"
                :disabled="!cellOf(emp.employee_id, d.date)!.employed"
                :aria-label="cellAria(emp, d)"
                :data-row="rowIndex.get(emp.employee_id)"
                :data-col="col"
                :data-test="`cell-${emp.employee_id}-${d.date}`"
                @click="emit('select', emp.employee_id, d.date)"
              >
                <!-- 非應出勤日只畫一槓：欄頭已標週末／假日，五個字會把收窄的週末欄撐成兩行（報讀仍念全文） -->
                <span v-if="isRest(emp.employee_id, d.date)" class="shift-grid__rest" aria-hidden="true" :title="display(emp.employee_id, d.date).plan">—</span>
                <span v-else class="shift-grid__plan">
                  <span v-if="display(emp.employee_id, d.date).source" class="shift-grid__source" :title="display(emp.employee_id, d.date).source!.label">{{ display(emp.employee_id, d.date).source!.short }}</span> <template v-for="(part, i) in planParts(display(emp.employee_id, d.date).plan)" :key="i"><span :class="{ 'shift-grid__plan-time': part.time }">{{ part.text }}</span>{{ ' ' }}</template>
                  <span v-if="isInactivePlan(emp.employee_id, d.date)" class="shift-grid__inactive">已停用</span>
                </span>
                <span v-if="hasResult(emp.employee_id, d.date)" class="shift-grid__result">
                  <span v-if="mode === 'reconcile' && display(emp.employee_id, d.date).actual" class="shift-grid__actual">{{ display(emp.employee_id, d.date).actual }}</span>
                  <span v-if="mode === 'reconcile' && display(emp.employee_id, d.date).verdict" class="shift-grid__verdict" :class="{ 'shift-grid__verdict--flag': isFlagged(emp.employee_id, d.date) }"><i v-if="isFlagged(emp.employee_id, d.date)" class="verdict-shape" :class="`verdict-shape--${kindOf(emp.employee_id, d.date)}`" aria-hidden="true" /><span v-for="(part, i) in verdictParts(display(emp.employee_id, d.date).verdict!.label)" :key="i" class="shift-grid__verdict-part">{{ part }}</span></span>
                  <span v-for="tag in leaveTags(emp.employee_id, d.date)" :key="tag" class="shift-grid__leave">{{ tag }}</span>
                  <span v-if="mode === 'reconcile' && display(emp.employee_id, d.date).confirmation" class="shift-grid__confirm"><i class="verdict-shape verdict-shape--confirm" aria-hidden="true" />{{ display(emp.employee_id, d.date).confirmation }}</span>
                </span>
              </button>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
    </div>

    <!-- 手機：只有週模式，選一天 → 人員卡片 -->
    <template v-else>
      <div ref="dayPicker" class="shift-grid__day-picker" role="tablist" aria-label="選擇日期">
        <button
          v-for="d in shownDays"
          :key="d.date"
          type="button"
          role="tab"
          :aria-selected="d.date === mobileDay"
          class="shift-grid__day-tab"
          :class="{ 'shift-grid__day-tab--active': d.date === mobileDay }"
          :data-test="`mobile-day-${d.date}`"
          @click="mobileDay = d.date"
        >{{ dayLabel(d) }}</button>
      </div>
      <div v-if="mobileDayInfo" class="shift-grid__day-marks" data-test="mobile-day-marks">
        <el-tag v-if="mobileDayInfo.is_holiday" size="small" type="info">{{ mobileDayInfo.holiday_name || '假日' }}</el-tag>
        <el-tag v-else-if="mobileDayInfo.is_makeup_workday" size="small" type="warning">補班</el-tag>
        <el-tag v-if="mobileDayInfo.is_workday && mobileDayInfo.import_covered === false && mobileDayInfo.date < today" size="small" type="info" :data-test="`mobile-not-imported-${mobileDayInfo.date}`">未匯入</el-tag>
        <span
          v-for="gap in gapsOf(mobileDayInfo.date)"
          :key="gap.shiftTypeId"
          class="shift-grid__gap"
          :class="`shift-grid__gap--${gap.severity}`"
          :data-test="`mobile-gap-${mobileDayInfo.date}`"
        >{{ gap.shiftTypeName }}{{ gap.severity === 'empty' ? '無人上班' : '待審通過將無人' }}</span>
      </div>
      <section v-for="section in sections" :key="section.group.key" class="shift-grid__mobile-group">
        <h3>{{ section.group.label }}</h3>
        <div v-for="emp in section.employees" :key="emp.employee_id" class="shift-grid__card">
          <button
            v-if="cellOf(emp.employee_id, mobileDay)"
            type="button"
            class="shift-grid__card-main"
            :class="cellClasses(emp.employee_id, mobileDay)"
            :disabled="!cellOf(emp.employee_id, mobileDay)!.employed"
            :data-test="`card-${emp.employee_id}`"
            @click="emit('select', emp.employee_id, mobileDay)"
          >
            <strong>{{ emp.name }}</strong>
            <span v-if="emp.role_label" class="shift-grid__role">{{ emp.role_label }}</span>
            <span v-if="noteOf(emp.employee_id)" class="shift-grid__note" :title="noteOf(emp.employee_id)!.detail" :data-test="`person-note-${emp.employee_id}`">{{ noteOf(emp.employee_id)!.tag }}</span>
            <span class="shift-grid__plan">{{ display(emp.employee_id, mobileDay).source ? `${display(emp.employee_id, mobileDay).source!.short}・` : '' }}{{ display(emp.employee_id, mobileDay).plan }}</span>
            <span v-if="isInactivePlan(emp.employee_id, mobileDay)" class="shift-grid__inactive">已停用</span>
            <span v-if="mode === 'reconcile' && display(emp.employee_id, mobileDay).actual" class="shift-grid__actual">{{ display(emp.employee_id, mobileDay).actual }}</span>
            <span v-if="mode === 'reconcile' && display(emp.employee_id, mobileDay).verdict" class="shift-grid__verdict" :class="{ 'shift-grid__verdict--flag': isFlagged(emp.employee_id, mobileDay) }"><i v-if="isFlagged(emp.employee_id, mobileDay)" class="verdict-shape" :class="`verdict-shape--${kindOf(emp.employee_id, mobileDay)}`" aria-hidden="true" /><span v-for="(part, i) in verdictParts(display(emp.employee_id, mobileDay).verdict!.label)" :key="i" class="shift-grid__verdict-part">{{ part }}</span></span>
            <span v-for="tag in leaveTags(emp.employee_id, mobileDay)" :key="tag" class="shift-grid__leave">{{ tag }}</span>
            <span v-if="mode === 'reconcile' && display(emp.employee_id, mobileDay).confirmation" class="shift-grid__confirm"><i class="verdict-shape verdict-shape--confirm" aria-hidden="true" />{{ display(emp.employee_id, mobileDay).confirmation }}</span>
          </button>
          <el-select
            v-if="mode === 'plan' && canEditPlan"
            :model-value="weeklyValue(emp.employee_id) ?? undefined"
            size="small"
            clearable
            placeholder="本週班別"
            :aria-label="`${emp.name} 本週班別`"
            :data-test="`weekly-${emp.employee_id}`"
            @update:model-value="(v: number | undefined) => emit('weekly-change', emp.employee_id, v ?? null)"
          >
            <el-option v-for="s in optionsFor(emp.employee_id)" :key="s.shift_type_id" :value="s.shift_type_id" :disabled="!s.is_active" :label="`${s.name} ${s.work_start}–${s.work_end}${s.is_active ? '' : '（已停用）'}`" />
          </el-select>
          <span v-if="mode === 'plan' && changedIds?.has(emp.employee_id)" class="shift-grid__unsaved" :data-test="`unsaved-${emp.employee_id}`">未儲存</span>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { DayCoverage, ShiftGap } from '@/utils/scheduleCoverage'
import {
  cellDisplay,
  cellKey,
  gridSections,
  isIssue,
  isSealedLeftover,
  type CellDisplay,
  type GridCell,
  type GridDay,
  type GridEmployee,
  type GridFilter,
  type GridGroup,
  type GridMode,
  type GridShiftType,
  leaveTagLabels,
  uncoveredDates,
  type VerdictKind,
  verdictKind,
} from '@/utils/scheduleAttendanceGrid'

const WEEKDAY = ['一', '二', '三', '四', '五', '六', '日']

const props = defineProps<{
  /** 核對：計畫＋打卡＋判定；排班：只有計畫與假別，另有本週班別下拉、未儲存標籤與欄頭空班警示 */
  mode: GridMode
  groups: GridGroup[]
  employees: GridEmployee[]
  days: GridDay[]
  cells: Map<string, GridCell>
  today: string
  filter: GridFilter
  /** 人員搜尋（姓名或工號，不分大小寫）；空字串＝不過濾 */
  keyword?: string
  canEditPlan: boolean
  shiftOptions: GridShiftType[]
  weeklyValue: (employeeId: number) => number | null
  /** 週班別改了但還沒儲存的人（列首標「未儲存」；排班才有） */
  changedIds?: ReadonlySet<number>
  /** 人力缺口（欄頭空班警示；排班才畫） */
  coverage?: DayCoverage[]
  mobile?: boolean
  /** 可匯入打卡（ATTENDANCE_WRITE）：整週都還沒匯入時，空狀態給匯入入口 */
  canImport?: boolean
  /** 捲動容器高度（px）：面板依實際工具列高度量出；沒給就用 CSS 的估算值 */
  maxHeight?: number | null
  /** 本月型態註記（整月沒打卡、時段可能設錯），key＝員工 id；是核對的事，排班不畫 */
  personNotes?: Record<number, { tag: string; detail: string }>
  /** 符合本月型態的待處理格（cellKey）：多半是設定問題，狀態是「設定問題」而不是會扣款 */
  patternKeys?: ReadonlySet<string>
  /** 本月被判成設定問題的人（員工 id）：「設定問題」篩選的列條件 */
  patternEmployeeIds?: ReadonlySet<number>
}>()
const emit = defineEmits<{
  select: [employeeId: number, date: string]
  'weekly-change': [employeeId: number, shiftTypeId: number | null]
  /** 帶第一個缺的日子：跨月週時頁面才知道要開哪個月的匯入 */
  'import-punches': [date: string]
  /** 列首型態註記：開本月設定檢查 */
  'show-patterns': []
}>()

/** 桌機欄與手機日期頁籤：「只看未來可排」只留今天以後（過去的格子不能排） */
const shownDays = computed(() => (props.filter === 'future' ? props.days.filter((d) => d.date > props.today) : props.days))

const cellOf = (employeeId: number, date: string) => props.cells.get(cellKey(employeeId, date))

const caption = computed(() => props.mode === 'plan'
  ? '週班表：列為人員（依班級分組），欄為日期；每格是應上班的班別與時段，按下可看來源與調整；方向鍵可在格子間移動'
  : '核對：列為人員（依班級分組），欄為日期；每格是應上班與實際打卡，按下可看來源與處理；方向鍵可在格子間移動')
const noteOf = (employeeId: number): { tag: string; detail: string } | undefined =>
  props.mode === 'reconcile' ? props.personNotes?.[employeeId] : undefined

// 下拉：現行班別＋所有在用班別；已停用的只留目前正在用的那個（標「已停用」且不可再選）
function optionsFor(employeeId: number): GridShiftType[] {
  const current = props.weeklyValue(employeeId)
  return props.shiftOptions.filter((s) => s.is_active || s.shift_type_id === current)
}
const inactiveIds = computed(() => new Set(props.shiftOptions.filter((s) => !s.is_active).map((s) => s.shift_type_id)))
function isInactivePlan(employeeId: number, date: string): boolean {
  const id = cellOf(employeeId, date)?.plan.shift_type_id
  return id != null && inactiveIds.value.has(id)
}

/** 整天未匯入打卡的日子：格子寫「未匯入」、不算待處理 */
const uncovered = computed(() => uncoveredDates(props.days))
/** 本週到昨天為止還沒匯入的工作日數（空狀態說明用） */
const missingImportDates = computed(() => props.days.filter((d) => d.is_workday && uncovered.value.has(d.date) && d.date < props.today).map((d) => d.date))
const missingImportDays = computed(() => missingImportDates.value.length)

const displays = computed(() => {
  const map = new Map<string, CellDisplay>()
  for (const [key, cell] of props.cells) map.set(key, cellDisplay(cell, props.today, uncovered.value))
  return map
})
/**
 * 格子狀態類別（形狀＋顏色五類，verdictKind）；null＝不畫形狀。
 * 整月同型態（patternKeys）的格子多半是設定問題，是「設定問題」而不是會扣款（仍留在待處理）。
 * 判定本身是中性的（已豁免／已接受、請假、未匯入、符合原班表）不算：老師確認進行中除外，
 * 那條提示行本身就是待辦。
 */
const kinds = computed(() => {
  const map = new Map<string, VerdictKind | null>()
  for (const [key, cell] of props.cells) {
    const kind = verdictKind(cell, { pattern: props.patternKeys?.has(key) ?? false })
    const shown = displays.value.get(key)!
    map.set(key, kind && (shown.confirmation || (shown.verdict && shown.verdict.tone !== 'info')) ? kind : null)
  }
  return map
})
/**
 * 這個篩選要看的格子：有待辦＝非型態的待辦格（型態格算設定問題）；設定問題＝型態格；封存時未處理＝封存遺留；
 * 全部、只看未來可排＝待辦。退背景（quietKeys）與手機預設選取日共用同一個判斷。
 */
function isFocusCell(cell: GridCell, key: string): boolean {
  if (props.filter === 'patterns') return !!props.patternKeys?.has(key)
  if (props.filter === 'leftover') return isSealedLeftover(cell, props.today, uncovered.value)
  if (props.filter === 'issues') return isIssue(cell, props.today, uncovered.value) && !props.patternKeys?.has(key)
  return isIssue(cell, props.today, uncovered.value)
}
/** 退到背景的格子跟著篩選走，眼睛只停在這個篩選要看的格子；全部、只看未來可排不退任何格子 */
const quietKeys = computed(() => {
  const keys = new Set<string>()
  if (props.filter !== 'issues' && props.filter !== 'patterns' && props.filter !== 'leftover') return keys
  for (const [key, cell] of props.cells) if (!isFocusCell(cell, key)) keys.add(key)
  return keys
})
/** 待辦格（被突出的格子）：排班沒有判定可看，不算 */
const isTodoCell = (cell: GridCell, key: string): boolean => props.mode === 'reconcile' && isFocusCell(cell, key)
const display = (employeeId: number, date: string): CellDisplay => displays.value.get(cellKey(employeeId, date))!
const kindOf = (employeeId: number, date: string): VerdictKind | null => kinds.value.get(cellKey(employeeId, date)) ?? null
/** 判定文字本身是待辦（要畫形狀、加粗）；只有老師確認提示行是待辦的格子，判定（例如符合原班表）維持中性 */
const isFlagged = (employeeId: number, date: string): boolean => {
  const tone = display(employeeId, date).verdict?.tone
  return kindOf(employeeId, date) !== null && tone !== undefined && tone !== 'info'
}

const needle = computed(() => (props.keyword ?? '').trim().toLowerCase())

// 桌機表格與手機卡片共用同一份列；與月格子、抽屜的上一筆／下一筆同一套篩選與分組（gridSections）
const sections = computed(() =>
  gridSections({
    groups: props.groups,
    employees: props.employees,
    days: props.days,
    cells: props.cells,
    filter: props.filter,
    today: props.today,
    keyword: props.keyword,
    uncovered: uncovered.value,
    patternKeys: props.patternKeys,
    patternEmployeeIds: props.patternEmployeeIds,
  }),
)
const visibleRows = computed(() => sections.value.flatMap((section) => section.employees))
const rowIndex = computed(() => new Map(visibleRows.value.map((emp, i) => [emp.employee_id, i])))

/**
 * 手機預設選取日：本週 ≤ 今天且有待辦的最晚一天；沒有就 ≤ 今天的最晚工作日；再沒有（整週在今天之後）就第一個工作日。
 * 「有待辦」＝畫面上看得到的那些人在這天有被這個篩選突出的格子（isTodoCell），所以從「看這 N 件（封存時未處理）」
 * 跳過來會落在有遺留的那天。
 */
function pickDay(): string {
  const days = shownDays.value
  // 由晚到早（tsconfig lib 是 ES2020，沒有 findLast）
  const upToToday = days.filter((d) => d.date <= props.today).reverse()
  const hasTodo = (date: string): boolean =>
    visibleRows.value.some((emp) => {
      const key = cellKey(emp.employee_id, date)
      const cell = props.cells.get(key)
      return !!cell && isTodoCell(cell, key)
    })
  return (
    upToToday.find((d) => hasTodo(d.date))?.date ??
    upToToday.find((d) => d.is_workday)?.date ??
    days.find((d) => d.is_workday)?.date ??
    days[0]?.date ??
    ''
  )
}

const mobileDay = ref(pickDay())
// 換週（選的那天不在新的日子裡）才重算；同一週重抓資料時不動使用者自己選的日子
watch(
  () => shownDays.value.map((d) => d.date).join(','),
  () => {
    if (!shownDays.value.some((d) => d.date === mobileDay.value)) {
      mobileDay.value = pickDay()
    }
  },
)
const mobileDayInfo = computed(() => shownDays.value.find((d) => d.date === mobileDay.value))

/** 選取的日期 chip 捲到橫向置中（一週 7 顆在窄螢幕放不下）；block nearest 不拉動頁面垂直捲動 */
const dayPicker = ref<HTMLElement | null>(null)
function revealSelectedDay(): void {
  dayPicker.value?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ inline: 'center', block: 'nearest' })
}
onMounted(revealSelectedDay)
watch([mobileDay, () => props.mobile], revealSelectedDay, { flush: 'post' })

/** 方向鍵在格子間移動（Tab 要走過每一格和每列的班別下拉，整週 35 人走不完）；略過停用的格子 */
const ARROWS: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
function onGridKeydown(event: KeyboardEvent): void {
  const step = ARROWS[event.key]
  if (!step || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  const current = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('.shift-grid__cell') : null
  const table = current?.closest('table')
  if (!current || !table) return
  let row = Number(current.dataset.row) + step[0]
  let col = Number(current.dataset.col) + step[1]
  while (row >= 0 && col >= 0 && row < visibleRows.value.length && col < shownDays.value.length) {
    const next = table.querySelector<HTMLButtonElement>(`.shift-grid__cell[data-row="${row}"][data-col="${col}"]`)
    if (next && !next.disabled) {
      event.preventDefault()
      next.focus()
      next.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
      return
    }
    row += step[0]
    col += step[1]
  }
}

const showImportHint = computed(() => !needle.value && props.filter === 'issues' && missingImportDays.value > 0)
const emptyText = computed(() => {
  if (needle.value) return '找不到符合的人員'
  if (showImportHint.value) return `這週沒有人有待辦，但有 ${missingImportDays.value} 天打卡還沒匯入，匯入後才能核對這幾天。`
  if (props.filter === 'issues') return '這段期間沒有人有待辦'
  if (props.filter === 'patterns') return '這段期間沒有設定問題的人'
  if (props.filter === 'leftover') return '這段期間沒有封存時未處理的人'
  return props.filter === 'future' ? '這段期間沒有可排的未來日' : '這段期間沒有在職人員'
})

function dayLabel(d: GridDay): string {
  const [, m, dd] = d.date.split('-').map(Number)
  return `${m}/${dd}（${WEEKDAY[d.weekday]}）`
}

/** 欄頭空班警示：排班時用來補人；核對看的是已發生的打卡，不畫 */
function gapsOf(date: string): ShiftGap[] {
  if (props.mode !== 'plan') return []
  return props.coverage?.find((c) => c.date === date)?.gaps ?? []
}

/** 「早值 08:00–17:00」拆成班別名＋時段，時段不折行 */
function planParts(plan: string): Array<{ text: string; time: boolean }> {
  return plan.split(' ').filter(Boolean).map((text) => ({ text, time: /^\d{2}:\d{2}–\d{2}:\d{2}$/.test(text) }))
}

/**
 * 「遲到 57 分・早退 342 分」→ [「遲到 57 分・」,「早退 342 分」]：分段才能只在「・」換行。
 * 「・」（U+30FB）在斷行規則裡不能放行首，所以接在前一段尾巴，斷點落在它後面。
 */
function verdictParts(label: string): string[] {
  const parts = label.split('・')
  return parts.map((part, i) => (i < parts.length - 1 ? `${part}・` : part))
}

/** 格子的假別：排班沒有判定行，全天假也要在假別標籤看得到（核對時那張假寫在判定裡） */
function leaveTags(employeeId: number, date: string): string[] {
  if (props.mode === 'reconcile') return display(employeeId, date).leaveTags
  const cell = cellOf(employeeId, date)
  return cell ? leaveTagLabels(cell) : []
}

/** 非應出勤日、沒有打卡也沒有假：格子只畫一槓（排班不看打卡與判定） */
function isRest(employeeId: number, date: string): boolean {
  const d = display(employeeId, date)
  if (d.state === 'not_employed' || d.source !== null || leaveTags(employeeId, date).length) return false
  return props.mode === 'plan' || (!d.actual && !d.verdict && !d.confirmation)
}

function hasResult(employeeId: number, date: string): boolean {
  if (leaveTags(employeeId, date).length) return true
  const d = display(employeeId, date)
  return props.mode === 'reconcile' && !!(d.actual || d.verdict || d.confirmation)
}

function cellClasses(employeeId: number, date: string): Record<string, boolean> {
  const d = display(employeeId, date)
  // 排班：只分未來（虛線、可排）與已封存；判定的狀態與形狀是核對的事
  if (props.mode === 'plan') {
    return {
      'shift-grid__cell--future': d.state === 'future',
      'shift-grid__cell--today': date === props.today,
      'shift-grid__cell--sealed': d.locked,
    }
  }
  const kind = kindOf(employeeId, date)
  return {
    [`shift-grid__cell--${d.state}`]: true,
    ...(kind ? { [`shift-grid__cell--k-${kind}`]: true } : {}),
    'shift-grid__cell--today': date === props.today,
    'shift-grid__cell--sealed': d.locked,
    'shift-grid__cell--quiet': quietKeys.value.has(cellKey(employeeId, date)),
  }
}

function cellAria(emp: GridEmployee, d: GridDay): string {
  const info = display(emp.employee_id, d.date)
  if (props.mode === 'plan') {
    return [emp.name, dayLabel(d), info.source?.label, info.plan, ...leaveTags(emp.employee_id, d.date), info.locked ? '已封存' : null].filter(Boolean).join('，')
  }
  return [
    emp.name, dayLabel(d), info.source?.label, info.plan, info.actual, info.verdict?.label,
    props.patternKeys?.has(cellKey(emp.employee_id, d.date)) ? '整月同型態，可能是設定問題' : null,
    ...info.leaveTags, info.confirmation, info.locked ? '已封存' : null,
  ].filter(Boolean).join('，')
}
</script>

<style scoped>
.shift-grid__scroller {
  /* 版面殼頂欄＋固定工具列＋頁尾留白約 170px；矮螢幕至少留 320px 給表格 */
  max-height: max(320px, calc(100vh - 170px));
  max-height: max(320px, calc(100dvh - 170px));
  overflow: auto;
  border-top: 1px solid var(--el-border-color-lighter);
}
.shift-grid__caption { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.shift-grid__empty { display: grid; justify-items: center; gap: var(--space-3); padding: var(--space-6); text-align: center; color: var(--el-text-color-secondary); }
.shift-grid__empty p { margin: 0; }
.shift-grid__table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: var(--text-sm); }
.shift-grid__table th, .shift-grid__table td { border-bottom: 1px solid var(--el-border-color-lighter); padding: var(--space-1); vertical-align: top; }
.shift-grid__table thead th { position: sticky; top: 0; z-index: var(--z-sticky); background: var(--el-bg-color); box-shadow: inset 0 -1px 0 var(--el-border-color-light); }
/* 欄寬下限合計（124＋5×116＋2×72）要留餘裕塞進 1280 寬的內容區（約 924px）：週六有人上班時那欄會被內容撐寬（實測 106px），
   下限再寬週日欄就被右緣切掉。表格寬 100%，寬螢幕仍會平均撐開 */
.shift-grid__person { position: sticky; left: 0; z-index: calc(var(--z-sticky) - 1); background: var(--el-bg-color); text-align: left; min-width: 124px; }
.shift-grid__table thead .shift-grid__corner { left: 0; z-index: calc(var(--z-sticky) + 1); text-align: left; min-width: 124px; }
.shift-grid__day { min-width: 116px; text-align: left; font-weight: 600; }
/* 非工作日欄多半只有一槓：收窄，把寬度留給工作日（打卡＋判定才不會折成第三行） */
.shift-grid__table thead .shift-grid__day--off { min-width: 72px; width: 72px; }
.shift-grid__day .shift-grid__date { white-space: nowrap; }
.shift-grid__day .el-tag { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
/* width 0＋min-width 100%：欄寬算內容時這層是 0，排好版又撐滿欄寬；沒有它，nowrap 的假日名會把表格欄撐到比下限還寬 */
.shift-grid__holiday { display: block; width: 0; min-width: 100%; }
.shift-grid__holiday .el-tag { max-width: 100%; }
.shift-grid__holiday :deep(.el-tag__content) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.shift-grid__day--today { color: var(--el-color-primary); }
.shift-grid__today { margin-left: var(--space-1); padding: 0 var(--space-1); border-radius: var(--radius-sm); background: var(--el-color-primary); color: var(--el-color-white); font-size: var(--text-xs); font-weight: 600; }
.shift-grid__group-label { position: sticky; left: var(--space-2); }
.shift-grid__table thead .shift-grid__day--off, .shift-grid__cell-wrap--off { background: var(--el-fill-color-lighter); }
.shift-grid__date { display: block; }
.shift-grid__gap { display: block; font-size: var(--text-xs); font-weight: 400; }
.shift-grid__gap--empty { color: var(--el-color-danger); }
.shift-grid__gap--risk { color: var(--color-warning-darker); }
/* 過去日的人力缺口已無法再排，核對時只是參考，不用警示色 */
.shift-grid__gap--past { color: var(--el-text-color-secondary); }
.shift-grid__group th { background: var(--el-fill-color-light); text-align: left; font-weight: 600; }
.shift-grid__who { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 var(--space-2); }
.shift-grid__name { font-weight: 600; }
.shift-grid__role { color: var(--el-text-color-secondary); font-size: var(--text-xs); }
/* 本月型態註記：整月同一種情形多半是設定問題，列首提示，細節在本月進度的設定檢查 */
.shift-grid__note { padding: 0; border: 0; background: transparent; font: inherit; color: var(--color-warning-darker); font-size: var(--text-xs); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.shift-grid__note:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
/* 手機卡片裡的註記在整張卡的按鈕內（不能再包按鈕）：不畫成連結樣子 */
.shift-grid__card-main .shift-grid__note { text-decoration: none; cursor: inherit; }
.shift-grid__weekly { margin-top: var(--space-1); width: 100%; }
.shift-grid__unsaved { display: inline-block; margin-top: var(--space-1); padding: 0 var(--space-1); border: 1px dashed var(--el-color-primary); border-radius: var(--radius-sm); color: var(--el-color-primary); font-size: var(--text-xs); font-weight: 600; }
.shift-grid__cell {
  display: grid; align-content: start; gap: var(--space-1); width: 100%; min-height: var(--touch-target-min); padding: var(--space-1) var(--space-2);
  border: 1px solid var(--el-border-color-lighter); border-radius: var(--radius-md); background: var(--el-bg-color);
  text-align: left; font: inherit; color: inherit; cursor: pointer;
}
.shift-grid__cell:hover:not(:disabled) { border-color: var(--el-color-primary); }
.shift-grid__cell:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 1px; }
.shift-grid__cell:disabled { cursor: not-allowed; background: var(--el-fill-color-lighter); color: var(--el-text-color-placeholder); }
/* 未來日＝還在計畫中、可以改：虛線框，文字維持正常色（淡色會像停用） */
.shift-grid__cell--future { border-style: dashed; }
/* 整天未匯入：還不能核對，整格退到背景，不跟待處理搶注意力 */
.shift-grid__cell--awaiting_import { background: var(--el-fill-color-lighter); color: var(--el-text-color-secondary); }
.shift-grid__cell--today { border-color: var(--el-color-primary-light-5); }
/* 只看待處理：同一列裡已經沒事的格子退到背景，眼睛只停在要處理的那幾格 */
.shift-grid__cell--quiet { border-color: transparent; background: var(--el-fill-color-lighter); color: var(--el-text-color-secondary); }
.shift-grid__cell--quiet .shift-grid__actual { color: var(--el-text-color-secondary); }
.shift-grid__rest { color: var(--el-text-color-secondary); }
/* 待處理格：判定文字前的狀態形狀（共用 .verdict-shape，assets/main.css）＋加粗深色字，不用側邊色條或整格染色（一週全紅時會變成警報牆）。
   字色依 verdictKind 取 --verdict-color：扣款＝danger、缺卡＝warning、等老師＝青、設定問題＝紫、資料待補＝次要灰 */
.shift-grid__cell--k-deduct { --verdict-color: var(--color-danger-darker); }
.shift-grid__cell--k-missing { --verdict-color: var(--color-warning-darker); }
.shift-grid__cell--k-confirm { --verdict-color: var(--color-verdict-confirm); }
.shift-grid__cell--k-setting { --verdict-color: var(--color-verdict-setting); }
.shift-grid__cell--k-pending_data { --verdict-color: var(--el-text-color-secondary); }
/* 封存格：判定文字與形狀仍留著（看得到當時是什麼狀況），但一律中性灰，不再是要處理的事；規則排在各 kind 之後才蓋得過 */
.shift-grid__cell--sealed { --verdict-color: var(--el-text-color-secondary); background-image: repeating-linear-gradient(135deg, transparent 0 6px, var(--el-fill-color-light) 6px 8px); }
.shift-grid__cell--sealed .verdict-shape { --verdict-shape-color: var(--el-text-color-secondary); }
.shift-grid__verdict .verdict-shape, .shift-grid__confirm .verdict-shape { margin-right: var(--space-1); }
.shift-grid__source { display: inline-block; min-width: 1.4em; margin-right: var(--space-1); padding: 0 calc(var(--space-1) / 2); border-radius: var(--radius-sm); background: var(--el-fill-color); text-align: center; font-size: var(--text-xs); }
.shift-grid__result { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 var(--space-2); }
.shift-grid__actual { color: var(--el-text-color-regular); font-variant-numeric: tabular-nums; white-space: nowrap; }
/* 只在班別名與時段之間、打卡與判定之間換行，時段本身不拆成「08:00–」／「17:30」 */
.shift-grid__plan-time { white-space: nowrap; }
/* 判定只在「・」之間換行，每段（「遲到 57 分」）不拆；整串不換行會把欄寬撐開，1440 寬時週末欄被擠出畫面 */
.shift-grid__verdict-part { white-space: nowrap; }
.shift-grid__verdict { font-size: var(--text-xs); color: var(--el-text-color-secondary); }
.shift-grid__verdict--flag { font-size: var(--text-sm); font-weight: 600; color: var(--verdict-color); }
/* 已判定的過去日：重點是打卡與判定，計畫退為次要 */
.shift-grid__cell--judged .shift-grid__plan { font-size: var(--text-xs); color: var(--el-text-color-secondary); }
.shift-grid__leave { font-size: var(--text-xs); color: var(--el-text-color-regular); }
.shift-grid__confirm { font-size: var(--text-xs); color: var(--verdict-color, var(--el-text-color-secondary)); }
.shift-grid__day-picker { display: flex; gap: var(--space-1); overflow-x: auto; margin-bottom: var(--space-3); }
/* 手機：往下捲人員卡片時日期列固定在捲動區（main.el-main）頂端，不用捲回去才能換天；要不透明底，卡片從底下捲過才不透字 */
@media (--to-sm) {
  .shift-grid__day-picker { position: sticky; top: 0; z-index: var(--z-sticky); padding: var(--space-1) 0; background: var(--bg-color); }
}
.shift-grid__day-tab { min-height: var(--touch-target-min); padding: 0 var(--space-2); border: 1px solid var(--el-border-color); border-radius: var(--radius-md); background: var(--el-bg-color); font: inherit; white-space: nowrap; }
.shift-grid__day-tab--active { border-color: var(--el-color-primary); color: var(--el-color-primary); font-weight: 600; }
.shift-grid__mobile-group h3 { margin: var(--space-3) 0 var(--space-2); font-size: var(--text-sm); }
.shift-grid__inactive { margin-left: var(--space-1); font-size: var(--text-xs); color: var(--color-warning-darker); }
.shift-grid__day-marks { display: flex; flex-wrap: wrap; gap: var(--space-1); align-items: center; margin-bottom: var(--space-2); }
.shift-grid__cell--full_leave .shift-grid__plan { font-size: var(--text-xs); color: var(--el-text-color-secondary); }
.shift-grid__cell--full_leave .shift-grid__verdict { font-size: var(--text-sm); font-weight: 600; color: var(--el-text-color-primary); }
.shift-grid__cell.shift-grid__cell--full_leave .shift-grid__result { order: -1; }
.shift-grid__card { display: grid; gap: var(--space-1); margin-bottom: var(--space-2); }
.shift-grid__card-main { display: grid; gap: var(--space-1); padding: var(--space-2); border: 1px solid var(--el-border-color-lighter); border-radius: var(--radius-md); background: var(--el-bg-color); text-align: left; font: inherit; color: inherit; min-height: var(--touch-target-min); }
</style>
