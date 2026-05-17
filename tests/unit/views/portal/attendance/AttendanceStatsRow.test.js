import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AttendanceStatsRow from '@/views/portal/components/attendance/AttendanceStatsRow.vue'

const SUMMARY = {
  total_work_days: 18,
  avg_work_hours: 8.2,
  late_count: 2,
  early_leave_count: 1,
  missing_punch_count: 3,
  leave_count: 4,
}

describe('AttendanceStatsRow', () => {
  it('renders two primary metrics (出勤天數 / 平均工時)', () => {
    const w = mount(AttendanceStatsRow, { props: { summary: SUMMARY } })
    const metrics = w.findAll('.metric')
    expect(metrics.length).toBe(2)
    expect(metrics[0].text()).toContain('18')
    expect(metrics[0].text()).toContain('出勤天數')
    expect(metrics[1].text()).toContain('8.2')
    expect(metrics[1].text()).toContain('平均工時')
  })

  it('formats avg_work_hours to one decimal', () => {
    const w = mount(AttendanceStatsRow, {
      props: { summary: { ...SUMMARY, avg_work_hours: 7 } },
    })
    expect(w.text()).toContain('7.0')
  })

  it('shows em-dash when avg_work_hours is null', () => {
    const w = mount(AttendanceStatsRow, {
      props: { summary: { ...SUMMARY, avg_work_hours: null } },
    })
    expect(w.text()).toContain('—')
  })

  it('renders anomaly chips for non-zero counts only', () => {
    const w = mount(AttendanceStatsRow, { props: { summary: SUMMARY } })
    const chips = w.findAll('.chip')
    expect(chips.length).toBe(4)
    const labels = chips.map((c) => c.text())
    expect(labels.some((t) => t.includes('遲到') && t.includes('2'))).toBe(true)
    expect(labels.some((t) => t.includes('早退') && t.includes('1'))).toBe(true)
    expect(labels.some((t) => t.includes('缺卡') && t.includes('3'))).toBe(true)
    expect(labels.some((t) => t.includes('請假') && t.includes('4'))).toBe(true)
  })

  it('uses danger tone for 缺卡 chip', () => {
    const w = mount(AttendanceStatsRow, {
      props: { summary: { ...SUMMARY, late_count: 0, early_leave_count: 0, leave_count: 0 } },
    })
    const chips = w.findAll('.chip')
    expect(chips.length).toBe(1)
    expect(chips[0].classes()).toContain('chip--danger')
  })

  it('uses warn tone for 遲到 and 早退 chips', () => {
    const w = mount(AttendanceStatsRow, {
      props: { summary: { ...SUMMARY, missing_punch_count: 0, leave_count: 0 } },
    })
    const chips = w.findAll('.chip')
    chips.forEach((c) => expect(c.classes()).toContain('chip--warn'))
  })

  it('uses info tone for 請假 chip', () => {
    const w = mount(AttendanceStatsRow, {
      props: { summary: { ...SUMMARY, late_count: 0, early_leave_count: 0, missing_punch_count: 0 } },
    })
    const chips = w.findAll('.chip')
    expect(chips.length).toBe(1)
    expect(chips[0].classes()).toContain('chip--info')
  })

  it('shows "本月無異常" badge when all anomaly counts are zero', () => {
    const w = mount(AttendanceStatsRow, {
      props: {
        summary: {
          total_work_days: 22,
          avg_work_hours: 8,
          late_count: 0,
          early_leave_count: 0,
          missing_punch_count: 0,
          leave_count: 0,
        },
      },
    })
    expect(w.find('.chip').exists()).toBe(false)
    expect(w.find('.stats-strip__clean').text()).toContain('本月無異常')
  })

  it('handles missing summary fields gracefully (uses 0 fallback)', () => {
    const w = mount(AttendanceStatsRow, { props: { summary: {} } })
    const metrics = w.findAll('.metric')
    expect(metrics[0].text()).toContain('0')
    // no chips since all counts default to undefined > 0 → false
    expect(w.find('.chip').exists()).toBe(false)
    expect(w.find('.stats-strip__clean').exists()).toBe(true)
  })
})
