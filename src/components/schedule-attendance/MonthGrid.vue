<template>
  <div class="month-grid">
    <div class="month-grid__legend" data-test="month-legend">
      <VerdictLegend show-leave />
      <span class="month-grid__legend-hint">月總覽唯讀；點週次看該週</span>
    </div>
    <div v-if="!sections.length" class="month-grid__empty" role="status">{{ emptyText }}</div>
    <div v-else class="month-grid__scroller" :style="maxHeight ? { maxHeight: `${maxHeight}px` } : undefined">
      <table class="month-grid__table" data-test="month-grid-table">
        <caption class="month-grid__caption">月總覽：列為人員（依班級分組），欄為日期；每格是班別縮寫與狀態點，按下可看該人該日</caption>
        <thead>
          <tr>
            <th scope="col" rowspan="2" class="month-grid__corner">人員</th>
            <th v-for="w in weeks" :key="w.monday" scope="colgroup" :colspan="w.days.length" class="month-grid__week">
              <button
                type="button"
                class="month-grid__week-btn"
                :aria-label="`看 ${weekLabel(w)} 這週`"
                :data-test="`month-week-${w.monday}`"
                @click="emit('open-week', w.monday)"
              >{{ weekLabel(w) }}</button>
            </th>
          </tr>
          <tr>
            <th
              v-for="d in shownDays"
              :key="d.date"
              scope="col"
              class="month-grid__day"
              :class="{ 'month-grid__day--off': !d.is_workday, 'month-grid__day--today': d.date === today }"
              :title="d.holiday_name ?? undefined"
            >
              {{ Number(d.date.slice(8)) }}<span class="month-grid__weekday">{{ WEEKDAY[d.weekday] }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-for="section in sections" :key="section.group.key">
            <tr class="month-grid__group">
              <th :colspan="shownDays.length + 1" scope="colgroup">{{ section.group.label }}</th>
            </tr>
            <tr v-for="emp in section.employees" :key="emp.employee_id" :data-test="`mrow-${emp.employee_id}`">
              <th scope="row" class="month-grid__person">
                {{ emp.name }}<span v-if="emp.role_label" class="month-grid__role">{{ emp.role_label }}</span>
                <button
                  v-if="personNotes?.[emp.employee_id]"
                  type="button"
                  class="month-grid__note"
                  :title="personNotes[emp.employee_id].detail"
                  :aria-label="`${emp.name}：${personNotes[emp.employee_id].tag}，${personNotes[emp.employee_id].detail}。開本月設定檢查`"
                  :data-test="`mperson-note-${emp.employee_id}`"
                  @click="emit('show-patterns')"
                >{{ personNotes[emp.employee_id].tag }}</button>
              </th>
              <td v-for="d in shownDays" :key="d.date" class="month-grid__cell-wrap">
                <button
                  v-if="cellOf(emp.employee_id, d.date)"
                  type="button"
                  class="month-grid__cell"
                  :class="{ 'month-grid__cell--future': d.date > today, 'month-grid__cell--off': !d.is_workday }"
                  :disabled="!cellOf(emp.employee_id, d.date)!.employed"
                  :aria-label="cellAria(emp, d)"
                  :data-test="`mcell-${emp.employee_id}-${d.date}`"
                  @click="emit('select', emp.employee_id, d.date)"
                >
                  <span class="month-grid__abbr">{{ monthCellText(cellOf(emp.employee_id, d.date)!) }}</span>
                  <span
                    v-if="dotOf(emp.employee_id, d.date)"
                    class="month-grid__dot verdict-shape"
                    :class="[`verdict-shape--${dotOf(emp.employee_id, d.date)}`, `month-grid__dot--${dotOf(emp.employee_id, d.date)}`]"
                    :data-test="`mdot-${emp.employee_id}-${d.date}`"
                    aria-hidden="true"
                  />
                </button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatMonthDay } from '@/utils/attendanceConfirm'
import VerdictLegend from './VerdictLegend.vue'
import {
  cellDisplay,
  cellKey,
  gridSections,
  groupDaysByWeek,
  monthCellText,
  monthDot,
  uncoveredDates,
  type GridCell,
  type GridDay,
  type GridEmployee,
  type GridFilter,
  type GridGroup,
  type MonthDot,
  type MonthWeek,
} from '@/utils/scheduleAttendanceGrid'

const WEEKDAY = ['一', '二', '三', '四', '五', '六', '日']

const props = defineProps<{
  groups: GridGroup[]
  employees: GridEmployee[]
  /** 當月要顯示的日子（平日＋有人上班的週末，面板以 visibleDays 算好） */
  days: GridDay[]
  cells: Map<string, GridCell>
  today: string
  filter: GridFilter
  keyword?: string
  maxHeight?: number | null
  /** 本月型態註記（整月沒打卡、時段可能設錯），key＝員工 id */
  personNotes?: Record<number, { tag: string; detail: string }>
  /** 符合本月型態的待處理格（cellKey）：多半是設定問題，狀態點是「設定問題」而不是會扣款 */
  patternKeys?: ReadonlySet<string>
}>()
const emit = defineEmits<{
  select: [employeeId: number, date: string]
  /** 列首型態註記：開本月設定檢查 */
  'show-patterns': []
  /** 週次欄頭：帶該週真正的週一，面板據此切回週模式 */
  'open-week': [monday: string]
}>()

/** 「只看未來可排」只留今天以後（與週格子相同） */
const shownDays = computed(() => (props.filter === 'future' ? props.days.filter((d) => d.date > props.today) : props.days))
const weeks = computed(() => groupDaysByWeek(shownDays.value))
const uncovered = computed(() => uncoveredDates(props.days))
const cellOf = (employeeId: number, date: string) => props.cells.get(cellKey(employeeId, date))
const dots = computed(() => {
  const map = new Map<string, MonthDot | null>()
  for (const [key, cell] of props.cells) {
    // 整月同型態的格子是「設定問題」，不和逐日異常同一類（一整排扣款點多半只是一個設定錯）
    map.set(key, monthDot(cell, props.today, uncovered.value, { pattern: props.patternKeys?.has(key) ?? false }))
  }
  return map
})
const dotOf = (employeeId: number, date: string): MonthDot | null => dots.value.get(cellKey(employeeId, date)) ?? null
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
  }),
)

function weekLabel(w: MonthWeek): string {
  const first = w.days[0].date
  const last = w.days[w.days.length - 1].date
  return first === last ? formatMonthDay(first) : `${formatMonthDay(first)}–${formatMonthDay(last)}`
}
const emptyText = computed(() => {
  if ((props.keyword ?? '').trim()) return '找不到符合的人員'
  if (props.filter === 'issues') return '這個月沒有待處理的格子'
  if (props.filter === 'future') return '這個月沒有可排的未來日'
  return '這個月沒有在職人員'
})
/** 色點不能是唯一資訊：報讀帶出計畫、判定、假別與老師確認 */
function cellAria(emp: GridEmployee, d: GridDay): string {
  const info = cellDisplay(cellOf(emp.employee_id, d.date)!, props.today, uncovered.value)
  const pattern = props.patternKeys?.has(cellKey(emp.employee_id, d.date)) ? '整月同型態，可能是設定問題' : null
  return [emp.name, `${formatMonthDay(d.date)}（${WEEKDAY[d.weekday]}）`, info.plan, info.verdict?.label, pattern, ...info.leaveTags, info.confirmation]
    .filter(Boolean)
    .join('，')
}
</script>

<style scoped>
/* 狀態點的形狀與顏色是全域共用的 .verdict-shape--*（assets/main.css；顏色 token 在 design-tokens.css，暗色在 a11y.css），
   圖例是 VerdictLegend，兩邊同一組 class 才不會分叉 */
.month-grid__legend { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-3); margin: 0 0 var(--space-2); font-size: var(--text-xs); color: var(--el-text-color-secondary); }
.month-grid__legend-hint { margin-left: auto; }
.month-grid__scroller { max-height: max(320px, calc(100vh - 170px)); max-height: max(320px, calc(100dvh - 170px)); overflow: auto; border-top: 1px solid var(--el-border-color-lighter); }
.month-grid__caption { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.month-grid__empty { padding: var(--space-6); text-align: center; color: var(--el-text-color-secondary); }
.month-grid__table { border-collapse: separate; border-spacing: 0; font-size: var(--text-sm); }
.month-grid__table th, .month-grid__table td { padding: 0; border-bottom: 1px solid var(--el-border-color-lighter); text-align: center; }
/* 兩列表頭（週次＋日期）一起固定在捲動區頂端 */
.month-grid__table thead { position: sticky; top: 0; z-index: var(--z-sticky); }
.month-grid__table thead th { background: var(--el-bg-color); font-weight: 600; }
/* 下面 corner／person／day／group 一律帶 .month-grid__table 前綴：通用規則 `.month-grid__table th` 優先序較高，不加前綴 padding／text-align 會被它蓋掉 */
.month-grid__table .month-grid__corner, .month-grid__table .month-grid__person { position: sticky; left: 0; min-width: 120px; padding: var(--space-1) var(--space-2); background: var(--el-bg-color); text-align: left; }
.month-grid__table .month-grid__person { z-index: calc(var(--z-sticky) - 1); font-weight: 400; }
.month-grid__table thead .month-grid__corner { z-index: calc(var(--z-sticky) + 1); }
.month-grid__role { margin-left: var(--space-1); font-size: var(--text-xs); color: var(--el-text-color-secondary); }
.month-grid__note { display: block; padding: 0; border: 0; background: transparent; font: inherit; color: var(--color-warning-darker); font-size: var(--text-xs); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.month-grid__note:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.month-grid__week-btn { width: 100%; min-height: var(--touch-target-min); border: 0; border-bottom: 1px solid var(--el-border-color-light); background: transparent; color: var(--el-color-primary); font: inherit; cursor: pointer; }
.month-grid__week-btn:hover { background: var(--el-fill-color-light); }
.month-grid__table .month-grid__day { min-width: 40px; padding: var(--space-1) 0; }
.month-grid__weekday { display: block; font-size: var(--text-xs); font-weight: 400; color: var(--el-text-color-secondary); }
.month-grid__day--off { color: var(--el-text-color-secondary); }
.month-grid__day--today { box-shadow: inset 0 -2px 0 var(--el-color-primary); }
.month-grid__table .month-grid__group th { padding: var(--space-1) var(--space-2); background: var(--el-fill-color-light); text-align: left; font-weight: 600; }
.month-grid__cell { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; width: 100%; min-height: 40px; padding: var(--space-1) 0; border: 0; background: transparent; color: var(--el-text-color-primary); font: inherit; cursor: pointer; }
.month-grid__cell:hover:not(:disabled) { background: var(--el-fill-color-light); }
.month-grid__cell:disabled { cursor: default; }
.month-grid__cell--off { background: var(--el-fill-color-lighter); }
.month-grid__cell--future { color: var(--el-text-color-secondary); }
.month-grid__week-btn:focus-visible, .month-grid__cell:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: -2px; }
</style>
