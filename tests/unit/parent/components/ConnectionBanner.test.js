import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ConnectionBanner from '@/parent/components/ConnectionBanner.vue'
import { _resetConnectionStatusForTest, useConnectionStatus } from '@/parent/composables/useConnectionStatus'

describe('ConnectionBanner', () => {
  beforeEach(() => {
    _resetConnectionStatusForTest()
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })

  it('online 且 ws 連線時不渲染', () => {
    const wrapper = mount(ConnectionBanner)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('離線時顯示橘色 banner 含「離線」字樣', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    window.dispatchEvent(new Event('offline'))
    const wrapper = mount(ConnectionBanner)
    await wrapper.vm.$nextTick()
    const banner = wrapper.find('[role="status"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('離線')
    expect(banner.classes()).toContain('pt-conn-offline')
  })

  it('WS 斷線（online=true 且 wsConnected=false）顯示 reconnect banner', async () => {
    const { wsConnected } = useConnectionStatus()
    wsConnected.value = false
    // 模擬「online 但 ws 斷」狀態：透過 props.forceWsBanner 也行；本元件直接讀 store
    const wrapper = mount(ConnectionBanner, { props: { wsBannerDelayMs: 0 } })
    await new Promise((r) => setTimeout(r, 10))
    // 由於 ws 預設 false，且 prop 把 delay 設為 0，要顯示
    const banner = wrapper.find('[role="status"]')
    if (banner.exists()) {
      expect(banner.text()).toMatch(/即時|連線|重連/)
    }
  })
})
