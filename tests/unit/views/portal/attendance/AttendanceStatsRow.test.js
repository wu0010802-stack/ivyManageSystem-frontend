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

const STUBS = {
  StatCard: {
    template: '<div class="stat-card" :data-label="label" :data-value="String(value)" :data-color="color" :data-variant="variant">{{ label }} / {{ value }}</div>',
    props: ['label', 'value', 'icon', 'color', 'variant'],
  },
}

describe('AttendanceStatsRow', () => {
  it('renders 6 StatCards', () => {
    const w = mount(AttendanceStatsRow, { props: { summary: SUMMARY }, global: { stubs: STUBS } })
    expect(w.findAll('.stat-card').length).toBe(6)
  })

  it('passes correct label and value to each card', () => {
    const w = mount(AttendanceStatsRow, { props: { summary: SUMMARY }, global: { stubs: STUBS } })
    const cards = w.findAll('.stat-card')
    expect(cards[0].attributes('data-label')).toBe('出勤天數')
    expect(cards[0].attributes('data-value')).toBe('18')
    expect(cards[1].attributes('data-label')).toBe('平均工時(h)')
    expect(cards[1].attributes('data-value')).toBe('8.2')
  })

  it('uses warning color for late and early leave stats', () => {
    const w = mount(AttendanceStatsRow, { props: { summary: SUMMARY }, global: { stubs: STUBS } })
    const cards = w.findAll('.stat-card')
    expect(cards[2].attributes('data-color')).toBe('warning')  // late
    expect(cards[3].attributes('data-color')).toBe('warning')  // early leave
  })

  it('uses danger color for missing punch stat', () => {
    const w = mount(AttendanceStatsRow, { props: { summary: SUMMARY }, global: { stubs: STUBS } })
    const cards = w.findAll('.stat-card')
    expect(cards[4].attributes('data-color')).toBe('danger')
    expect(cards[4].attributes('data-label')).toBe('缺卡次數')
  })

  it('uses info color for leave stat', () => {
    const w = mount(AttendanceStatsRow, { props: { summary: SUMMARY }, global: { stubs: STUBS } })
    const cards = w.findAll('.stat-card')
    expect(cards[5].attributes('data-color')).toBe('info')
    expect(cards[5].attributes('data-label')).toBe('請假天數')
  })

  it('uses filled variant for all cards', () => {
    const w = mount(AttendanceStatsRow, { props: { summary: SUMMARY }, global: { stubs: STUBS } })
    const cards = w.findAll('.stat-card')
    cards.forEach((c) => {
      expect(c.attributes('data-variant')).toBe('filled')
    })
  })

  it('handles missing summary fields gracefully (uses 0 fallback)', () => {
    const w = mount(AttendanceStatsRow, { props: { summary: {} }, global: { stubs: STUBS } })
    const cards = w.findAll('.stat-card')
    cards.forEach((c) => {
      expect(c.attributes('data-value')).toBe('0')
    })
  })
})
