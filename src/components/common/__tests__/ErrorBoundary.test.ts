import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref, nextTick, h } from 'vue'
import ErrorBoundary from '@/components/common/ErrorBoundary.vue'

// Sentry captureException 應被呼叫，但不應傳染回 boundary
vi.mock('@/utils/sentry', () => ({
  captureException: vi.fn(() => Promise.resolve()),
}))

import { captureException } from '@/utils/sentry'

/**
 * 會在 render 期間 throw 的子元件。
 * shouldThrow 由外部 ref 控制：true → render throw；false → 正常渲染。
 * 用於模擬「重試後子元件恢復」場景。
 */
function makeThrowingChild(shouldThrow: { value: boolean }) {
  return defineComponent({
    name: 'ThrowingChild',
    setup() {
      return () => {
        if (shouldThrow.value) {
          throw new Error('boom in render')
        }
        return h('div', { class: 'child-ok' }, 'child rendered ok')
      }
    },
  })
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    vi.clearAllMocks()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('子元件正常時，原樣渲染 default slot，不顯示 fallback', () => {
    const shouldThrow = ref(false)
    const Child = makeThrowingChild(shouldThrow)
    const wrapper = mount(ErrorBoundary, {
      slots: { default: () => h(Child) },
    })
    expect(wrapper.find('.child-ok').exists()).toBe(true)
    expect(wrapper.find('[data-testid="error-boundary-fallback"]').exists()).toBe(false)
  })

  it('子元件 render throw 時，顯示 fallback UI 而非把錯誤往上拋', async () => {
    const shouldThrow = ref(true)
    const Child = makeThrowingChild(shouldThrow)
    // mount 不應 throw（boundary 攔截）
    const wrapper = mount(ErrorBoundary, {
      slots: { default: () => h(Child) },
    })
    // onErrorCaptured 設 reactive state，re-render 在下一 tick
    await nextTick()
    const fallback = wrapper.find('[data-testid="error-boundary-fallback"]')
    expect(fallback.exists()).toBe(true)
    // 子元件錯誤內容不應殘留
    expect(wrapper.find('.child-ok').exists()).toBe(false)
    // 顯示重試按鈕
    expect(wrapper.find('[data-testid="error-boundary-retry"]').exists()).toBe(true)
  })

  it('捕捉到錯誤時呼叫 console.error 與 Sentry captureException', () => {
    const shouldThrow = ref(true)
    const Child = makeThrowingChild(shouldThrow)
    mount(ErrorBoundary, {
      slots: { default: () => h(Child) },
    })
    expect(consoleErrorSpy).toHaveBeenCalled()
    expect(captureException).toHaveBeenCalledTimes(1)
  })

  it('點重試會重置狀態並重新嘗試渲染（子元件已恢復則顯示正常內容）', async () => {
    const shouldThrow = ref(true)
    const Child = makeThrowingChild(shouldThrow)
    const wrapper = mount(ErrorBoundary, {
      slots: { default: () => h(Child) },
    })
    await nextTick()
    expect(wrapper.find('[data-testid="error-boundary-fallback"]').exists()).toBe(true)

    // 子元件恢復 → 點重試
    shouldThrow.value = false
    await wrapper.find('[data-testid="error-boundary-retry"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="error-boundary-fallback"]').exists()).toBe(false)
    expect(wrapper.find('.child-ok').exists()).toBe(true)
  })

  it('支援 variant prop（admin / parent）以對齊各自設計系統', async () => {
    const shouldThrow = ref(true)
    const Child = makeThrowingChild(shouldThrow)
    const wrapper = mount(ErrorBoundary, {
      props: { variant: 'parent' },
      slots: { default: () => h(Child) },
    })
    await nextTick()
    const fallback = wrapper.find('[data-testid="error-boundary-fallback"]')
    expect(fallback.exists()).toBe(true)
    expect(fallback.classes()).toContain('error-boundary--parent')
  })
})
