/**
 * ActivityDashboardView — 學期選擇器接到卡片/圖表/出席率
 *
 * 原本只有 fetchTable 帶 selectedTermKey；stats-summary / stats-charts /
 * attendance-stats 三組不帶學期 → 切學期時卡片不動且無標示。
 * 契約：與 dashboard-table 完全相同的 school_year/semester 帶法。
 * 使用真 pinia store（activity / academicTerm）+ mock api 層驗證整條接線。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// ── API mocks ──────────────────────────────────────────────────────────────
vi.mock('@/api/activity', () => ({
  getActivityStatsSummary: vi.fn(),
  getActivityStatsCharts: vi.fn(),
  getActivityStats: vi.fn(),
  getActivityDashboardTable: vi.fn(),
  exportDashboardTable: vi.fn(),
}))

// ── element-plus 訊息 mock ─────────────────────────────────────────────────
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import {
  getActivityStatsSummary,
  getActivityStatsCharts,
  getActivityStats,
  getActivityDashboardTable,
} from '@/api/activity'
import { getCurrentAcademicTerm } from '@/utils/academic'
import { useAcademicTermStore } from '@/stores/academicTerm'
import ActivityDashboardView from '@/views/activity/ActivityDashboardView.vue'

const GLOBAL_STUBS = {
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-card': { template: '<div><slot name="header" /><slot /></div>' },
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': true,
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-progress': true,
}

function mockAllResolved() {
  getActivityStatsSummary.mockResolvedValue({ data: { totalRegistrations: 1, unreadInquiries: 0 } })
  getActivityStatsCharts.mockResolvedValue({ data: { daily: [], topCourses: [] } })
  // 出席率沒有獨立端點：走 GET /activity/stats 聚合回應的頂層 attendance_stats
  getActivityStats.mockResolvedValue({
    data: { attendance_stats: { total_sessions: 0, avg_attendance_rate: 0, by_course: [] } },
  })
  getActivityDashboardTable.mockResolvedValue({
    data: { grades: [], courses: [], grand_total: {} },
  })
}

describe('ActivityDashboardView — 學期接線', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockAllResolved()
  })

  it('掛載時 summary/charts/attendance/table 四組呼叫皆帶當前學期', async () => {
    const { school_year, semester } = getCurrentAcademicTerm()
    mount(ActivityDashboardView, {
      global: { stubs: GLOBAL_STUBS, directives: { loading: () => {} } },
    })
    await flushPromises()

    const expected = { school_year, semester }
    expect(getActivityStatsSummary).toHaveBeenCalledWith(expected)
    expect(getActivityStatsCharts).toHaveBeenCalledWith(expected)
    expect(getActivityStats).toHaveBeenCalledWith(expected)
    expect(getActivityDashboardTable).toHaveBeenCalledWith(expected)
  })

  it('切學期時三組統計與統計表全部以新學期重抓', async () => {
    const { school_year, semester } = getCurrentAcademicTerm()
    mount(ActivityDashboardView, {
      global: { stubs: GLOBAL_STUBS, directives: { loading: () => {} } },
    })
    await flushPromises()
    vi.clearAllMocks()
    mockAllResolved()

    // 切到上一學期（等同學期選擇器 set selectedTermKey）
    const prev = semester === 1
      ? { school_year: school_year - 1, semester: 2 }
      : { school_year, semester: 1 }
    useAcademicTermStore().setTerm(prev.school_year, prev.semester)
    await flushPromises()

    expect(getActivityStatsSummary).toHaveBeenCalledWith(prev)
    expect(getActivityStatsCharts).toHaveBeenCalledWith(prev)
    expect(getActivityStats).toHaveBeenCalledWith(prev)
    expect(getActivityDashboardTable).toHaveBeenCalledWith(prev)
  })
})
