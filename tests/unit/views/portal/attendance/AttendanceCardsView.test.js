import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AttendanceCardsView from '@/views/portal/components/attendance/AttendanceCardsView.vue'

const DAYS = [
  {
    day: 1, weekday: '週五', is_today: false, is_weekend: false, is_holiday: false,
    punch_in: '08:05', punch_out: '17:30', work_hours: 8.4,
    is_late: false, late_minutes: 0, is_early_leave: false,
    is_missing_punch_in: false, is_missing_punch_out: false,
    leave_type_label: null, shift_name: null, scheduled_start: null, scheduled_end: null,
    leave_requests: [], overtime_requests: [],
  },
  {
    day: 2, weekday: '週六', is_today: false, is_weekend: true, is_holiday: false,
    punch_in: null, punch_out: null, work_hours: null,
    is_late: false, late_minutes: 0, is_early_leave: false,
    is_missing_punch_in: false, is_missing_punch_out: false,
    leave_type_label: null, shift_name: null, scheduled_start: null, scheduled_end: null,
    leave_requests: [], overtime_requests: [],
  },
  {
    day: 3, weekday: '週日', is_today: false, is_weekend: false, is_holiday: false,
    punch_in: null, punch_out: null, work_hours: null,
    is_late: false, late_minutes: 0, is_early_leave: false,
    is_missing_punch_in: true, is_missing_punch_out: false,
    leave_type_label: null, shift_name: null, scheduled_start: null, scheduled_end: null,
    leave_requests: [], overtime_requests: [],
  },
  {
    day: 4, weekday: '週一', is_today: false, is_weekend: false, is_holiday: false,
    punch_in: '08:35', punch_out: null, work_hours: null,
    is_late: true, late_minutes: 5, is_early_leave: false,
    is_missing_punch_in: false, is_missing_punch_out: false,
    leave_type_label: null, shift_name: null, scheduled_start: null, scheduled_end: null,
    leave_requests: [], overtime_requests: [],
  },
  {
    day: 5, weekday: '週二', is_today: false, is_weekend: false, is_holiday: false,
    punch_in: null, punch_out: null, work_hours: null,
    is_late: false, late_minutes: 0, is_early_leave: false,
    is_missing_punch_in: false, is_missing_punch_out: false,
    leave_type_label: '事假', shift_name: null, scheduled_start: null, scheduled_end: null,
    leave_requests: [{ leave_type_label: '事假', leave_hours: 8, is_approved: true, reason: '' }],
    overtime_requests: [],
  },
]

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

describe('AttendanceCardsView', () => {
  it('renders one card per day', () => {
    const w = mount(AttendanceCardsView, {
      props: { days: DAYS, month: 5 },
      global: { stubs: STUBS },
    })
    expect(w.findAll('.day-card').length).toBe(5)
  })

  it('shows day number and weekday', () => {
    const w = mount(AttendanceCardsView, {
      props: { days: DAYS, month: 5 },
      global: { stubs: STUBS },
    })
    expect(w.text()).toContain('05/01')
    expect(w.text()).toContain('週五')
  })

  it('marks weekend card with day-card--weekend class', () => {
    const w = mount(AttendanceCardsView, {
      props: { days: DAYS, month: 5 },
      global: { stubs: STUBS },
    })
    const cards = w.findAll('.day-card')
    expect(cards[1].classes()).toContain('day-card--weekend')
  })

  it('marks late card with day-card--late class', () => {
    const w = mount(AttendanceCardsView, {
      props: { days: DAYS, month: 5 },
      global: { stubs: STUBS },
    })
    const cards = w.findAll('.day-card')
    expect(cards[3].classes()).toContain('day-card--late')
  })

  it('shows leave request badge when leave_requests present', () => {
    const w = mount(AttendanceCardsView, {
      props: { days: DAYS, month: 5 },
      global: { stubs: STUBS },
    })
    expect(w.text()).toContain('請假: 事假')
  })

  it('renders punch-in/out times', () => {
    const w = mount(AttendanceCardsView, {
      props: { days: DAYS, month: 5 },
      global: { stubs: STUBS },
    })
    expect(w.text()).toContain('08:05')
    expect(w.text()).toContain('17:30')
  })

  it('handles empty days array', () => {
    const w = mount(AttendanceCardsView, {
      props: { days: [], month: 5 },
      global: { stubs: STUBS },
    })
    expect(w.findAll('.day-card').length).toBe(0)
  })

  it('shows status tag for late day', () => {
    const w = mount(AttendanceCardsView, {
      props: { days: DAYS, month: 5 },
      global: { stubs: STUBS },
    })
    expect(w.text()).toContain('遲5分')
  })
})
