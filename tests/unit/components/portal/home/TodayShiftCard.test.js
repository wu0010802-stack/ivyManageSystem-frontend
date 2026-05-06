import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TodayShiftCard from '@/components/portal/home/TodayShiftCard.vue'

// 元件使用 el-tag，stub 掉避免需要 Element Plus 環境
const globalStubs = {
  global: { stubs: { ElTag: { template: '<span class="el-tag-stub"><slot /></span>' } } },
}

const TODAY_WITH_SHIFT = {
  date: '2026-05-06',
  shift: { name: '正班', work_start: '08:00', work_end: '17:00' },
  attendance: { punch_in_at: '2026-05-06T08:05:00', punch_out_at: null, is_anomaly: false },
}

const TODAY_NO_SHIFT = {
  date: '2026-05-06',
  shift: null,
  attendance: { punch_in_at: null, punch_out_at: null, is_anomaly: false },
}

const TODAY_ANOMALY = {
  date: '2026-05-06',
  shift: { name: '正班', work_start: '08:00', work_end: '17:00' },
  attendance: { punch_in_at: '2026-05-06T08:35:00', punch_out_at: null, is_anomaly: true },
}

const TODAY_BOTH_PUNCHES = {
  date: '2026-05-06',
  shift: { name: '下午班', work_start: '13:00', work_end: '21:00' },
  attendance: { punch_in_at: '2026-05-06T13:02:00', punch_out_at: '2026-05-06T21:01:00', is_anomaly: false },
}

describe('TodayShiftCard', () => {
  it('renders shift name + times when shift exists', () => {
    const w = mount(TodayShiftCard, { props: { today: TODAY_WITH_SHIFT }, ...globalStubs })
    expect(w.text()).toContain('正班')
    expect(w.text()).toContain('08:00')
    expect(w.text()).toContain('17:00')
  })

  it('renders date label when date provided', () => {
    const w = mount(TodayShiftCard, { props: { today: TODAY_WITH_SHIFT }, ...globalStubs })
    // dateLabel 計算出 "5/6（週三）"
    expect(w.text()).toMatch(/5\/6/)
  })

  it('renders empty state "今日無班次" when no shift', () => {
    const w = mount(TodayShiftCard, { props: { today: TODAY_NO_SHIFT }, ...globalStubs })
    expect(w.text()).toContain('今日無班次')
  })

  it('shows punch-in time when present', () => {
    const w = mount(TodayShiftCard, { props: { today: TODAY_WITH_SHIFT }, ...globalStubs })
    expect(w.text()).toMatch(/08:05/)
  })

  it('shows both punch-in and punch-out times', () => {
    const w = mount(TodayShiftCard, { props: { today: TODAY_BOTH_PUNCHES }, ...globalStubs })
    expect(w.text()).toMatch(/13:02/)
    expect(w.text()).toMatch(/21:01/)
  })

  it('shows "—" for missing punch-out', () => {
    const w = mount(TodayShiftCard, { props: { today: TODAY_WITH_SHIFT }, ...globalStubs })
    // punch_out_at is null → formatTime returns '—'
    expect(w.text()).toContain('—')
  })

  it('marks anomaly visually when is_anomaly true', () => {
    const w = mount(TodayShiftCard, { props: { today: TODAY_ANOMALY }, ...globalStubs })
    // el-tag 顯示「異常」
    expect(w.html()).toMatch(/異常/)
  })

  it('does not show anomaly tag when is_anomaly false', () => {
    const w = mount(TodayShiftCard, { props: { today: TODAY_WITH_SHIFT }, ...globalStubs })
    // is_anomaly=false → el-tag should not render
    expect(w.findAll('.el-tag-stub').length).toBe(0)
  })

  it('renders gracefully with empty today prop', () => {
    const w = mount(TodayShiftCard, { props: { today: {} }, ...globalStubs })
    expect(w.text()).toContain('今日無班次')
    expect(w.text()).toContain('—')
  })

  it('renders gracefully without today prop', () => {
    const w = mount(TodayShiftCard, { ...globalStubs })
    expect(w.text().length).toBeGreaterThan(0)
  })
})
