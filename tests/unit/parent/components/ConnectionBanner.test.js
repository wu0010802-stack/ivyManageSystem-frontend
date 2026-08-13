/**
 * ConnectionBanner（2026-08-13 wsExpected 修正後的契約）。
 *
 * 舊 bug：banner 條件只看 `online && !wsConnected`，而 wsConnected 初始 false、
 * 只有娃娃車即時頁會建 WS → 除該頁外全站常駐「即時通知暫停，正在重連...」。
 * 新契約：ws banner 只在「有頁面持有 WS（wsExpected）且連不上」時顯示；
 * 沒有持有者＝沒在用，不是斷線。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ConnectionBanner from '@/parent/components/ConnectionBanner.vue'
import {
  _resetConnectionStatusForTest,
  useConnectionStatus,
} from '@/parent/composables/useConnectionStatus'

function makeFakeWs() {
  return {
    _handlers: {},
    addEventListener(evt, h) { this._handlers[evt] = h },
    fire(evt) { this._handlers[evt]?.() },
  }
}

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms))

describe('ConnectionBanner', () => {
  beforeEach(() => {
    _resetConnectionStatusForTest()
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })

  it('無任何頁面持有 WS（wsExpected=false）→ 即使過了 delay 也不顯示重連 banner（全站常駐迴歸）', async () => {
    const wrapper = mount(ConnectionBanner, { props: { wsBannerDelayMs: 0 } })
    await tick()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('registerWs 後連不上（open 未發生）→ 過 delay 顯示重連 banner', async () => {
    const { registerWs } = useConnectionStatus()
    registerWs(makeFakeWs())
    const wrapper = mount(ConnectionBanner, { props: { wsBannerDelayMs: 0 } })
    await tick()
    const banner = wrapper.find('[role="status"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('即時通知暫停')
    expect(banner.classes()).toContain('pt-conn-ws')
  })

  it('WS open 後 banner 消失；close 後（仍持有）再次顯示', async () => {
    const { registerWs } = useConnectionStatus()
    const ws = makeFakeWs()
    registerWs(ws)
    const wrapper = mount(ConnectionBanner, { props: { wsBannerDelayMs: 0 } })
    await tick()
    expect(wrapper.find('[role="status"]').exists()).toBe(true)

    ws.fire('open')
    await tick()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)

    ws.fire('close')
    await tick()
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
  })

  it('unregisterWs（頁面離開、無人接手）→ banner 消失', async () => {
    const { registerWs, unregisterWs } = useConnectionStatus()
    const ws = makeFakeWs()
    registerWs(ws)
    const wrapper = mount(ConnectionBanner, { props: { wsBannerDelayMs: 0 } })
    await tick()
    expect(wrapper.find('[role="status"]').exists()).toBe(true)

    unregisterWs(ws)
    await tick()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('離線時顯示橘色 banner 含「離線」字樣（不受 wsExpected 影響）', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    window.dispatchEvent(new Event('offline'))
    const wrapper = mount(ConnectionBanner)
    await wrapper.vm.$nextTick()
    const banner = wrapper.find('[role="status"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('離線')
    expect(banner.classes()).toContain('pt-conn-offline')
  })
})
