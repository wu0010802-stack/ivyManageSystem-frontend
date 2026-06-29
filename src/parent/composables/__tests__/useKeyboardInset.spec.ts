import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { useKeyboardInset } from '../useKeyboardInset'

// 用一個宿主元件掛 composable（onMounted/onUnmounted 需在元件生命週期內）
function mountHost() {
  let api!: ReturnType<typeof useKeyboardInset>
  const Host = defineComponent({
    setup() { api = useKeyboardInset(); return () => null },
  })
  const wrapper = mount(Host)
  return { wrapper, get api() { return api } }
}

function stubVV(height: number) {
  const listeners: Record<string, (() => void)[]> = {}
  const vv = {
    height,
    addEventListener: (ev: string, cb: () => void) => { (listeners[ev] ||= []).push(cb) },
    removeEventListener: (ev: string, cb: () => void) => {
      listeners[ev] = (listeners[ev] || []).filter((f) => f !== cb)
    },
    _emit(ev: string) { (listeners[ev] || []).forEach((f) => f()) },
    _set(h: number) { vv.height = h },
  }
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
  return vv
}

afterEach(() => {
  Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true })
})

describe('useKeyboardInset', () => {
  it('初始無鍵盤時 keyboardInset 為 0', () => {
    stubVV(800)
    const { api } = mountHost()
    expect(api.keyboardInset.value).toBe(0)
  })

  it('visualViewport 縮小逾門檻 → keyboardInset 反映鍵盤高', () => {
    const vv = stubVV(800)
    const { api } = mountHost()
    vv._set(500) // 鍵盤彈出，縮 300
    vv._emit('resize')
    expect(api.keyboardInset.value).toBe(300)
  })

  it('縮小未逾門檻（<=80）視為非鍵盤 → 維持 0', () => {
    const vv = stubVV(800)
    const { api } = mountHost()
    vv._set(740) // 縮 60
    vv._emit('resize')
    expect(api.keyboardInset.value).toBe(0)
  })

  it('縮小剛好 80（邊界）視為非鍵盤', () => {
    const vv = stubVV(800)
    const { api } = mountHost()
    vv._set(720) // 縮 80
    vv._emit('resize')
    expect(api.keyboardInset.value).toBe(0)
  })

  it('鍵盤收回 → keyboardInset 歸 0', () => {
    const vv = stubVV(800)
    const { api } = mountHost()
    vv._set(500); vv._emit('resize')
    expect(api.keyboardInset.value).toBe(300)
    vv._set(800); vv._emit('resize')
    expect(api.keyboardInset.value).toBe(0)
  })

  it('unmount 後移除 resize listener', () => {
    const vv = stubVV(800)
    const spy = vi.spyOn(vv, 'removeEventListener')
    const { wrapper } = mountHost()
    wrapper.unmount()
    expect(spy).toHaveBeenCalledWith('resize', expect.any(Function))
  })

  it('unmount 後 resize 事件不再影響 keyboardInset', () => {
    const vv = stubVV(800)
    const { wrapper, api } = mountHost()
    // 先觸發鍵盤彈出
    vv._set(500)
    vv._emit('resize')
    const valueBeforeUnmount = api.keyboardInset.value
    expect(valueBeforeUnmount).toBe(300)
    // unmount 移除監聽
    wrapper.unmount()
    // 再次觸發 resize，值應保持不變（證明 handler 已移除）
    vv._set(300)
    vv._emit('resize')
    expect(api.keyboardInset.value).toBe(valueBeforeUnmount)
  })
})
