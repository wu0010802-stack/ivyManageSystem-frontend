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
import { getSignStatusSummary, getAppraisalCurrentCycle } from '@/api/appraisal'
import { listYearEndCycles } from '@/api/yearEnd'
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
    expect(w.text()).toContain('尚未核定 1 筆') // grid 2 列中 1 列非 FINALIZED
    expect(w.text()).toContain('例外待辦')
    expect(w.text()).toContain('考核 0 筆 / 年終 1 筆')
  })

  it('單卡 API 失敗 → 該卡顯示重試，其他卡不受影響', async () => {
    vi.mocked(getSignStatusSummary).mockRejectedValueOnce(new Error('boom'))
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="appraisal-card"]').text()).toContain('載入失敗')
    expect(w.find('[data-test="year-end-card"]').text()).toContain('尚未核定')
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

  it('固定卡序：即使年終週期 status=OPEN，考核卡仍排在年終卡之前（不再依狀態換位）', async () => {
    const w = mountView()
    await flushPromises()
    const cards = w.findAll('.wb-card')
    expect(cards[0].attributes('data-test')).toBe('appraisal-card')
    expect(cards[1].attributes('data-test')).toBe('year-end-card')
  })

  it('發放卡預覽為空時顯示真空狀態（非「可發放 0 筆」文案）', async () => {
    const w = mountView()
    await flushPromises()
    const card = w.find('[data-test="payout-card"]')
    expect(card.text()).toContain('本年度尚無可發放的考核年終')
    expect(card.text()).not.toContain('可發放 0 筆')
  })

  // ── 根把手（父層 Promise.allSettled）失敗顯式化：不得誤顯「尚未建立」空狀態 ──

  it('考核根把手載入失敗 → 考核卡顯示載入失敗＋重試（非空狀態文案），年終卡照常', async () => {
    vi.mocked(getAppraisalCurrentCycle).mockRejectedValueOnce(new Error('boom'))
    const w = mountView()
    await flushPromises()
    const card = w.find('[data-test="appraisal-card"]')
    expect(card.text()).toContain('載入失敗')
    expect(card.text()).toContain('重試')
    expect(card.text()).not.toContain('尚未建立考核週期')
    expect(w.find('[data-test="year-end-card"]').text()).toContain('尚未核定 1 筆')
  })

  it('年終根把手載入失敗 → 年終卡顯示載入失敗＋重試（非空狀態文案），考核卡照常', async () => {
    vi.mocked(listYearEndCycles).mockRejectedValueOnce(new Error('boom'))
    const w = mountView()
    await flushPromises()
    const card = w.find('[data-test="year-end-card"]')
    expect(card.text()).toContain('載入失敗')
    expect(card.text()).toContain('重試')
    expect(card.text()).not.toContain('尚未建立年終週期')
    expect(w.find('[data-test="appraisal-card"]').text()).toContain('草稿 10')
  })

  it('根把手重試成功 → 卡片恢復正常渲染', async () => {
    vi.mocked(getAppraisalCurrentCycle).mockRejectedValueOnce(new Error('boom'))
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="appraisal-card"]').text()).toContain('載入失敗')
    await w.find('[data-test="appraisal-card"]').find('button').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="appraisal-card"]').text()).toContain('草稿 10')
    expect(w.find('[data-test="appraisal-card"]').text()).not.toContain('載入失敗')
  })
})
