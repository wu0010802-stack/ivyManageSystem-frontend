import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import EnrollmentLedgerPanel from '../EnrollmentLedgerPanel.vue'

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
  to_class_name: '小班A',
  school_total_after: 197,
  from_class_count_after: null,
  to_class_count_after: 25,
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

const sentinelRow = {
  ...ledgerRow,
  id: 2,
  event_date: '2026-08-19',
  event_kind: '來源不明異動',
  student_id: 8,
  student_name: '張小美',
  student_display_id: 'S008',
  to_classroom_id: null,
  to_class_name: null,
  school_total_after: null,
  to_class_count_after: null,
  school_delta: null,
  field_changed: 'enrollment_date',
  old_value: '2026-09-01',
  new_value: '2026-08-15',
  reason: null,
  actor_name: null,
  source: 'db_trigger',
  source_path: 'db.trg_students_ledger_sentinel',
}

vi.mock('@/api/studentEnrollment', () => ({
  getEnrollmentLedger: vi.fn(() =>
    Promise.resolve({ data: { items: [ledgerRow, sentinelRow], total: 2, opened: true } }),
  ),
  getLedgerReconcile: vi.fn(() =>
    Promise.resolve({
      data: {
        opened: true,
        status: 'mismatch',
        ledger_total: 197,
        roster_total: 198,
        difference: 1,
        unknown_rows: [{ id: 2, event_date: '2026-08-19', event_kind: '來源不明異動' }],
      },
    }),
  ),
  getLedgerTrend: vi.fn(() =>
    Promise.resolve({
      data: {
        opened: true,
        points: [
          { date: '2026-09-01', school_total: 197, class_totals: { '10': 25 } },
        ],
      },
    }),
  ),
  getHeadcountOn: vi.fn(() =>
    Promise.resolve({
      data: {
        date: '2026-09-01',
        school_total: 197,
        school_male: 100,
        school_female: 97,
        school_on_leave: 0,
        classes: [
          {
            classroom_id: 10,
            class_name: '小班A',
            grade_name: '小班',
            total: 25,
            male: 13,
            female: 12,
            on_leave: 0,
          },
        ],
      },
    }),
  ),
}))

vi.mock('@/composables/useChartJs', () => ({
  LineChart: { name: 'LineChart', template: '<div class="stub-line-chart" />' },
}))

const mountPanel = () =>
  mount(EnrollmentLedgerPanel, { global: { plugins: [ElementPlus] } })

describe('EnrollmentLedgerPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('頁面上沒有任何拍照或快照字樣——這是本次改版的核心', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.text()).not.toContain('拍照')
    expect(wrapper.text()).not.toContain('快照')
  })

  it('對帳不符時顯示警示橫幅，並同時說出兩個數字', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const banner = wrapper.find('[data-testid="reconcile-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('197')
    expect(banner.text()).toContain('198')
  })

  it('逐筆列出異動，含操作者與原因', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('王小明')
    expect(text).toContain('陳主任')
    expect(text).toContain('新生報名')
    expect(text).toContain('→ 小班A')
  })

  it('來源不明列標記出來，人數欄顯示問號而非 0', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const row = wrapper.find('.sentinel-row')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('來源不明')
    expect(row.text()).toContain('?')
  })

  it('日期修正的前後值顯示在主表格，不必點開才看得到', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    // 使用者裁定「要標出前後值」——藏在展開區等於沒標
    expect(wrapper.find('.sentinel-row').text()).toContain(
      '入學日 2026-09-01 → 2026-08-15',
    )
  })

  it('畫出趨勢圖', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.find('.stub-line-chart').exists()).toBe(true)
  })

  it('載入時同時取帳、對帳與趨勢三份資料', async () => {
    const api = await import('@/api/studentEnrollment')
    mountPanel()
    await flushPromises()
    expect(api.getEnrollmentLedger).toHaveBeenCalled()
    expect(api.getLedgerReconcile).toHaveBeenCalled()
    expect(api.getLedgerTrend).toHaveBeenCalled()
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
    const wrapper = mountPanel()
    await flushPromises()
    const banner = wrapper.find('[data-testid="reconcile-banner"]')
    expect(banner.text()).toContain('尚未起帳')
    expect(banner.text()).toContain('196')
  })
})
