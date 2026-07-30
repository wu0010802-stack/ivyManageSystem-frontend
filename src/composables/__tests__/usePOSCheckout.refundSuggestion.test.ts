import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// 2026-06-29 audit P2-B：才藝退費 UI 預填「全額已繳」與後端按出席比例建議值口徑不一致。
// 修正：退費選取時抓 GET /activity/registrations/{id}/refund-suggestion，以
// remaining_suggested_amount 預填 amount_applied（非 paid_amount、非 total_suggested），
// 避免簽核者盲簽超退，且多次退費不會把全額建議重複預填（2026-06-29 audit F1）。
// F2：建議載入失敗（reject 或缺欄位）改 fail-closed——金額歸 0 + 警告，強制人工確認。

vi.mock('@/api/activity', () => ({
  getPOSDailySummary: vi.fn(),
  getPOSOutstandingByStudent: vi.fn(),
  getPOSReceiptPdf: vi.fn(),
  getPOSRecentTransactions: vi.fn(),
  getRegistrations: vi.fn(),
  posCheckout: vi.fn(),
  getRefundSuggestion: vi.fn(),
}))

vi.mock('@/utils/auth', () => ({ hasPermission: () => false }))

vi.mock('element-plus', () => ({
  ElMessage: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), alert: vi.fn() },
}))

import { getRefundSuggestion } from '@/api/activity'
import { ElMessage } from 'element-plus'
import { usePOSCheckout } from '@/composables/usePOSCheckout'

function mountComposable() {
  let api: ReturnType<typeof usePOSCheckout>
  const wrapper = mount({
    setup() {
      api = usePOSCheckout()
      return () => null
    },
  })
  // @ts-expect-error 由 setup 賦值
  return { api: api as ReturnType<typeof usePOSCheckout>, wrapper }
}

function suggestion(total: number, items: unknown[], opts: { prior?: number; remaining?: number } = {}) {
  const prior = opts.prior ?? 0
  const remaining = opts.remaining ?? Math.max(total - prior, 0)
  return {
    data: {
      registration_id: 42,
      computed_at: '2026-06-29T00:00:00+08:00',
      total_suggested_amount: total,
      total_amount_due: 900,
      prior_refunded_amount: prior,
      remaining_suggested_amount: remaining,
      items,
    },
  } as never
}

const COURSE_ITEM = {
  type: 'course',
  target_id: 1,
  name: '美術',
  amount_due: 900,
  suggested_amount: 300,
  calc_method: 'activity_course_ratio',
  calc_payload: {},
  warnings: [],
}

describe('usePOSCheckout 退費預填建議值（P2-B / F1 / F2）', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.clearAllMocks())

  it('退費選取：預填剩餘建議額（按出席比例），非全額已繳', async () => {
    vi.mocked(getRefundSuggestion).mockResolvedValue(suggestion(300, [COURSE_ITEM]))
    const { api, wrapper } = mountComposable()
    api.checkoutType.value = 'refund'
    await flushPromises()

    api.selectItem(
      { id: 42, student_name: '王小明', total_amount: 900, paid_amount: 900 },
      '王小明',
    )
    await flushPromises()

    expect(vi.mocked(getRefundSuggestion)).toHaveBeenCalledWith(42)
    // 預填 = 剩餘建議 300（prior=0），而非全額已繳 900
    expect(api.selectedItem.value?.amount_applied).toBe(300)
    wrapper.unmount()
  })

  it('多次退費：已退 600 → 預填剩餘 300（非累積建議總額 900）', async () => {
    // F1：total_suggested=900、已退 600 → remaining=300。預填 remaining 避免再退 900 超退。
    vi.mocked(getRefundSuggestion).mockResolvedValue(
      suggestion(900, [COURSE_ITEM], { prior: 600, remaining: 300 }),
    )
    const { api, wrapper } = mountComposable()
    api.checkoutType.value = 'refund'
    await flushPromises()

    api.selectItem(
      { id: 42, student_name: '王小明', total_amount: 900, paid_amount: 300 },
      '王小明',
    )
    await flushPromises()

    expect(api.selectedItem.value?.amount_applied).toBe(300)
    wrapper.unmount()
  })

  it('建議載入失敗（reject）：fail-closed，金額歸 0 + 警告（不保留全額）', async () => {
    vi.mocked(getRefundSuggestion).mockRejectedValue(new Error('boom'))
    const { api, wrapper } = mountComposable()
    api.checkoutType.value = 'refund'
    await flushPromises()

    api.selectItem(
      { id: 42, student_name: '王小明', total_amount: 900, paid_amount: 900 },
      '王小明',
    )
    await flushPromises()

    // 失敗時不再退回全額 900，改歸 0（送出鈕因 applied<=0 被擋）+ 警告
    expect(api.selectedItem.value?.amount_applied).toBe(0)
    expect(api.canSubmit.value).toBe(false)
    expect(vi.mocked(ElMessage.warning)).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('建議回應缺 remaining_suggested_amount：fail-closed，金額歸 0 + 警告', async () => {
    vi.mocked(getRefundSuggestion).mockResolvedValue({
      data: { registration_id: 42, items: [] },
    } as never)
    const { api, wrapper } = mountComposable()
    api.checkoutType.value = 'refund'
    await flushPromises()

    api.selectItem(
      { id: 42, student_name: '王小明', total_amount: 900, paid_amount: 900 },
      '王小明',
    )
    await flushPromises()

    expect(api.selectedItem.value?.amount_applied).toBe(0)
    expect(vi.mocked(ElMessage.warning)).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('試算 pending 中切回 payment 再重選同一筆，resolve 後 amount_applied 不被覆寫', async () => {
    // 競態修復：退費模式選學生 → 試算 in-flight → 切回繳費 → 重選同一筆 → 舊試算
    // 回應落地不得覆寫繳費金額（watch(checkoutType) 遞增 refundSuggestionSeq +
    // stillCurrent() 檢查 isRefundMode 兩道防線）。
    let resolveSuggestion!: (v: unknown) => void
    const pending = new Promise((resolve) => {
      resolveSuggestion = resolve
    })
    vi.mocked(getRefundSuggestion).mockReturnValue(pending as never)

    const { api, wrapper } = mountComposable()
    api.checkoutType.value = 'refund'
    await flushPromises()

    const row = { id: 42, student_name: '王小明', total_amount: 1000, paid_amount: 900 }
    api.selectItem(row, '王小明')
    await flushPromises()
    // 試算尚未 resolve，仍 in-flight
    expect(api.refundSuggestionLoading.value).toBe(true)

    // 切回繳費模式：應使 in-flight 試算失效並復位 loading
    api.checkoutType.value = 'payment'
    await flushPromises()
    expect(api.refundSuggestionLoading.value).toBe(false)

    // 重選同一筆（此時為繳費模式）：預填欠費 owed = 1000 - 900 = 100
    api.selectItem(row, '王小明')
    await flushPromises()
    expect(api.selectedItem.value?.amount_applied).toBe(100)

    // 舊試算此時才 resolve（remaining_suggested_amount = 300）：不得覆寫繳費金額
    resolveSuggestion(suggestion(300, [COURSE_ITEM]))
    await flushPromises()
    expect(api.selectedItem.value?.amount_applied).toBe(100)

    wrapper.unmount()
  })

  it('收款模式不抓退費建議', async () => {
    const { api, wrapper } = mountComposable()
    api.checkoutType.value = 'payment'
    await flushPromises()

    api.selectItem(
      { id: 9, student_name: '李小華', total_amount: 1000, paid_amount: 200 },
      '李小華',
    )
    await flushPromises()

    expect(vi.mocked(getRefundSuggestion)).not.toHaveBeenCalled()
    // 收款預填欠費 owed = 1000 - 200 = 800
    expect(api.selectedItem.value?.amount_applied).toBe(800)
    wrapper.unmount()
  })
})
