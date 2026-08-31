import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import ElementPlus from 'element-plus'

// Mock 形狀抄真實契約（schema.d.ts）：
// - CycleOut.semester 是字串 enum 'FIRST'|'SECOND'（非數字 1/2）
// - getYearEndGrid / previewAppraisalPayout 回傳裸陣列（非 { rows: [...] } 包一層）
// listAppraisalCycles 為新增（WorkbenchCyclesSidebar 側欄元件自抓，Task 1 已建）。
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
  listAppraisalCycles: vi.fn(() =>
    Promise.resolve({ data: [{ id: 7, academic_year: 114, semester: 'SECOND', status: 'OPEN' }] }),
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
import { getSignStatusSummary, getAppraisalCurrentCycle, getAppraisalCycleExceptions } from '@/api/appraisal'
import { getYearEndGrid, getYearEndCycleExceptions, previewAppraisalPayout } from '@/api/yearEnd'
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

  it('待辦清單依優先序列出考核/年終待簽項目', async () => {
    const w = mountView()
    await flushPromises()
    const list = w.find('[data-test="wb-todo-list"]')
    // DRAFT10+SUPERVISOR_SIGNED5+ACCOUNTING_SIGNED3 = 18 筆未核定（考核）
    expect(list.text()).toContain('考核還有 18 筆未核定')
    // grid 2 列中 1 列非 FINALIZED（年終）——年終週期 status=OPEN 故此項目會出現
    expect(list.text()).toContain('年終結算還有 1 筆未核定')
  })

  it('待辦清單為空時顯示「沒有待處理事項」', async () => {
    // 四個資料來源都覆寫成「已全數處理完」的數值：考核簽核全數 FINALIZED、
    // 年終結算表為空（沒有任何非 FINALIZED 列）、兩邊例外皆無 items、
    // 可發放筆數為 0（previewAppraisalPayout 沿用預設 mock 空陣列）。
    vi.mocked(getSignStatusSummary).mockResolvedValueOnce({
      data: { cycle_id: 7, counts: { FINALIZED: 10 }, buckets: [] },
    } as never)
    vi.mocked(getYearEndGrid).mockResolvedValueOnce({ data: [] } as never)
    vi.mocked(getAppraisalCycleExceptions).mockResolvedValueOnce({
      data: { cycle_id: 7, generated_at: '2026-07-10T00:00:00Z', counts_by_type: {}, items: [] },
    } as never)
    vi.mocked(getYearEndCycleExceptions).mockResolvedValueOnce({
      data: { cycle_id: 3, generated_at: '2026-07-10T00:00:00Z', counts_by_type: {}, items: [] },
    } as never)
    vi.mocked(previewAppraisalPayout).mockResolvedValueOnce({ data: [] } as never)

    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="wb-todo-list-empty"]').exists()).toBe(true)
    expect(w.find('[data-test="wb-todo-list-empty"]').text()).toContain('沒有待處理事項')
  })

  it('無 APPRAISAL_READ 權限 → 待辦清單不含考核相關項目', async () => {
    vi.mocked(hasPermission).mockImplementation((p: string) => p !== 'APPRAISAL_READ')
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="wb-todo-list"]').text()).not.toContain('考核還有')
  })

  it('進行中的週期側欄渲染考核與年終週期', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="wb-cycles-sidebar"]').text()).toContain('考核 114 學年下學期')
    expect(w.find('[data-test="wb-cycles-sidebar"]').text()).toContain('年終 114 學年度')
  })

  it('資料新鮮度側欄顯示極簡靜態引導', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="wb-freshness-sidebar"]').exists()).toBe(true)
  })

  it('考核根把手載入失敗 → partialError 為真，hero 卡顯示「重試全部」', async () => {
    vi.mocked(getAppraisalCurrentCycle).mockRejectedValueOnce(new Error('boom'))
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="next-step-retry-all"]').exists()).toBe(true)
  })

  it('點擊「重試全部」後恢復正常（partialError 消失）', async () => {
    vi.mocked(getAppraisalCurrentCycle).mockRejectedValueOnce(new Error('boom'))
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="next-step-retry-all"]').exists()).toBe(true)
    await w.find('[data-test="next-step-retry-all"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="next-step-retry-all"]').exists()).toBe(false)
  })

  it('無 APPRAISAL_FINALIZE 權限時不呼叫 previewAppraisalPayout（避免無權限使用者觸發此 API）', async () => {
    vi.mocked(hasPermission).mockImplementation((p: string) => p !== 'APPRAISAL_FINALIZE')
    mountView()
    await flushPromises()
    expect(previewAppraisalPayout).not.toHaveBeenCalled()
  })
})
