import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// 審核工作台「其他待簽」（後台 IA 重整 W2，2026-10-29）：
// 可見性＝原頁路由 gate（canAccessRoute）；計數只用既有摘要／帶 total 的 API；
// 載入失敗顯示「—」並保留連結，不可當成 0；沒有取數權限只放連結。
const { authState } = vi.hoisted(() => ({
  authState: { routes: new Set<string>(), perms: new Set<string>() },
}))
vi.mock('@/utils/auth', () => ({
  canAccessRoute: (path: string) => authState.routes.has(path),
  hasPermission: (name: string) => authState.perms.has(name),
}))

const pushMock = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushMock }) }))

const currentCycleMock = vi.fn()
const signStatusMock = vi.fn()
vi.mock('@/api/appraisal', () => ({
  getAppraisalCurrentCycle: (...a: unknown[]) => currentCycleMock(...a),
  getSignStatusSummary: (...a: unknown[]) => signStatusMock(...a),
}))
const vendorSummaryMock = vi.fn()
vi.mock('@/api/vendorPayment', () => ({ getVendorPaymentSummary: (...a: unknown[]) => vendorSummaryMock(...a) }))
const miscSummaryMock = vi.fn()
vi.mock('@/api/miscReceipt', () => ({ getMiscReceiptSummary: (...a: unknown[]) => miscSummaryMock(...a) }))
const handoversMock = vi.fn()
const closeSummaryMock = vi.fn()
const closePeriodsMock = vi.fn()
vi.mock('@/api/fees', () => ({
  getCashHandovers: (...a: unknown[]) => handoversMock(...a),
  getCloseSummary: (...a: unknown[]) => closeSummaryMock(...a),
  getClosePeriods: (...a: unknown[]) => closePeriodsMock(...a),
}))
const posPendingMock = vi.fn()
vi.mock('@/api/activity', () => ({ getPOSDailyClosePending: (...a: unknown[]) => posPendingMock(...a) }))

// 固定「今天」，讓上月判定可預期（2026-10-29 → 上月 2026-09）
vi.mock('@/utils/format', () => ({ todayTaipeiISO: () => '2026-10-29' }))

import OtherSignoffsStrip from '../OtherSignoffsStrip.vue'

const ALL_ROUTES = ['/appraisal-year-end/todo', '/finance-signoffs', '/fees', '/activity/pos/approval']
const ALL_PERMS = ['APPRAISAL_READ', 'VENDOR_PAYMENT_READ', 'MISC_RECEIPT_READ']

const STUBS = {
  'el-card': { template: '<div><slot /></div>' },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-icon': true,
}
const mountStrip = () => mount(OtherSignoffsStrip, { global: { stubs: STUBS } })

function mockAllOk() {
  currentCycleMock.mockResolvedValue({ data: { id: 7, academic_year: 114, semester: 'FIRST' } })
  signStatusMock.mockResolvedValue({ data: { counts: { DRAFT: 3, SUPERVISOR_SIGNED: 2, FINALIZED: 10 } } })
  vendorSummaryMock.mockResolvedValue({ data: { pending_approval_count: 4 } })
  miscSummaryMock.mockResolvedValue({ data: { pending_approval_count: 1 } })
  handoversMock.mockResolvedValue({ total: 2, items: [] })
  closeSummaryMock.mockResolvedValue({ owner: { pending_refunds: 3 }, checklist: {} })
  closePeriodsMock.mockResolvedValue({
    items: [{ close_year: 2026, close_month: 9, status: 'closed' }],
    total: 1,
  })
  posPendingMock.mockResolvedValue({
    data: { pending: [{ date: '2026-10-27' }, { date: '2026-10-28' }], older_pending_count: 0, oldest_pending_date: null },
  })
}

const text = (w: ReturnType<typeof mountStrip>, key: string) => w.get(`[data-test="signoff-${key}"]`).text()

describe('OtherSignoffsStrip', () => {
  beforeEach(() => {
    authState.routes = new Set(ALL_ROUTES)
    authState.perms = new Set(ALL_PERMS)
    pushMock.mockReset()
    for (const m of [currentCycleMock, signStatusMock, vendorSummaryMock, miscSummaryMock, handoversMock, closeSummaryMock, closePeriodsMock, posPendingMock]) {
      m.mockReset()
    }
    mockAllOk()
  })

  it('四項依原頁 gate 顯示，各連到原頁', async () => {
    const w = mountStrip()
    await flushPromises()
    for (const [key, to] of [
      ['appraisal', '/appraisal-year-end/todo'],
      ['finance', '/finance-signoffs'],
      ['fees-close', '/fees'],
      ['pos-daily-close', '/activity/pos/approval'],
    ]) {
      await w.get(`[data-test="goto-${key}"]`).trigger('click')
      expect(pushMock).toHaveBeenLastCalledWith(to)
    }
  })

  it('計數：考核未核定、收付款待核准（兩模組合計）、學費月結三類、POS 日結', async () => {
    const w = mountStrip()
    await flushPromises()
    // 考核：3+2 未核定（FINALIZED 不算）
    expect(text(w, 'appraisal')).toContain('5 人')
    expect(signStatusMock).toHaveBeenCalledWith(7)
    // 收付款：廠商 4 + 雜項 1
    expect(text(w, 'finance')).toContain('5 筆')
    expect(text(w, 'finance')).toContain('廠商付款 4')
    expect(text(w, 'finance')).toContain('雜項收款 1')
    // 學費：上月已關帳(0) + 交接 2 + 退款 3
    expect(text(w, 'fees-close')).toContain('5 項')
    expect(handoversMock).toHaveBeenCalledWith({ status: 'submitted', limit: 1 })
    expect(closeSummaryMock).toHaveBeenCalledWith(2026, 10)
    expect(text(w, 'fees-close')).toContain('現金交接 2 批待簽收')
    expect(text(w, 'fees-close')).toContain('預繳退款 3 筆待處理')
    expect(text(w, 'fees-close')).not.toContain('尚未關帳')
    // POS
    expect(text(w, 'pos-daily-close')).toContain('2 日')
  })

  it('學費月結：上月未關帳算 1 項並點名上月', async () => {
    closePeriodsMock.mockResolvedValue({ items: [{ close_year: 2026, close_month: 9, status: 'reopened' }], total: 1 })
    handoversMock.mockResolvedValue({ total: 0, items: [] })
    closeSummaryMock.mockResolvedValue({ owner: { pending_refunds: 0 } })
    const w = mountStrip()
    await flushPromises()
    expect(text(w, 'fees-close')).toContain('1 項')
    expect(text(w, 'fees-close')).toContain('上個月（2026-09）尚未關帳')
  })

  it('學費月結：全部乾淨顯示 0', async () => {
    handoversMock.mockResolvedValue({ total: 0, items: [] })
    closeSummaryMock.mockResolvedValue({ owner: { pending_refunds: 0 } })
    const w = mountStrip()
    await flushPromises()
    expect(text(w, 'fees-close')).toContain('0 項')
    expect(text(w, 'fees-close')).toContain('沒有待老闆簽核的項目')
  })

  it('POS 日結：含更早的未簽核日', async () => {
    posPendingMock.mockResolvedValue({
      data: { pending: [{ date: '2026-10-28' }], older_pending_count: 4, oldest_pending_date: '2026-06-01' },
    })
    const w = mountStrip()
    await flushPromises()
    expect(text(w, 'pos-daily-close')).toContain('5 日')
    expect(text(w, 'pos-daily-close')).toContain('另有 4 天更早')
    expect(text(w, 'pos-daily-close')).toContain('2026-06-01')
  })

  it('考核：沒有進行中的週期＝0 且不再查簽核狀態', async () => {
    currentCycleMock.mockResolvedValue({ data: null })
    const w = mountStrip()
    await flushPromises()
    expect(text(w, 'appraisal')).toContain('0 人')
    expect(signStatusMock).not.toHaveBeenCalled()
  })

  it('沒有原頁 gate 的項目不顯示、也不打它的 API', async () => {
    authState.routes = new Set(['/activity/pos/approval'])
    const w = mountStrip()
    await flushPromises()
    expect(w.find('[data-test="signoff-appraisal"]').exists()).toBe(false)
    expect(w.find('[data-test="signoff-finance"]').exists()).toBe(false)
    expect(w.find('[data-test="signoff-fees-close"]').exists()).toBe(false)
    expect(w.find('[data-test="signoff-pos-daily-close"]').exists()).toBe(true)
    expect(currentCycleMock).not.toHaveBeenCalled()
    expect(vendorSummaryMock).not.toHaveBeenCalled()
    expect(handoversMock).not.toHaveBeenCalled()
  })

  it('一項都沒有 gate：整個區塊不出現', async () => {
    authState.routes = new Set()
    const w = mountStrip()
    await flushPromises()
    expect(w.find('[data-test="other-signoffs"]').exists()).toBe(false)
  })

  it('進得了待辦頁但沒有 APPRAISAL_READ：只放連結、不打簽核狀態 API', async () => {
    authState.perms = new Set(ALL_PERMS.filter((p) => p !== 'APPRAISAL_READ'))
    const w = mountStrip()
    await flushPromises()
    expect(w.find('[data-test="signoff-appraisal"] [data-test="count-ok"]').exists()).toBe(false)
    expect(w.find('[data-test="signoff-appraisal"] [data-test="count-error"]').exists()).toBe(false)
    expect(w.find('[data-test="goto-appraisal"]').exists()).toBe(true)
    expect(currentCycleMock).not.toHaveBeenCalled()
  })

  it('收付款只持單邊讀取碼：只打那一邊的摘要', async () => {
    authState.perms = new Set(['APPRAISAL_READ', 'MISC_RECEIPT_READ'])
    const w = mountStrip()
    await flushPromises()
    expect(vendorSummaryMock).not.toHaveBeenCalled()
    expect(miscSummaryMock).toHaveBeenCalledTimes(1)
    expect(text(w, 'finance')).toContain('1 筆')
    expect(text(w, 'finance')).not.toContain('廠商付款')
  })

  it('載入失敗：顯示「—」＋失敗說明、保留連結，不是 0；其他項不受影響', async () => {
    posPendingMock.mockRejectedValue(new Error('boom'))
    vendorSummaryMock.mockRejectedValue(new Error('boom'))
    const w = mountStrip()
    await flushPromises()
    for (const key of ['pos-daily-close', 'finance']) {
      const card = w.get(`[data-test="signoff-${key}"]`)
      expect(card.get('[data-test="count-error"]').text()).toBe('—')
      expect(card.find('[data-test="count-ok"]').exists()).toBe(false)
      expect(card.text()).toContain('件數載入失敗')
      expect(card.find(`[data-test="goto-${key}"]`).exists()).toBe(true)
    }
    expect(text(w, 'appraisal')).toContain('5 人')
  })

  it('學費月結任一支失敗＝整項失敗（不能只用部分數字）', async () => {
    closeSummaryMock.mockRejectedValue(new Error('403'))
    const w = mountStrip()
    await flushPromises()
    expect(w.get('[data-test="signoff-fees-close"] [data-test="count-error"]').text()).toBe('—')
  })

  it('回應欄位缺漏當成失敗，不補 0', async () => {
    handoversMock.mockResolvedValue({ items: [] }) // 沒有 total
    vendorSummaryMock.mockResolvedValue({ data: {} }) // 沒有 pending_approval_count
    const w = mountStrip()
    await flushPromises()
    expect(w.find('[data-test="signoff-fees-close"] [data-test="count-error"]').exists()).toBe(true)
    expect(w.find('[data-test="signoff-finance"] [data-test="count-error"]').exists()).toBe(true)
  })

  it('有失敗時出現「重新載入」，按了重打並恢復', async () => {
    posPendingMock.mockRejectedValueOnce(new Error('boom'))
    const w = mountStrip()
    await flushPromises()
    expect(w.find('[data-test="signoff-pos-daily-close"] [data-test="count-error"]').exists()).toBe(true)
    await w.get('[data-test="other-signoffs-retry"]').trigger('click')
    await flushPromises()
    expect(w.get('[data-test="signoff-pos-daily-close"]').text()).toContain('2 日')
    expect(w.find('[data-test="other-signoffs-retry"]').exists()).toBe(false)
  })
})
