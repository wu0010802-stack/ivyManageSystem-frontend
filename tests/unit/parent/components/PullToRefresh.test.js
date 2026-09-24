import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PullToRefresh from '@/parent/components/PullToRefresh.vue'

/**
 * happy-dom 的 TouchEvent 較陽春；以 Event + 自己注入 touches 模擬。
 * 測試重點：
 *  1. scrollY > 0 時不觸發 pull
 *  2. 拉動 < threshold 鬆手 → 不觸發 onRefresh
 *  3. 拉動 >= threshold 鬆手 → 觸發 onRefresh，等到 promise 完成才收
 *  4. disabled prop 完全停用
 *  5. 多 touch 與 touchcancel 取消
 */

function makeTouchEvent(type, clientY, opts = {}) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  // happy-dom 不提供 touches；自己塞
  Object.defineProperty(e, 'touches', {
    value: clientY === null ? [] : [{ clientY }],
    configurable: true,
  })
  e.preventDefault = vi.fn(opts.preventDefaultImpl)
  return e
}

function setScrollY(y) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
  Object.defineProperty(document.documentElement, 'scrollTop', { value: y, configurable: true })
}

describe('PullToRefresh', () => {
  beforeEach(() => {
    setScrollY(0)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('scrollY > 0 時下拉不觸發 onRefresh（不吃掉中段滾動）', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    setScrollY(120)
    const wrapper = mount(PullToRefresh, {
      props: { onRefresh },
      slots: { default: '<div class="content">x</div>' },
      attachTo: document.body,
    })
    await flushPromises()

    const root = wrapper.find('.ptr-root').element
    root.dispatchEvent(makeTouchEvent('touchstart', 100))
    root.dispatchEvent(makeTouchEvent('touchmove', 200))
    root.dispatchEvent(makeTouchEvent('touchend', 200))
    await flushPromises()

    expect(onRefresh).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('拉動 < threshold 鬆手 → 不觸發 onRefresh，pullDistance 歸零', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const wrapper = mount(PullToRefresh, {
      props: { onRefresh, threshold: 64 },
      slots: { default: '<div class="content">x</div>' },
      attachTo: document.body,
    })
    await flushPromises()

    const root = wrapper.find('.ptr-root').element
    root.dispatchEvent(makeTouchEvent('touchstart', 100))
    // 拉到 dy=40，阻尼後應 < 64
    root.dispatchEvent(makeTouchEvent('touchmove', 140))
    root.dispatchEvent(makeTouchEvent('touchend', 140))
    await flushPromises()

    expect(onRefresh).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('拉動超過 threshold 鬆手 → 觸發 onRefresh，refreshing 狀態維持到 promise resolve', async () => {
    let resolveRefresh
    const onRefresh = vi.fn(() => new Promise((r) => { resolveRefresh = r }))
    const wrapper = mount(PullToRefresh, {
      props: { onRefresh, threshold: 60 },
      slots: { default: '<div class="content">x</div>' },
      attachTo: document.body,
    })
    await flushPromises()

    const root = wrapper.find('.ptr-root').element
    root.dispatchEvent(makeTouchEvent('touchstart', 100))
    // dy=300，阻尼後仍 >= 60
    root.dispatchEvent(makeTouchEvent('touchmove', 400))
    root.dispatchEvent(makeTouchEvent('touchend', 400))
    await flushPromises()

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.ptr-root').classes()).toContain('is-refreshing')

    // resolve 後 indicator 收回
    resolveRefresh()
    await flushPromises()
    expect(wrapper.find('.ptr-root').classes()).not.toContain('is-refreshing')

    wrapper.unmount()
  })

  it('disabled=true 時即使滿足條件也不觸發 onRefresh', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const wrapper = mount(PullToRefresh, {
      props: { onRefresh, disabled: true, threshold: 60 },
      slots: { default: '<div class="content">x</div>' },
      attachTo: document.body,
    })
    await flushPromises()

    const root = wrapper.find('.ptr-root').element
    root.dispatchEvent(makeTouchEvent('touchstart', 100))
    root.dispatchEvent(makeTouchEvent('touchmove', 400))
    root.dispatchEvent(makeTouchEvent('touchend', 400))
    await flushPromises()

    expect(onRefresh).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('touchcancel 取消下拉，不觸發 onRefresh', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const wrapper = mount(PullToRefresh, {
      props: { onRefresh, threshold: 60 },
      slots: { default: '<div class="content">x</div>' },
      attachTo: document.body,
    })
    await flushPromises()

    const root = wrapper.find('.ptr-root').element
    root.dispatchEvent(makeTouchEvent('touchstart', 100))
    root.dispatchEvent(makeTouchEvent('touchmove', 400))
    root.dispatchEvent(makeTouchEvent('touchcancel', null))
    await flushPromises()

    // touchcancel 後即使再 touchend 也不該觸發
    root.dispatchEvent(makeTouchEvent('touchend', 400))
    await flushPromises()

    expect(onRefresh).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('onRefresh handler 拋錯也會清理 refreshing 狀態（不卡住 UI）', async () => {
    const onRefresh = vi.fn(() => Promise.reject(new Error('boom')))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mount(PullToRefresh, {
      props: { onRefresh, threshold: 60 },
      slots: { default: '<div class="content">x</div>' },
      attachTo: document.body,
    })
    await flushPromises()

    const root = wrapper.find('.ptr-root').element
    root.dispatchEvent(makeTouchEvent('touchstart', 100))
    root.dispatchEvent(makeTouchEvent('touchmove', 400))
    root.dispatchEvent(makeTouchEvent('touchend', 400))
    await flushPromises()

    expect(onRefresh).toHaveBeenCalled()
    expect(wrapper.find('.ptr-root').classes()).not.toContain('is-refreshing')
    warnSpy.mockRestore()
    wrapper.unmount()
  })

  it('捲離頂端時拆掉非 passive touchmove，回到頂端再掛回（中段滑動不阻塞 compositor）', async () => {
    const addSpy = vi.spyOn(HTMLElement.prototype, 'addEventListener')
    const removeSpy = vi.spyOn(HTMLElement.prototype, 'removeEventListener')
    // 同步執行 callback；回傳 0 讓 composable 的節流旗標立即釋放
    vi.stubGlobal('requestAnimationFrame', (cb) => { cb(0); return 0 })
    setScrollY(120)
    const wrapper = mount(PullToRefresh, {
      props: { onRefresh: vi.fn() },
      slots: { default: '<div>x</div>' },
      attachTo: document.body,
    })
    await flushPromises()
    const root = wrapper.find('.ptr-root').element
    // 只看非 passive 的 touchmove（@vue/test-utils 自己也會掛 emit 記錄用的 listener）
    const moveAdds = () => addSpy.mock.calls.filter(([t, , o], i) => t === 'touchmove' && o?.passive === false && addSpy.mock.contexts[i] === root)

    // 掛載時不在頂端 → 不掛 touchmove
    expect(moveAdds()).toHaveLength(0)

    // 捲回頂端 → 掛上非 passive touchmove
    setScrollY(0)
    window.dispatchEvent(new Event('scroll'))
    expect(moveAdds()).toHaveLength(1)

    // 再捲離頂端 → 拆掉
    setScrollY(300)
    window.dispatchEvent(new Event('scroll'))
    expect(removeSpy.mock.calls.some(([t], i) => t === 'touchmove' && removeSpy.mock.contexts[i] === root)).toBe(true)

    addSpy.mockRestore()
    removeSpy.mockRestore()
    wrapper.unmount()
  })

  it('靜止時內容不帶 transform（避免常駐合成層與破壞內部 fixed 定位）', async () => {
    const wrapper = mount(PullToRefresh, {
      props: { onRefresh: vi.fn() },
      slots: { default: '<div>x</div>' },
      attachTo: document.body,
    })
    await flushPromises()
    expect(wrapper.find('.ptr-content').attributes('style')).toContain('transform: none')
    wrapper.unmount()
  })

  it('往上拉（dy < 0）不應啟動 pulling', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const wrapper = mount(PullToRefresh, {
      props: { onRefresh },
      slots: { default: '<div>x</div>' },
      attachTo: document.body,
    })
    await flushPromises()

    const root = wrapper.find('.ptr-root').element
    root.dispatchEvent(makeTouchEvent('touchstart', 200))
    root.dispatchEvent(makeTouchEvent('touchmove', 100)) // dy=-100
    root.dispatchEvent(makeTouchEvent('touchend', 100))
    await flushPromises()

    expect(onRefresh).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
