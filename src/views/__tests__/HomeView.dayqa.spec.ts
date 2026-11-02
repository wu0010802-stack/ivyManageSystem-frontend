import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import ElementPlus from 'element-plus'

vi.setConfig({ testTimeout: 15000 })

vi.mock('@/composables', () => ({ useDashboardSections: vi.fn() }))
vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn(() => false) }))

import { useDashboardSections } from '@/composables'
import HomeView from '@/views/HomeView.vue'
import StatCard from '@/components/common/StatCard.vue'

// 「園方的一天」實機走查（2026-11-02）：
// F4：/attendance/today 回 absent_count=4、missing_count=0，卡片卻顯示 missing_count →
//     應出勤 23、已出勤 19、未打卡 0，同頁另一張卡列 4 位「整日未打卡」。早上老師還沒到時永遠 0。
// F9：「今日打卡異常 → 前往處理／查看出勤記錄」導到不帶日期的 /attendance，出勤核對頁
//     預設跳「最早未交薪資月」，園長日終處理今天的異常卻落在上個月。
function makeState(overrides: Record<string, unknown> = {}) {
  return {
    loading: ref(false),
    isFirstLoad: ref(false),
    deferredSections: reactive({
      studentAttendance: { loading: false, loaded: true, error: false },
      anomalies: { loading: false, loaded: true, error: false },
      calendar: { loading: false, loaded: true, error: false },
    }),
    studentAttendanceSectionRef: ref(null),
    anomaliesSectionRef: ref(null),
    calendarSectionRef: ref(null),
    showAttendance: true,
    showApprovals: true,
    showCalendar: true,
    showStudents: true,
    stats: ref({ total: 23, teachers: 15, others: 8 }),
    studentCount: ref<number | null>(151),
    todayStats: ref({
      total_employees: 23,
      expected_count: 19,
      present_count: 15,
      absent_count: 4,
      on_leave_count: 0,
      late_count: 0,
      missing_count: 0,
    }),
    attendanceAnomalies: ref({
      anomalies: [
        { employee_id: 'AR001', anomaly_type: 'absent', employee_name: '高若曦', late_minutes: null },
      ],
    }),
    studentAttendanceSummary: ref(null),
    approvalSummary: ref({
      total: 0,
      pending_leaves: 0,
      pending_overtimes: 0,
      this_month_pending_leaves: 0,
      this_month_pending_overtimes: 0,
    }),
    todayDateStr: ref('11 月 2 日（星期一）'),
    greeting: ref('早安'),
    userName: ref('園長'),
    groupedEvents: ref([]),
    eventTagType: { meeting: '', activity: 'success', holiday: 'danger', general: 'info' },
    anomalyLabel: (t: string) => t,
    anomalyTagType: () => 'info',
    navigateTo: vi.fn(),
    criticalErrors: reactive({ employees: false, students: false, todayStats: false, approvals: false }),
    retryCritical: vi.fn(),
    retryTodoBoard: vi.fn(),
    isWeekend: ref(false),
    ...overrides,
  }
}

function mountHome(state: ReturnType<typeof makeState>) {
  vi.mocked(useDashboardSections).mockReturnValue(state as never)
  return mount(HomeView, {
    global: {
      plugins: [ElementPlus],
      stubs: {
        QuickAddMenu: true,
        DisabilityExpirySection: true,
        IntegrationsHealthCard: true,
        QuickOvertimeDialog: true,
        QuickLeaveDialog: true,
        QuickStudentDialog: true,
        QuickAnnouncementDialog: true,
        QuickClassroomDialog: true,
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  })
}

function statValue(wrapper: ReturnType<typeof mountHome>, label: string): unknown {
  const card = wrapper.findAllComponents(StatCard).find((c) => c.props('label') === label)
  expect(card, `找不到「${label}」卡`).toBeTruthy()
  return card!.props('value')
}

describe('儀表板教師出勤（day-qa F4）', () => {
  it('「未打卡」顯示今天應上班卻沒有任何打卡的人數（absent_count），不是缺卡數', () => {
    const wrapper = mountHome(makeState())
    expect(statValue(wrapper, '未打卡')).toBe(4)
    wrapper.unmount()
  })

  it('「今日應出勤」顯示應上班人數（expected_count），不是在職總數', () => {
    const wrapper = mountHome(makeState())
    expect(statValue(wrapper, '今日應出勤')).toBe(19)
    wrapper.unmount()
  })
})

describe('打卡異常出口落在今天（day-qa F9）', () => {
  it('「查看出勤記錄」帶今天日期導到出勤核對頁', async () => {
    const state = makeState()
    const wrapper = mountHome(state)
    const btn = wrapper.findAll('button').find((b) => b.text().includes('查看出勤記錄'))
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    expect(state.navigateTo).toHaveBeenCalledWith(expect.stringMatching(/^\/attendance\?date=\d{4}-\d{2}-\d{2}$/))
    wrapper.unmount()
  })
})
