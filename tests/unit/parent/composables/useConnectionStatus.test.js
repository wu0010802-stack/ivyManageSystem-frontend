import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useConnectionStatus, _resetConnectionStatusForTest } from '@/parent/composables/useConnectionStatus'

describe('useConnectionStatus', () => {
  beforeEach(() => {
    _resetConnectionStatusForTest()
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })

  it('initial online 反映 navigator.onLine', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { online } = useConnectionStatus()
    expect(online.value).toBe(false)
  })

  it('window offline event 切換 online=false', () => {
    const { online } = useConnectionStatus()
    expect(online.value).toBe(true)
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    window.dispatchEvent(new Event('offline'))
    expect(online.value).toBe(false)
  })

  it('singleton：兩次 useConnectionStatus 共用 ref', () => {
    const a = useConnectionStatus()
    const b = useConnectionStatus()
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    window.dispatchEvent(new Event('offline'))
    expect(a.online.value).toBe(false)
    expect(b.online.value).toBe(false)
  })

  it('registerWs 接收 mock WS，open/close 切換 wsConnected', () => {
    const { wsConnected, registerWs } = useConnectionStatus()
    const fakeWs = {
      _handlers: {},
      addEventListener(evt, h) { this._handlers[evt] = h },
      removeEventListener() {},
    }
    registerWs(fakeWs)
    fakeWs._handlers.open?.()
    expect(wsConnected.value).toBe(true)
    fakeWs._handlers.close?.()
    expect(wsConnected.value).toBe(false)
  })
})

describe('useConnectionStatus — wsExpected（2026-08-13 全站常駐 banner 修正）', () => {
  beforeEach(() => {
    _resetConnectionStatusForTest()
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })

  function makeFakeWs() {
    return {
      _handlers: {},
      addEventListener(evt, h) { this._handlers[evt] = h },
      fire(evt) { this._handlers[evt]?.() },
    }
  }

  it('初始 wsExpected=false（沒有頁面需要 WS）', () => {
    const { wsExpected } = useConnectionStatus()
    expect(wsExpected.value).toBe(false)
  })

  it('registerWs → wsExpected=true；unregisterWs → false', () => {
    const { wsExpected, registerWs, unregisterWs } = useConnectionStatus()
    const ws = makeFakeWs()
    registerWs(ws)
    expect(wsExpected.value).toBe(true)
    unregisterWs(ws)
    expect(wsExpected.value).toBe(false)
  })

  it('unregister 非當前 socket 為 no-op，不清 wsExpected', () => {
    const { wsExpected, registerWs, unregisterWs } = useConnectionStatus()
    const oldWs = makeFakeWs()
    const newWs = makeFakeWs()
    registerWs(oldWs)
    registerWs(newWs) // 接管
    unregisterWs(oldWs) // 舊持有者晚到的 teardown
    expect(wsExpected.value).toBe(true)
  })
})
