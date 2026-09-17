/**
 * 在籍統計頁：現值統計與異動帳整合成單一頁面（2026-09-07）。
 *
 * 整合前是兩個頁籤各自為政——總人數報兩次、頁首的學年學期只作用於其中一個、
 * 兩張圖與表格是同一份數字。這裡守的是整合後的三條：一頁到底、單一主控制項、
 * 一份數字只畫一次。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import EnrollmentStatsView from '../EnrollmentStatsView.vue'
import EnrollmentLedgerPanel from '../EnrollmentLedgerPanel.vue'
import { useAcademicTermStore } from '@/stores/academicTerm'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }),
}))

const statsResponse = {
  school_year: 115,
  semester: 1,
  semester_label: '上學期',
  summary: { total: 197, male: 100, female: 97, class_count: 11 },
  by_grade: [
    {
      grade_name: '大班',
      total: 27,
      male: 14,
      female: 13,
      classes: [{ class_name: '天堂鳥', total: 27, male: 14, female: 13 }],
    },
  ],
}

const ledgerRow = {
  id: 1,
  event_date: '2026-09-01',
  event_kind: '入學',
  student_id: 7,
  student_name: '王小明',
  student_display_id: 'S007',
  from_classroom_id: null,
  to_classroom_id: 10,
  from_class_name: null,
  to_class_name: '天堂鳥',
  school_total_after: 197,
  from_class_count_after: null,
  to_class_count_after: 27,
  school_delta: 1,
  field_changed: null,
  old_value: null,
  new_value: null,
  reason: '新生報名',
  notes: null,
  actor_name: '陳主任',
  source: 'app',
  source_path: 'api.students.create_student',
  created_at: '2026-09-01T10:00:00',
}

vi.mock('@/api/studentEnrollment', () => ({
  getEnrollmentStats: vi.fn(() => Promise.resolve({ data: statsResponse })),
  getEnrollmentOptions: vi.fn(() =>
    Promise.resolve({
      data: [
        { school_year: 115, semester: 1, label: '115 上學期' },
        { school_year: 115, semester: 2, label: '115 下學期' },
      ],
    }),
  ),
  getEnrollmentLedger: vi.fn(() =>
    Promise.resolve({ data: { items: [ledgerRow], total: 1, opened: true } }),
  ),
  getLedgerReconcile: vi.fn(() =>
    Promise.resolve({
      data: {
        opened: true,
        status: 'mismatch',
        ledger_total: 197,
        roster_total: 198,
        difference: 1,
        unknown_rows: [],
      },
    }),
  ),
  getLedgerTrend: vi.fn(() =>
    Promise.resolve({
      data: {
        opened: true,
        points: [{ date: '2026-09-01', school_total: 197, class_totals: { '10': 27 } }],
      },
    }),
  ),
  getHeadcountOn: vi.fn(() =>
    Promise.resolve({
      data: {
        date: '2026-09-07',
        school_total: 197,
        school_male: 100,
        school_female: 97,
        school_on_leave: 0,
        classes: [
          {
            classroom_id: 10,
            class_name: '天堂鳥',
            grade_name: '大班',
            total: 27,
            male: 14,
            female: 13,
            on_leave: 0,
          },
        ],
      },
    }),
  ),
}))

vi.mock('@/composables/useChartJs', () => ({
  LineChart: { name: 'LineChart', template: '<div class="stub-line-chart" />' },
  BarChart: { name: 'BarChart', template: '<div class="stub-bar-chart" />' },
  DoughnutChart: { name: 'DoughnutChart', template: '<div class="stub-doughnut-chart" />' },
}))

vi.mock('@/components/common/PageHeader.vue', () => ({
  default: {
    name: 'PageHeader',
    props: ['title'],
    template: '<div class="stub-page-header">{{ title }}<slot name="actions" /></div>',
  },
}))

const mountView = () =>
  mount(EnrollmentStatsView, { global: { plugins: [ElementPlus] } })

describe('EnrollmentStatsView（現值與異動帳整合）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useAcademicTermStore()
    store.setTerm(115, 1)
    vi.clearAllMocks()
    mockIsMobile.value = false
  })

  it('一頁到底，不再有頁籤', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.el-tabs').exists()).toBe(false)
  })

  it('現值統計與異動明細出現在同一頁', async () => {
    const wrapper = mountView()
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('在籍總人數')
    expect(text).toContain('各班在籍人數表')
    expect(text).toContain('王小明') // 異動帳的逐筆紀錄
  })

  it('對帳橫幅在頁面層，一次說完帳上與名冊兩個數字', async () => {
    const wrapper = mountView()
    await flushPromises()
    const banner = wrapper.find('[data-testid="reconcile-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('197')
    expect(banner.text()).toContain('198')
  })

  it('尚未起帳時橫幅走說明語氣，不報警', async () => {
    const api = await import('@/api/studentEnrollment')
    vi.mocked(api.getLedgerReconcile).mockResolvedValueOnce({
      data: {
        opened: false,
        status: 'not_opened',
        ledger_total: null,
        roster_total: 196,
        difference: null,
        unknown_rows: [],
      },
    } as never)
    const wrapper = mountView()
    await flushPromises()
    const banner = wrapper.find('[data-testid="reconcile-banner"]')
    expect(banner.text()).toContain('尚未起帳')
    expect(banner.text()).toContain('196')
  })

  it('只留趨勢圖：表格已逐格列出的數字不再另外畫長條圖與圓餅圖', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.stub-line-chart').exists()).toBe(true)
    expect(wrapper.find('.stub-bar-chart').exists()).toBe(false)
    expect(wrapper.find('.stub-doughnut-chart').exists()).toBe(false)
  })

  it('切換學年學期會同時換掉現值與帳的查詢區間', async () => {
    const api = await import('@/api/studentEnrollment')
    mountView()
    await flushPromises()
    vi.mocked(api.getEnrollmentStats).mockClear()
    vi.mocked(api.getEnrollmentLedger).mockClear()

    useAcademicTermStore().setTerm(115, 2)
    await flushPromises()

    expect(api.getEnrollmentStats).toHaveBeenCalledWith(
      expect.objectContaining({ school_year: 115, semester: 2 }),
    )
    // 115 下學期 = 2027-02-01 ~ 2027-07-31
    expect(api.getEnrollmentLedger).toHaveBeenCalledWith(
      expect.objectContaining({ date_from: '2027-02-01', date_to: '2027-07-31' }),
    )
  })

  it('面板內縮小日期範圍後，頁面層要用新的結束日重新對帳', async () => {
    // 橫幅講的日子必須跟著下方明細走，否則兩者對不起來。
    // 這條路徑只在 v-model 雙向回寫成立時才通，值得單獨守著。
    const api = await import('@/api/studentEnrollment')
    const wrapper = mountView()
    await flushPromises()
    vi.mocked(api.getLedgerReconcile).mockClear()

    const panel = wrapper.findComponent(EnrollmentLedgerPanel)
    panel.vm.$emit('update:dateRange', ['2026-09-01', '2026-09-05'])
    await flushPromises()

    expect(api.getLedgerReconcile).toHaveBeenCalledWith({ date: '2026-09-05' })
  })

  it('重新整理同時刷新現值、對帳與帳，不是只刷一半', async () => {
    const api = await import('@/api/studentEnrollment')
    const wrapper = mountView()
    await flushPromises()
    vi.mocked(api.getEnrollmentStats).mockClear()
    vi.mocked(api.getLedgerReconcile).mockClear()
    vi.mocked(api.getEnrollmentLedger).mockClear()

    await wrapper.find('[data-testid="refresh-btn"]').trigger('click')
    await flushPromises()

    expect(api.getEnrollmentStats).toHaveBeenCalled()
    expect(api.getLedgerReconcile).toHaveBeenCalled()
    expect(api.getEnrollmentLedger).toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------
  // 2026-09-17 UI/UX 審查：性別未填、狀態列、對帳按鈕聯動、手機收欄
  // ---------------------------------------------------------------------

  it('性別未填不再被靜默當成 0：狀態列要看得到「已填」與「未填」', async () => {
    const api = await import('@/api/studentEnrollment')
    vi.mocked(api.getEnrollmentStats).mockResolvedValueOnce({
      data: {
        school_year: 115,
        semester: 1,
        semester_label: '上學期',
        summary: { total: 197, male: 100, female: 90, class_count: 11 },
        by_grade: [
          {
            grade_name: '大班',
            total: 190,
            male: 100,
            female: 90,
            classes: [{ class_name: '天堂鳥', total: 190, male: 100, female: 90 }],
          },
        ],
      },
    } as never)
    const wrapper = mountView()
    await flushPromises()
    const text = wrapper.text()
    // 已填 190 人（100 男 + 90 女），未填 7 人；不是「男生 100 占全園 51%」這種靜默失真。
    expect(text).toContain('已填 190 人')
    expect(text).toContain('未填 7')
  })

  it('整班性別都未填時，比例格顯示「性別未填」文字，不是一條空的比例條', async () => {
    const api = await import('@/api/studentEnrollment')
    vi.mocked(api.getEnrollmentStats).mockResolvedValueOnce({
      data: {
        school_year: 115,
        semester: 1,
        semester_label: '上學期',
        summary: { total: 27, male: 0, female: 0, class_count: 1 },
        by_grade: [
          {
            grade_name: '大班',
            total: 27,
            male: 0,
            female: 0,
            classes: [{ class_name: '天堂鳥', total: 27, male: 0, female: 0 }],
          },
        ],
      },
    } as never)
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('性別未填')
    expect(wrapper.find('.ratio-bar').exists()).toBe(false)
  })

  it('百分比分母是已填人數（男+女），不是總人數——未填不該被靜默算進男／女占比', async () => {
    const api = await import('@/api/studentEnrollment')
    vi.mocked(api.getEnrollmentStats).mockResolvedValueOnce({
      data: {
        school_year: 115,
        semester: 1,
        semester_label: '上學期',
        summary: { total: 25, male: 10, female: 10, class_count: 1 },
        by_grade: [
          {
            grade_name: '大班',
            total: 25,
            male: 10,
            female: 10,
            // 5 人未填：分母若誤用 total(25) 會算成 40%/40%；改用已填(20) 應是 50%/50%
            classes: [{ class_name: '天堂鳥', total: 25, male: 10, female: 10 }],
          },
        ],
      },
    } as never)
    const wrapper = mountView()
    await flushPromises()
    const ratioText = wrapper.find('.ratio-text').text()
    expect(ratioText).toContain('50%')
    expect(ratioText).not.toContain('40%')
  })

  it('帳目狀態 pill 顯示對帳結果，帶「截至」日期', async () => {
    const wrapper = mountView()
    await flushPromises()
    const pill = wrapper.find('[data-testid="reconcile-pill"]')
    expect(pill.exists()).toBe(true)
    expect(pill.text()).toContain('對帳不符')
    expect(wrapper.text()).toContain('截至')
  })

  it('相符時不再是整條警示，改成狀態列裡的小 pill', async () => {
    const api = await import('@/api/studentEnrollment')
    vi.mocked(api.getLedgerReconcile).mockResolvedValueOnce({
      data: {
        opened: true,
        status: 'ok',
        ledger_total: 197,
        roster_total: 197,
        difference: 0,
        unknown_rows: [],
      },
    } as never)
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="reconcile-banner"]').exists()).toBe(false)
    const pill = wrapper.find('[data-testid="reconcile-pill"]')
    expect(pill.exists()).toBe(true)
    expect(pill.text()).toContain('帳目相符')
  })

  it('有來源不明列時橫幅掛真按鈕，點擊後把下方明細的來源篩選切到未經系統', async () => {
    // 舊版文案寫「點此查看」但沒綁任何 click，是死文字——這裡守的是「點了真的會動」。
    const api = await import('@/api/studentEnrollment')
    vi.mocked(api.getLedgerReconcile).mockResolvedValueOnce({
      data: {
        opened: true,
        status: 'mismatch',
        ledger_total: 197,
        roster_total: 198,
        difference: 1,
        unknown_rows: [
          { id: 9, event_date: '2026-08-19', event_kind: '來源不明異動', student_name: '張小美' },
        ],
      },
    } as never)
    const wrapper = mountView()
    await flushPromises()
    vi.mocked(api.getEnrollmentLedger).mockClear()

    const actionBtn = wrapper.find('[data-testid="reconcile-action-btn"]')
    expect(actionBtn.exists()).toBe(true)
    expect(actionBtn.text()).toContain('1')

    await actionBtn.trigger('click')
    await flushPromises()

    expect(api.getEnrollmentLedger).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'db_trigger' }),
    )
  })

  it('沒有來源不明列時橫幅不掛按鈕（沒有東西可查）', async () => {
    const wrapper = mountView()
    await flushPromises()
    // 預設 fixture 的 mismatch 沒有 unknown_rows
    expect(wrapper.find('[data-testid="reconcile-action-btn"]').exists()).toBe(false)
  })

  it('手機寬度收起男女比例欄，避免表格橫向捲動', async () => {
    mockIsMobile.value = true
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.ratio-bar').exists()).toBe(false)
    // 未填欄等其餘欄位仍在，不是整張表消失
    expect(wrapper.text()).toContain('各班在籍人數表')
  })
})
