import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SummaryCards from '@/components/student/tabs/academic/SummaryCards.vue'

vi.mock('@/api/studentRecords', () => ({
  getAcademicSummary: vi.fn(),
}))

import { getAcademicSummary } from '@/api/studentRecords'

const stubs = {
  ElEmpty: { template: '<div />' },
}

const fakeSummary = {
  school_year: 114,
  semester: 2,
  period: { from: '2026-02-01', to: '2026-07-31' },
  attendance_rate: 0.857,
  attendance_total: 100,
  attendance_present: 85,
  leave_days: 4,
  assessment_count: 2,
  incident_count: 1,
}

describe('SummaryCards', () => {
  beforeEach(() => {
    getAcademicSummary.mockReset()
  })

  it('renders four metric cards with summary data', async () => {
    getAcademicSummary.mockResolvedValue({ data: fakeSummary })
    const wrapper = mount(SummaryCards, {
      props: { studentId: 1, active: true },
      global: { stubs },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('85.7%')
    expect(wrapper.text()).toContain('4') // leave_days
    expect(wrapper.text()).toContain('出席 85 / 共 100')
    expect(wrapper.text()).toContain('2026-02-01 ~ 2026-07-31')
  })

  it('emits jump-tab=attendance when 出席率卡 is clicked', async () => {
    getAcademicSummary.mockResolvedValue({ data: fakeSummary })
    const wrapper = mount(SummaryCards, {
      props: { studentId: 1, active: true },
      global: { stubs },
    })
    await flushPromises()
    await wrapper.find('.card-attendance').trigger('click')
    expect(wrapper.emitted('jump-tab')[0]).toEqual(['attendance'])
  })

  it('emits jump-section=leave when 請假卡 is clicked', async () => {
    getAcademicSummary.mockResolvedValue({ data: fakeSummary })
    const wrapper = mount(SummaryCards, {
      props: { studentId: 1, active: true },
      global: { stubs },
    })
    await flushPromises()
    await wrapper.find('.card-leave').trigger('click')
    expect(wrapper.emitted('jump-section')[0]).toEqual(['leave'])
  })

  it('shows zero values when API returns empty summary', async () => {
    getAcademicSummary.mockResolvedValue({
      data: {
        school_year: 114,
        semester: 2,
        period: { from: '2026-02-01', to: '2026-07-31' },
        attendance_rate: 0,
        attendance_total: 0,
        attendance_present: 0,
        leave_days: 0,
        assessment_count: 0,
        incident_count: 0,
      },
    })
    const wrapper = mount(SummaryCards, {
      props: { studentId: 1, active: true },
      global: { stubs },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('0%')
  })
})
