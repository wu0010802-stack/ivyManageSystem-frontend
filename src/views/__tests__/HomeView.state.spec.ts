import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import ElementPlus from 'element-plus'

// 真 EP mount 檔於全套並行時偶發 5s timeout（非邏輯問題），統一放寬
vi.setConfig({ testTimeout: 15000 })

vi.mock('@/composables', () => ({ useDashboardSections: vi.fn() }))
vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn(() => false) }))

import { useDashboardSections } from '@/composables'
import HomeView from '@/views/HomeView.vue'

// 儀表板狀態層修復的模板行為：
// 1. 教師出勤已載入但無資料 → 顯示 placeholder（修孤兒標題）
// 2. 週末 → 出勤 placeholder 與待辦空狀態帶週末語境
// 3. 統計來源失敗 → 顯示「—」與重新載入（修假零）
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
    stats: ref({ total: 48, teachers: 37, others: 11 }),
    studentCount: ref<number | null>(42),
    todayStats: ref(null),
    attendanceAnomalies: ref({ anomalies: [] }),
    studentAttendanceSummary: ref(null),
    approvalSummary: ref({
      total: 0,
      pending_leaves: 0,
      pending_overtimes: 0,
      this_month_pending_leaves: 0,
      this_month_pending_overtimes: 0,
    }),
    todayDateStr: ref('7 月 11 日（星期六）'),
    greeting: ref('早安'),
    userName: ref('測試員'),
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

describe('HomeView 狀態層（孤兒標題 / 週末 / 假零）', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('教師出勤已載入但無資料（平日）顯示 placeholder，不再只剩標題', () => {
    const wrapper = mountHome(makeState({ todayStats: ref(null), isWeekend: ref(false) }))
    expect(wrapper.text()).toContain('暫無今日出勤統計')
    wrapper.unmount()
  })

  it('週末時教師出勤 placeholder 顯示週末文案', () => {
    const wrapper = mountHome(makeState({ todayStats: ref(null), isWeekend: ref(true) }))
    expect(wrapper.text()).toContain('週末')
    expect(wrapper.text()).toContain('下個上課日')
    wrapper.unmount()
  })

  it('學生數載入失敗時顯示「—」與重新載入，點擊觸發 retryCritical', async () => {
    const retryCritical = vi.fn()
    const state = makeState({
      studentCount: ref(null),
      criticalErrors: reactive({ employees: false, students: true, todayStats: false }),
      retryCritical,
    })
    const wrapper = mountHome(state)
    expect(wrapper.text()).toContain('—')
    const retryBtn = wrapper
      .findAll('button')
      .find(b => b.text().includes('重新載入'))
    expect(retryBtn).toBeTruthy()
    await retryBtn!.trigger('click')
    expect(retryCritical).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('週末且待辦清空時空狀態帶週末語境', () => {
    const wrapper = mountHome(makeState({ isWeekend: ref(true) }))
    expect(wrapper.text()).toContain('週末愉快')
    wrapper.unmount()
  })

  it('待辦來源失敗時不顯示「太好了」而顯示載入失敗警示與重試', async () => {
    const retryTodoBoard = vi.fn()
    const state = makeState({
      deferredSections: reactive({
        studentAttendance: { loading: false, loaded: true, error: false },
        anomalies: { loading: false, loaded: true, error: true },
        calendar: { loading: false, loaded: true, error: false },
      }),
      retryTodoBoard,
    })
    const wrapper = mountHome(state)
    expect(wrapper.text()).not.toContain('太好了')
    expect(wrapper.text()).toContain('部分待辦來源載入失敗')
    const retryBtn = wrapper.findAll('button').find(b => b.text().includes('重試'))
    expect(retryBtn).toBeTruthy()
    await retryBtn!.trigger('click')
    expect(retryTodoBoard).toHaveBeenCalled()
    wrapper.unmount()
  })
})
