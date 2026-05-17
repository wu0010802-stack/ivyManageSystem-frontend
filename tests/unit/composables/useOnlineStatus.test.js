import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useOnlineStatus, isNetworkError } from '@/composables/useOnlineStatus'

function mountWith(onReconnect) {
  let api
  const Comp = defineComponent({
    setup() {
      api = useOnlineStatus(onReconnect)
      return () => h('div')
    },
  })
  const wrapper = mount(Comp)
  return { wrapper, api: () => api }
}

beforeEach(() => {
  // 預設恢復成 online
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
})

describe('useOnlineStatus', () => {
  it('初始值跟著 navigator.onLine', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { api, wrapper } = mountWith()
    expect(api().isOnline.value).toBe(false)
    wrapper.unmount()
  })

  it('dispatch offline → isOnline 變 false', async () => {
    const { api, wrapper } = mountWith()
    expect(api().isOnline.value).toBe(true)
    window.dispatchEvent(new Event('offline'))
    await nextTick()
    expect(api().isOnline.value).toBe(false)
    wrapper.unmount()
  })

  it('offline → online 觸發 onReconnect', async () => {
    const reconnect = vi.fn()
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { api, wrapper } = mountWith(reconnect)
    expect(api().isOnline.value).toBe(false)

    window.dispatchEvent(new Event('online'))
    await nextTick()
    expect(api().isOnline.value).toBe(true)
    expect(reconnect).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('初始就 online 時，再 dispatch online 不會重複觸發 onReconnect', async () => {
    const reconnect = vi.fn()
    const { wrapper } = mountWith(reconnect)
    window.dispatchEvent(new Event('online'))
    await nextTick()
    expect(reconnect).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('onReconnect throw 不會炸掉 listener', async () => {
    const reconnect = vi.fn(() => { throw new Error('boom') })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { api, wrapper } = mountWith(reconnect)
    window.dispatchEvent(new Event('online'))
    await nextTick()
    expect(api().isOnline.value).toBe(true)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
    wrapper.unmount()
  })

  it('unmount 後 dispatch 不再改 isOnline', async () => {
    const { api, wrapper } = mountWith()
    wrapper.unmount()
    window.dispatchEvent(new Event('offline'))
    await nextTick()
    expect(api().isOnline.value).toBe(true)
  })
})

describe('isNetworkError', () => {
  it('falsy → false', () => {
    expect(isNetworkError(null)).toBe(false)
    expect(isNetworkError(undefined)).toBe(false)
  })

  it('有 response 物件 → 視為 server 回應，不是 network error', () => {
    expect(isNetworkError({ response: { status: 500 } })).toBe(false)
  })

  it('ERR_NETWORK / ECONNABORTED / "Network Error" → true', () => {
    expect(isNetworkError({ code: 'ERR_NETWORK' })).toBe(true)
    expect(isNetworkError({ code: 'ECONNABORTED' })).toBe(true)
    expect(isNetworkError({ message: 'Network Error' })).toBe(true)
  })

  it('其他 → false', () => {
    expect(isNetworkError({ message: 'Other' })).toBe(false)
  })
})
