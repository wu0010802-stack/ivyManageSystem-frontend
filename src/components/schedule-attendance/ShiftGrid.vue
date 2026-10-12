<template>
  <div class="shift-grid" :class="{ 'shift-grid--mobile': mobile }">
    <p v-if="!visibleRows.length" class="shift-grid__empty" role="status">{{ emptyText }}</p>

    <!-- 桌機：列＝人（依班級分組），欄＝日；每格三行：計畫／實際／判定 -->
    <table v-else-if="!mobile" class="shift-grid__table" data-test="shift-grid-table">
      <thead>
        <tr>
          <th scope="col" class="shift-grid__corner">人員</th>
          <th v-for="d in days" :key="d.date" scope="col" class="shift-grid__day" :class="{ 'shift-grid__day--off': !d.is_workday }" :data-test="`day-${d.date}`">
            <span class="shift-grid__date">{{ dayLabel(d) }}</span>
            <el-tag v-if="d.is_holiday" size="small" type="info">{{ d.holiday_name || '假日' }}</el-tag>
            <el-tag v-else-if="d.is_makeup_workday" size="small" type="warning">補班</el-tag>
            <el-tag v-if="d.import_covered === false && d.date < today" size="small" type="info" :data-test="`not-imported-${d.date}`">未匯入</el-tag>
            <span
              v-for="gap in gapsOf(d.date)"
              :key="gap.shiftTypeId"
              class="shift-grid__gap"
              :class="`shift-grid__gap--${gap.severity}`"
              :data-test="`gap-${d.date}`"
            >{{ gap.shiftTypeName }}{{ gap.severity === 'empty' ? '無人上班' : '待審通過將無人' }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="section in sections" :key="section.group.key">
          <tr class="shift-grid__group">
            <th :colspan="days.length + 1" scope="colgroup">{{ section.group.label }}</th>
          </tr>
          <tr v-for="emp in section.employees" :key="emp.employee_id" :data-test="`row-${emp.employee_id}`">
            <th scope="row" class="shift-grid__person">
              <span class="shift-grid__name">{{ emp.name }}</span>
              <span v-if="emp.role_label" class="shift-grid__role">{{ emp.role_label }}</span>
              <el-select
                v-if="canEditPlan"
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
            </th>
            <td v-for="d in days" :key="d.date" class="shift-grid__cell-wrap" :class="{ 'shift-grid__cell-wrap--off': !d.is_workday }">
              <button
                v-if="cellOf(emp.employee_id, d.date)"
                type="button"
                class="shift-grid__cell"
                :class="cellClasses(emp.employee_id, d.date)"
                :disabled="!cellOf(emp.employee_id, d.date)!.employed"
                :aria-label="cellAria(emp, d)"
                :data-test="`cell-${emp.employee_id}-${d.date}`"
                @click="emit('select', emp.employee_id, d.date)"
              >
                <span class="shift-grid__plan">
                  <span class="shift-grid__source" :title="display(emp.employee_id, d.date).source.label">{{ display(emp.employee_id, d.date).source.short }}</span>
                  {{ display(emp.employee_id, d.date).plan }}
                </span>
                <span v-if="isInactivePlan(emp.employee_id, d.date)" class="shift-grid__inactive">已停用</span>
                <span v-if="display(emp.employee_id, d.date).actual" class="shift-grid__actual">{{ display(emp.employee_id, d.date).actual }}</span>
                <span v-if="display(emp.employee_id, d.date).verdict" class="shift-grid__verdict">{{ display(emp.employee_id, d.date).verdict!.label }}</span>
                <span v-for="tag in display(emp.employee_id, d.date).leaveTags" :key="tag" class="shift-grid__leave">{{ tag }}</span>
                <span v-if="display(emp.employee_id, d.date).confirmation" class="shift-grid__confirm">{{ display(emp.employee_id, d.date).confirmation }}</span>
              </button>
            </td>
          </tr>
        </template>
      </tbody>
    </table>

    <!-- 手機：只有週模式，選一天 → 人員卡片 -->
    <template v-else>
      <div class="shift-grid__day-picker" role="tablist" aria-label="選擇日期">
        <button
          v-for="d in days"
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
        <el-tag v-if="mobileDayInfo.import_covered === false && mobileDayInfo.date < today" size="small" type="info" :data-test="`mobile-not-imported-${mobileDayInfo.date}`">未匯入</el-tag>
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
            <span class="shift-grid__plan">{{ display(emp.employee_id, mobileDay).source.short }}・{{ display(emp.employee_id, mobileDay).plan }}</span>
            <span v-if="isInactivePlan(emp.employee_id, mobileDay)" class="shift-grid__inactive">已停用</span>
            <span v-if="display(emp.employee_id, mobileDay).actual" class="shift-grid__actual">{{ display(emp.employee_id, mobileDay).actual }}</span>
            <span v-if="display(emp.employee_id, mobileDay).verdict" class="shift-grid__verdict">{{ display(emp.employee_id, mobileDay).verdict!.label }}</span>
            <span v-for="tag in display(emp.employee_id, mobileDay).leaveTags" :key="tag" class="shift-grid__leave">{{ tag }}</span>
            <span v-if="display(emp.employee_id, mobileDay).confirmation" class="shift-grid__confirm">{{ display(emp.employee_id, mobileDay).confirmation }}</span>
          </button>
          <el-select
            v-if="canEditPlan"
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
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DayCoverage, ShiftGap } from '@/utils/scheduleCoverage'
import {
  cellDisplay,
  cellKey,
  rowMatchesFilter,
  type CellDisplay,
  type GridCell,
  type GridDay,
  type GridEmployee,
  type GridFilter,
  type GridGroup,
  type GridShiftType,
} from '@/utils/scheduleAttendanceGrid'

const WEEKDAY = ['一', '二', '三', '四', '五', '六', '日']

const props = defineProps<{
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
  coverage?: DayCoverage[]
  mobile?: boolean
}>()
const emit = defineEmits<{
  select: [employeeId: number, date: string]
  'weekly-change': [employeeId: number, shiftTypeId: number | null]
}>()

function pickDay(): string {
  return props.days.find((d) => d.date === props.today)?.date ?? props.days[0]?.date ?? ''
}

const mobileDay = ref(pickDay())
watch(
  () => props.days.map((d) => d.date).join(','),
  () => {
    if (!props.days.some((d) => d.date === mobileDay.value)) {
      mobileDay.value = pickDay()
    }
  },
)
const mobileDayInfo = computed(() => props.days.find((d) => d.date === mobileDay.value))

const cellOf = (employeeId: number, date: string) => props.cells.get(cellKey(employeeId, date))

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

const displays = computed(() => {
  const map = new Map<string, CellDisplay>()
  for (const [key, cell] of props.cells) map.set(key, cellDisplay(cell, props.today))
  return map
})
const display = (employeeId: number, date: string): CellDisplay => displays.value.get(cellKey(employeeId, date))!

const needle = computed(() => (props.keyword ?? '').trim().toLowerCase())
function matchesKeyword(emp: GridEmployee): boolean {
  if (!needle.value) return true
  return emp.name.toLowerCase().includes(needle.value) || (emp.employee_number ?? '').toLowerCase().includes(needle.value)
}

// 桌機表格與手機卡片共用同一份列
const visibleRows = computed(() =>
  props.employees
    .filter((emp) =>
      rowMatchesFilter(
        props.days.map((d) => cellOf(emp.employee_id, d.date)).filter((c): c is GridCell => c !== undefined),
        props.filter,
        props.today,
      ),
    )
    .filter(matchesKeyword),
)

const sections = computed(() =>
  props.groups
    .map((group) => ({ group, employees: visibleRows.value.filter((emp) => emp.group_key === group.key) }))
    .filter((section) => section.employees.length > 0),
)

const emptyText = computed(() => {
  if (needle.value) return '找不到符合的人員'
  return props.filter === 'issues' ? '這段期間沒有待處理的格子' : props.filter === 'future' ? '這段期間沒有可排的未來日' : '這段期間沒有在職人員'
})

function dayLabel(d: GridDay): string {
  const [, m, dd] = d.date.split('-').map(Number)
  return `${m}/${dd}（${WEEKDAY[d.weekday]}）`
}

function gapsOf(date: string): ShiftGap[] {
  return props.coverage?.find((c) => c.date === date)?.gaps ?? []
}

function cellClasses(employeeId: number, date: string): Record<string, boolean> {
  const d = display(employeeId, date)
  return {
    [`shift-grid__cell--${d.state}`]: true,
    [`shift-grid__cell--${d.verdict?.tone ?? 'none'}`]: true,
    'shift-grid__cell--today': date === props.today,
    'shift-grid__cell--locked': d.locked,
  }
}

function cellAria(emp: GridEmployee, d: GridDay): string {
  const info = display(emp.employee_id, d.date)
  return [
    emp.name, dayLabel(d), info.source.label, info.plan, info.actual, info.verdict?.label,
    ...info.leaveTags, info.confirmation, info.locked ? '已封存' : null,
  ].filter(Boolean).join('，')
}
</script>

<style scoped>
.shift-grid { overflow-x: auto; }
.shift-grid__empty { padding: var(--space-6); text-align: center; color: var(--el-text-color-secondary); }
.shift-grid__table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: var(--text-sm); }
.shift-grid__table th, .shift-grid__table td { border-bottom: 1px solid var(--el-border-color-lighter); padding: var(--space-1); vertical-align: top; }
.shift-grid__corner, .shift-grid__person { position: sticky; left: 0; z-index: 1; background: var(--el-bg-color); text-align: left; min-width: 150px; }
.shift-grid__day { min-width: 132px; text-align: left; font-weight: 600; }
.shift-grid__day--off, .shift-grid__cell-wrap--off { background: var(--el-fill-color-lighter); }
.shift-grid__date { display: block; }
.shift-grid__gap { display: block; font-size: var(--text-xs); font-weight: 400; }
.shift-grid__gap--empty { color: var(--el-color-danger); }
.shift-grid__gap--risk { color: var(--el-color-warning); }
.shift-grid__group th { background: var(--el-fill-color-light); text-align: left; font-weight: 600; }
.shift-grid__name { display: block; font-weight: 600; }
.shift-grid__role { display: block; color: var(--el-text-color-secondary); font-size: var(--text-xs); }
.shift-grid__weekly { margin-top: var(--space-1); width: 100%; }
.shift-grid__cell {
  display: grid; gap: 2px; width: 100%; min-height: var(--touch-target-min); padding: var(--space-1) var(--space-2);
  border: 1px solid var(--el-border-color-lighter); border-radius: var(--radius-md); background: var(--el-bg-color);
  text-align: left; font: inherit; color: inherit; cursor: pointer;
}
.shift-grid__cell:hover:not(:disabled) { border-color: var(--el-color-primary); }
.shift-grid__cell:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 1px; }
.shift-grid__cell:disabled { cursor: not-allowed; background: var(--el-fill-color-lighter); color: var(--el-text-color-placeholder); }
.shift-grid__cell--future { background: var(--el-fill-color-blank); color: var(--el-text-color-secondary); }
.shift-grid__cell--today { border-color: var(--el-color-primary-light-5); }
.shift-grid__cell--danger { border-left: 3px solid var(--el-color-danger); }
.shift-grid__cell--warning { border-left: 3px solid var(--el-color-warning); }
.shift-grid__cell--locked { background-image: repeating-linear-gradient(135deg, transparent 0 6px, var(--el-fill-color-light) 6px 8px); }
.shift-grid__source { display: inline-block; min-width: 1.4em; margin-right: var(--space-1); padding: 0 2px; border-radius: var(--radius-sm); background: var(--el-fill-color); text-align: center; font-size: var(--text-xs); }
.shift-grid__actual { color: var(--el-text-color-regular); }
.shift-grid__verdict { font-size: var(--text-xs); color: var(--el-text-color-secondary); }
.shift-grid__cell--danger .shift-grid__verdict { color: var(--el-color-danger); }
.shift-grid__cell--warning .shift-grid__verdict { color: var(--el-color-warning); }
.shift-grid__leave { font-size: var(--text-xs); color: var(--el-color-info); }
.shift-grid__confirm { font-size: var(--text-xs); color: var(--el-color-warning); }
.shift-grid__confirm::before { content: '●'; margin-right: 2px; }
.shift-grid__day-picker { display: flex; gap: var(--space-1); overflow-x: auto; margin-bottom: var(--space-3); }
.shift-grid__day-tab { min-height: var(--touch-target-min); padding: 0 var(--space-2); border: 1px solid var(--el-border-color); border-radius: var(--radius-md); background: var(--el-bg-color); font: inherit; white-space: nowrap; }
.shift-grid__day-tab--active { border-color: var(--el-color-primary); color: var(--el-color-primary); font-weight: 600; }
.shift-grid__mobile-group h3 { margin: var(--space-3) 0 var(--space-2); font-size: var(--text-sm); }
.shift-grid__inactive { margin-left: var(--space-1); font-size: var(--text-xs); color: var(--el-color-warning); }
.shift-grid__day-marks { display: flex; flex-wrap: wrap; gap: var(--space-1); align-items: center; margin-bottom: var(--space-2); }
.shift-grid__cell--full_leave .shift-grid__plan { font-size: var(--text-xs); color: var(--el-text-color-secondary); }
.shift-grid__cell--full_leave .shift-grid__verdict { font-size: var(--text-sm); font-weight: 600; color: var(--el-text-color-primary); }
.shift-grid__cell.shift-grid__cell--full_leave .shift-grid__verdict { order: -1; }
.shift-grid__card { display: grid; gap: var(--space-1); margin-bottom: var(--space-2); }
.shift-grid__card-main { display: grid; gap: 2px; padding: var(--space-2); border: 1px solid var(--el-border-color-lighter); border-radius: var(--radius-md); background: var(--el-bg-color); text-align: left; font: inherit; color: inherit; min-height: var(--touch-target-min); }
</style>
