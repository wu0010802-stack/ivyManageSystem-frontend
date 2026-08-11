/**
 * AssistantView 三態視覺一致性測試（F8 + P1-2）。
 *
 * F8 修前：loading/empty 用自製 inline `<div class="hint">` 文案，與其餘 view
 * 統一採用的 SkeletonBlock/EmptyState 視覺語言不一致（非功能性缺陷，純一致性債）。
 *
 * P1-2（全分支審查抓到）：原本只解構 `{ faq, loading, load }`，`useFaq()` 的
 * `error` 沒接——真實失敗時會誤顯示「尚無常見問題」且無重試，此檔案原本的
 * 「三態」測試也只蓋到 loading/empty 兩態，測試名有誤導性。補 error 分支與
 * 對應測試後名實相符。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'

const loadingRef = ref(false)
const faqRef = ref<Record<string, unknown> | null>(null)
const errorRef = ref<unknown>(null)
const loadMock = vi.fn()

vi.mock('@/parent/composables/useFaq', () => ({
  useFaq: () => ({ faq: faqRef, loading: loadingRef, error: errorRef, load: loadMock }),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import AssistantView from '@/parent/views/AssistantView.vue'

beforeEach(() => {
  loadingRef.value = false
  faqRef.value = null
  errorRef.value = null
  loadMock.mockReset()
})

describe('AssistantView 三態（F8 + P1-2）', () => {
  it('loading 時顯示 SkeletonBlock，不顯示文字 hint', () => {
    loadingRef.value = true
    faqRef.value = null
    const w = mount(AssistantView)

    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(true)
    expect(w.text()).not.toContain('尚無常見問題')
    w.unmount()
  })

  it('無資料時顯示 EmptyState「尚無常見問題」', () => {
    loadingRef.value = false
    faqRef.value = { items: [], categories: [] }
    const w = mount(AssistantView)

    expect(w.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
    expect(w.text()).toContain('尚無常見問題')
    w.unmount()
  })

  it('搜尋無結果時顯示 EmptyState「沒有找到相關問題」', async () => {
    vi.useFakeTimers()
    loadingRef.value = false
    faqRef.value = { items: [{ id: 1, question: '怎麼請假？', answer: '到請假頁送出' }], categories: [] }
    const w = mount(AssistantView)

    await w.find('input').setValue('不存在的關鍵字')
    // AssistantSearch 對 v-model:modelValue 有 150ms debounce 才 emit
    vi.advanceTimersByTime(200)
    await nextTick()

    expect(w.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
    expect(w.text()).toContain('沒有找到相關問題')
    w.unmount()
    vi.useRealTimers()
  })

  it('P1-2 — 真實載入失敗（error 且尚無資料）時顯示 MobileErrorRetry，不誤顯示「尚無常見問題」，按重試會呼叫 load', async () => {
    loadingRef.value = false
    faqRef.value = null
    errorRef.value = { displayMessage: 'FAQ 載入失敗' }
    const w = mount(AssistantView)

    const errComp = w.findComponent({ name: 'MobileErrorRetry' })
    expect(errComp.exists()).toBe(true)
    expect(w.text()).not.toContain('尚無常見問題')
    expect(w.findComponent({ name: 'EmptyState' }).exists()).toBe(false)

    // onMounted 已呼叫過一次 load，重試按鈕再觸發一次
    expect(loadMock).toHaveBeenCalledTimes(1)
    await errComp.find('button').trigger('click')
    expect(loadMock).toHaveBeenCalledTimes(2)
    w.unmount()
  })

  it('P1-2 — 已有資料時即使背景 error，FAQ 清單仍持續顯示（不因背景錯誤而消失）', () => {
    loadingRef.value = false
    faqRef.value = { items: [{ id: 1, question: '怎麼請假？', answer: '到請假頁送出' }], categories: [] }
    errorRef.value = { displayMessage: '背景刷新失敗' }
    const w = mount(AssistantView)

    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)
    expect(w.text()).toContain('怎麼請假？')
    w.unmount()
  })
})
