import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import ElementPlus from 'element-plus'

// Mock 形狀抄真實契約（schema.d.ts，非 brief 原始碼；兩處已修正，見 task-6-report.md）：
// - CycleOut.semester 是字串 enum 'FIRST'|'SECOND'（非數字 1/2）
// - getYearEndGrid / previewAppraisalPayout 回傳裸陣列（非 { rows: [...] } 包一層）
vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn(() => true) }))

vi.mock('@/api/appraisal', () => ({
  getAppraisalCurrentCycle: vi.fn(() =>
    Promise.resolve({ data: { id: 7, academic_year: 114, semester: 'SECOND', status: 'OPEN' } }),
  ),
  getSignStatusSummary: vi.fn(() =>
    Promise.resolve({
      data: {
        cycle_id: 7,
        counts: { DRAFT: 10, SUPERVISOR_SIGNED: 5, ACCOUNTING_SIGNED: 3, FINALIZED: 2 },
        buckets: [],
      },
    }),
  ),
  getAppraisalCycleExceptions: vi.fn(() =>
    Promise.resolve({ data: { cycle_id: 7, generated_at: '2026-07-10T00:00:00Z', counts_by_type: {}, items: [] } }),
  ),
}))

vi.mock('@/api/yearEnd', () => ({
  listYearEndCycles: vi.fn(() =>
    Promise.resolve({ data: [{ id: 3, academic_year: 114, bonus_calc_date: '2026-01-15', status: 'OPEN' }] }),
  ),
  getYearEndGrid: vi.fn(() =>
    Promise.resolve({
      data: [
        { settlement_id: 1, employee_id: 1, employee_name: '王小明', status: 'DRAFT', payable_amount: '10000', total_amount: '10000', special_bonuses: {} },
        { settlement_id: 2, employee_id: 2, employee_name: '陳小華', status: 'FINALIZED', payable_amount: '20000', total_amount: '20000', special_bonuses: {} },
      ],
    }),
  ),
  getYearEndCycleExceptions: vi.fn(() =>
    Promise.resolve({
      data: {
        cycle_id: 3,
        generated_at: '2026-07-10T00:00:00Z',
        counts_by_type: { qualification: 1 },
        items: [
          { type: 'qualification', severity: 'warning', entity_type: 'employee', entity_id: '1', target_name: '王小明', reason: '', impact: '', suggested_action: '', deep_link: '' },
        ],
      },
    }),
  ),
  previewAppraisalPayout: vi.fn(() => Promise.resolve({ data: [] })),
}))

import OverviewWorkbenchView from '../OverviewWorkbenchView.vue'
import { getSignStatusSummary } from '@/api/appraisal'
import { hasPermission } from '@/utils/auth'

const mountView = () =>
  mount(OverviewWorkbenchView, {
    global: { plugins: [ElementPlus], stubs: { 'router-link': RouterLinkStub } },
  })

describe('OverviewWorkbenchView', () => {
  beforeEach(() => {
    vi.mocked(hasPermission).mockReset()
    vi.mocked(hasPermission).mockReturnValue(true)
  })

  it('考核卡顯示簽核進度、年終卡顯示待簽核數、例外卡顯示計數', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('草稿 10')
    expect(w.text()).toContain('已核定 2 / 共 20')
    expect(w.text()).toContain('待簽核 1') // grid 2 列中 1 列非 FINALIZED
    expect(w.text()).toContain('例外待辦')
    expect(w.text()).toContain('考核 0 筆 / 年終 1 筆')
  })

  it('單卡 API 失敗 → 該卡顯示重試，其他卡不受影響', async () => {
    vi.mocked(getSignStatusSummary).mockRejectedValueOnce(new Error('boom'))
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="appraisal-card"]').text()).toContain('載入失敗')
    expect(w.find('[data-test="year-end-card"]').text()).toContain('待簽核')
  })

  it('無 APPRAISAL_READ 權限 → 不渲染考核卡，其餘卡仍渲染', async () => {
    vi.mocked(hasPermission).mockImplementation((p: string) => p !== 'APPRAISAL_READ')
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="appraisal-card"]').exists()).toBe(false)
    expect(w.find('[data-test="year-end-card"]').exists()).toBe(true)
    // 例外卡權限規則為 APPRAISAL_READ || YEAR_END_READ，YEAR_END_READ 仍 true 故仍渲染
    expect(w.find('[data-test="exceptions-card"]').exists()).toBe(true)
  })

  it('無任何權限 → 四張卡皆不渲染', async () => {
    vi.mocked(hasPermission).mockReturnValue(false)
    const w = mountView()
    await flushPromises()
    expect(w.findAll('.wb-card').length).toBe(0)
  })

  it('年終週期 status=OPEN 時，年終卡排在考核卡之前', async () => {
    const w = mountView()
    await flushPromises()
    const cards = w.findAll('.wb-card')
    expect(cards[0].attributes('data-test')).toBe('year-end-card')
    expect(cards[1].attributes('data-test')).toBe('appraisal-card')
  })

  it('發放卡顯示可發放筆數與合計金額', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="payout-card"]').text()).toContain('可發放 0 筆')
  })
})
