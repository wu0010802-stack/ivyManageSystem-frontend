/**
 * AssistantView 三態視覺一致性測試（F8）。
 *
 * 修前：loading/empty 用自製 inline `<div class="hint">` 文案，與其餘 view
 * 統一採用的 SkeletonBlock/EmptyState 視覺語言不一致（非功能性缺陷，純一致性債）。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'

const loadingRef = ref(false)
const faqRef = ref<Record<string, unknown> | null>(null)
const loadMock = vi.fn()

vi.mock('@/parent/composables/useFaq', () => ({
  useFaq: () => ({ faq: faqRef, loading: loadingRef, load: loadMock }),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import AssistantView from '@/parent/views/AssistantView.vue'

describe('AssistantView 三態（F8）', () => {
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
})
