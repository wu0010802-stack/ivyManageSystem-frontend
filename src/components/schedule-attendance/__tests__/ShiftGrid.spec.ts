import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ShiftGrid from '../ShiftGrid.vue'
import { indexCells, visibleDays, type GridCell, type GridFilter } from '@/utils/scheduleAttendanceGrid'
import { cell, day, employee, grid, SHIFTS, WEEK } from './gridFixtures'

const TODAY = '2026-09-17'

function cellsFor(overrides: Record<string, Parameters<typeof cell>[2]> = {}): GridCell[] {
  return [1, 2, 3].flatMap((id) =>
    WEEK.map((date) => cell(id, date, overrides[`${id}|${date}`] ?? { plan: { expected: day(date).is_workday } })),
  )
}

function mountGrid(opts: {
  cells?: GridCell[]
  filter?: GridFilter
  canEditPlan?: boolean
  mobile?: boolean
  today?: string
  coverage?: Array<{ date: string; leaves: never[]; gaps: Array<Record<string, unknown>> }>
} = {}) {
  const g = grid({
    employees: [
      employee(1, '林班導'),
      employee(2, '王副導', { role_label: '副班導' }),
      employee(3, '李廚工', { group_key: 'other', role_label: '廚工' }),
    ],
    cells: opts.cells ?? cellsFor(),
  })
  return mount(ShiftGrid, {
    props: {
      groups: g.groups,
      employees: g.employees,
      days: visibleDays(g.days, g.cells),
      cells: indexCells(g.cells),
      today: opts.today ?? TODAY,
      filter: opts.filter ?? 'all',
      canEditPlan: opts.canEditPlan ?? true,
      shiftOptions: SHIFTS.filter((s) => s.is_active),
      weeklyValue: (id: number) => (id === 1 ? 1 : null),
      coverage: opts.coverage as never,
      mobile: opts.mobile ?? false,
    },
    global: { plugins: [ElementPlus] },
  })
}

describe('ShiftGrid 桌機', () => {
  it('依班級分組、平日五欄、每格顯示來源＋計畫', () => {
    const wrapper = mountGrid()
    const groups = wrapper.findAll('.shift-grid__group').map((w) => w.text())
    expect(groups).toEqual(['滿天星', '行政／後勤'])
    expect(wrapper.findAll('thead th.shift-grid__day')).toHaveLength(5)
    expect(wrapper.find(`[data-test="cell-1-${WEEK[0]}"]`).text()).toContain('週 早車 07:00–16:30')
  })

  it('週末有人打卡就出現該欄', () => {
    const wrapper = mountGrid({
      today: '2026-09-21',
      cells: cellsFor({ [`2|${WEEK[5]}`]: { plan: { expected: false }, actual: { punch_in: `${WEEK[5]}T09:00:00`, punch_out: `${WEEK[5]}T12:00:00`, status: 'unscheduled_attendance' } } }),
    })
    expect(wrapper.find(`[data-test="day-${WEEK[5]}"]`).exists()).toBe(true)
    expect(wrapper.find(`[data-test="cell-2-${WEEK[5]}"]`).text()).toContain('非原排班出勤')
  })

  it('只看有問題：只留下有過去異常的人', () => {
    const wrapper = mountGrid({
      filter: 'issues',
      cells: cellsFor({ [`2|${WEEK[0]}`]: { actual: { status: 'anomaly', punch_in: `${WEEK[0]}T08:30:00`, punch_out: `${WEEK[0]}T18:00:00` } } }),
    })
    expect(wrapper.find('[data-test="row-1"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="row-2"]').exists()).toBe(true)
    expect(wrapper.find(`[data-test="cell-2-${WEEK[0]}"]`).classes()).toContain('shift-grid__cell--danger')
  })

  it('點格子送出 select；不在職的格子不可點', async () => {
    const wrapper = mountGrid({ cells: cellsFor({ [`3|${WEEK[0]}`]: { employed: false } }) })
    await wrapper.find(`[data-test="cell-1-${WEEK[1]}"]`).trigger('click')
    expect(wrapper.emitted('select')).toEqual([[1, WEEK[1]]])
    expect(wrapper.find(`[data-test="cell-3-${WEEK[0]}"]`).attributes('disabled')).toBeDefined()
  })

  it('本週班別下拉只在可改計畫時出現，改值送出 weekly-change', async () => {
    const wrapper = mountGrid()
    const select = wrapper.findComponent({ name: 'ElSelect' })
    expect(wrapper.find('[data-test="weekly-1"]').exists()).toBe(true)
    select.vm.$emit('update:modelValue', 2)
    expect(wrapper.emitted('weekly-change')).toEqual([[1, 2]])
    select.vm.$emit('update:modelValue', undefined)
    expect(wrapper.emitted('weekly-change')?.[1]).toEqual([1, null])
    expect(mountGrid({ canEditPlan: false }).find('[data-test="weekly-1"]').exists()).toBe(false)
  })

  it('欄頭顯示空班警示', () => {
    const wrapper = mountGrid({
      coverage: [{
        date: WEEK[2],
        leaves: [],
        gaps: [{ shiftTypeId: 1, shiftTypeName: '早車', workStart: '07:00', workEnd: '16:30', scheduledCount: 1, absentNames: ['林班導'], severity: 'empty' }],
      }],
    })
    expect(wrapper.find(`[data-test="gap-${WEEK[2]}"]`).text()).toBe('早車無人上班')
  })
})

describe('ShiftGrid 標記', () => {
  it('請假（含待審）、老師確認進行中、過去未匯入的日子都標在格子或欄頭', () => {
    const g = grid()
    const wrapper = mount(ShiftGrid, {
      props: {
        groups: g.groups,
        employees: g.employees,
        days: [day(WEEK[0], { import_covered: false }), day(WEEK[1]), day(WEEK[4], { import_covered: false })],
        cells: indexCells([
          cell(1, WEEK[0], { leaves: [{ leave_id: 3, leave_type_label: '事假', status: 'pending', is_full_day: false, start_time: '13:00', end_time: '17:00' }] }),
          cell(1, WEEK[1], { actual: {}, confirmation: { item_id: 9, round_id: 2, kind: 'swap', status: 'pending', partner_employee_id: 2 } }),
          cell(1, WEEK[4]),
          cell(2, WEEK[0]), cell(2, WEEK[1]), cell(2, WEEK[4]),
        ]),
        today: TODAY,
        filter: 'all',
        canEditPlan: false,
        shiftOptions: SHIFTS,
        weeklyValue: () => null,
      },
      global: { plugins: [ElementPlus] },
    })
    expect(wrapper.find(`[data-test="cell-1-${WEEK[0]}"]`).text()).toContain('事假（待審）')
    expect(wrapper.find(`[data-test="cell-1-${WEEK[1]}"] .shift-grid__confirm`).text()).toBe('老師確認：待回覆')
    expect(wrapper.find(`[data-test="not-imported-${WEEK[0]}"]`).exists()).toBe(true)
    expect(wrapper.find(`[data-test="not-imported-${WEEK[4]}"]`).exists()).toBe(false) // 未來日不標
  })
})

describe('ShiftGrid 手機', () => {
  it('選一天後列出人員卡片，點卡片送出 select', async () => {
    const wrapper = mountGrid({ mobile: true })
    expect(wrapper.find('[data-test="shift-grid-table"]').exists()).toBe(false)
    await wrapper.find(`[data-test="mobile-day-${WEEK[2]}"]`).trigger('click')
    await wrapper.find('[data-test="card-2"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([[2, WEEK[2]]])
  })
})
