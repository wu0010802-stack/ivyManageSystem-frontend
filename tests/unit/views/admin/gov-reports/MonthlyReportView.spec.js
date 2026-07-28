import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ── hoisted mocks ─────────────────────────────────────────────────────────
const { elMessage, elMessageBox } = vi.hoisted(() => ({
  elMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
  elMessageBox: {
    confirm: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('element-plus', () => ({
  ElMessage: elMessage,
  ElMessageBox: elMessageBox,
}))

vi.mock('@/api/govMoe', () => ({
  getMonthlyReport: vi.fn(),
  generateMonthlyReport: vi.fn(),
  exportMonthlyReport: vi.fn(),
}))

import { getMonthlyReport, generateMonthlyReport, exportMonthlyReport } from '@/api/govMoe'
import MonthlyReportView from '@/views/admin/gov-reports/MonthlyReportView.vue'

// ── El stubs ──────────────────────────────────────────────────────────────
const mountOptions = {
  global: {
    stubs: {
      'el-select': { template: '<div><slot/></div>' },
      'el-option': { template: '<div/>' },
      'el-button': { template: '<button :disabled="$attrs.disabled"><slot/></button>', inheritAttrs: true },
      'el-tooltip': { template: '<div><slot/></div>' },
      'el-tabs': { template: '<div><slot/></div>' },
      'el-tab-pane': { template: '<div><slot/></div>' },
      'el-empty': { props: ['description'], template: '<div class="el-empty">{{ description }}</div>' },
      'el-icon': { template: '<span/>' },
      // sub-components stubs
      ClassroomSummaryTable: { template: '<div class="classroom-summary-table"/>' },
      StudentDetailTable: { template: '<div class="student-detail-table"/>' },
      OverviewSummaryCard: { template: '<div class="overview-summary-card"/>' },
    },
  },
}

// ── sample data ───────────────────────────────────────────────────────────
const sampleReport = {
  year: 2026,
  month: 5,
  snapshot_date: '2026-05-31',
  generated_at: '2026-06-01T10:23:00+08:00',
  generated_by: 'test@example.com',
  classroom_summary: [],
  student_detail: [],
  overview: {
    total_students: 0,
    by_age_group: { '2-3': 0, '3-4': 0, '4-5': 0, '5-6': 0 },
    disadvantaged_pct: 0,
    disability_pct: 0,
    indigenous_pct: 0,
    foreign_pct: 0,
    total_expected_days: 0,
    total_actual_days: 0,
    total_attendance_rate_pct: 0,
  },
}

// ── tests ─────────────────────────────────────────────────────────────────
describe('MonthlyReportView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls getMonthlyReport on mount', () => {
    vi.mocked(getMonthlyReport).mockResolvedValue({ data: sampleReport })
    mount(MonthlyReportView, mountOptions)
    expect(getMonthlyReport).toHaveBeenCalled()
  })

  it('disables export button when no report', async () => {
    vi.mocked(getMonthlyReport).mockRejectedValue({ response: { status: 404 } })
    const wrapper = mount(MonthlyReportView, mountOptions)
    await flushPromises()
    const btn = wrapper.findAll('button').find((b) => b.text().includes('匯出'))
    expect(btn?.attributes('disabled')).toBeDefined()
  })

  it('shows empty state when no report', async () => {
    vi.mocked(getMonthlyReport).mockRejectedValue({ response: { status: 404 } })
    const wrapper = mount(MonthlyReportView, mountOptions)
    await flushPromises()
    // 空狀態文案改帶月份（如「2026-06 尚未產生月報」），此處只斷言不變的語意部分
    expect(wrapper.text()).toContain('尚未產生月報')
  })

  it('calls generate when button clicked (no existing report)', async () => {
    vi.mocked(getMonthlyReport).mockRejectedValueOnce({ response: { status: 404 } })
    vi.mocked(generateMonthlyReport).mockResolvedValue({
      data: {
        year: 2026,
        month: 5,
        rows_generated: 3,
        snapshot_date: '2026-05-31',
        generated_at: '2026-06-01T10:23',
        generated_by: 'test',
      },
    })
    vi.mocked(getMonthlyReport).mockResolvedValueOnce({ data: sampleReport })

    const wrapper = mount(MonthlyReportView, mountOptions)
    await flushPromises()
    const btn = wrapper.findAll('button').find((b) => b.text().includes('產生'))
    await btn?.trigger('click')
    await flushPromises()
    expect(generateMonthlyReport).toHaveBeenCalled()
  })

  it('shows regenerate button label when report exists', async () => {
    vi.mocked(getMonthlyReport).mockResolvedValue({ data: sampleReport })
    const wrapper = mount(MonthlyReportView, mountOptions)
    await flushPromises()
    const btn = wrapper.findAll('button').find((b) => b.text().includes('重算'))
    expect(btn).toBeDefined()
  })
})
