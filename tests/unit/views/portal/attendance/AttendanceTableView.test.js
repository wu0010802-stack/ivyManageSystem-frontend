import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AttendanceTableView from '@/views/portal/components/attendance/AttendanceTableView.vue'

// 產生 31 天假資料，確保上下兩段 table 都有資料
const makeDays = (count = 31) =>
  Array.from({ length: count }, (_, i) => ({
    day: i + 1,
    weekday: ['週一', '週二', '週三', '週四', '週五', '週六', '週日'][i % 7],
    is_weekend: i % 7 >= 5,
    is_holiday: false,
    holiday_name: null,
    punch_in: i % 7 < 5 ? '08:00' : null,
    punch_out: i % 7 < 5 ? '17:00' : null,
    work_hours: i % 7 < 5 ? 8 : null,
    is_late: false,
    late_minutes: 0,
    is_early_leave: false,
    is_missing_punch_in: false,
    is_missing_punch_out: false,
    leave_type_label: null,
    shift_name: null,
    scheduled_start: null,
    scheduled_end: null,
    leave_requests: [],
    overtime_requests: [],
  }))

const STUBS = {
  ElTag: {
    template: '<span class="el-tag" :data-type="type"><slot /></span>',
    props: ['type', 'size', 'effect'],
  },
  ElTooltip: {
    template: '<span class="el-tooltip"><slot /></span>',
    props: ['content', 'placement'],
  },
}

describe('AttendanceTableView', () => {
  it('mounts without error', () => {
    expect(() =>
      mount(AttendanceTableView, {
        props: { days: makeDays() },
        global: { stubs: STUBS },
      }),
    ).not.toThrow()
  })

  it('renders two tables (upper 1-15, lower 16+)', () => {
    const w = mount(AttendanceTableView, {
      props: { days: makeDays() },
      global: { stubs: STUBS },
    })
    expect(w.findAll('table.att-table').length).toBe(2)
  })

  it('upper table has 15 day columns', () => {
    const w = mount(AttendanceTableView, {
      props: { days: makeDays() },
      global: { stubs: STUBS },
    })
    const upperTable = w.findAll('table.att-table')[0]
    // thead has 1 label-col + 15 day columns
    const headerCells = upperTable.findAll('thead tr:first-child th')
    expect(headerCells.length).toBe(16) // label + 15 days
  })

  it('handles empty days array', () => {
    const w = mount(AttendanceTableView, {
      props: { days: [] },
      global: { stubs: STUBS },
    })
    expect(w.findAll('table.att-table').length).toBe(2)
  })

  it('shows punch_in time in upper table', () => {
    const w = mount(AttendanceTableView, {
      props: { days: makeDays(5) },
      global: { stubs: STUBS },
    })
    expect(w.text()).toContain('08:00')
  })

  it('renders 8 rows per table (日期/星期/上班/下班/工時/狀態/請假/加班)', () => {
    const w = mount(AttendanceTableView, {
      props: { days: makeDays() },
      global: { stubs: STUBS },
    })
    const upperTable = w.findAll('table.att-table')[0]
    // thead: 1 row (日期)
    // tbody: 7 rows (星期/上班/下班/工時/狀態/請假/加班)
    const theadRows = upperTable.findAll('thead tr')
    const tbodyRows = upperTable.findAll('tbody tr')
    expect(theadRows.length).toBe(1)
    expect(tbodyRows.length).toBe(7)
  })

  it('does not render 班表 row when usesShift is false', () => {
    const w = mount(AttendanceTableView, {
      props: { days: makeDays(), usesShift: false },
      global: { stubs: STUBS },
    })
    expect(w.text()).not.toContain('班表')
  })

  it('renders 班表 row when usesShift is true', () => {
    const w = mount(AttendanceTableView, {
      props: { days: makeDays(), usesShift: true },
      global: { stubs: STUBS },
    })
    expect(w.text()).toContain('班表')
  })
})
