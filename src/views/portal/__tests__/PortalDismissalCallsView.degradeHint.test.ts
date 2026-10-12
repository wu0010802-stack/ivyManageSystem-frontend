import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { ref } from 'vue'

/**
 * 接送通知頁「裝置提示」橫幅結構（2026-10-12 UI/UX 審查）。
 *
 * 手機版黃色橫幅原本把「點一下畫面以啟用接送提醒音」與「此裝置無法背景推播…」
 * 左右並排，各自擠成三行。改成上下各一行、左對齊，關閉鈕維持在橫幅右側。
 * jsdom 沒有版面引擎，這裡只能釘「結構」：兩段文字各自是獨立元素、同在一個
 * 垂直堆疊容器（.degrade-hint__lines）內，關閉鈕不在該容器裡。
 */

vi.mock('@/api/dismissalCalls', () => ({
  acknowledgeDismissalCall: vi.fn(),
  completeDismissalCall: vi.fn(),
  cancelPortalDismissalCall: vi.fn(),
}))

const audioUnlocked = ref(false)
vi.mock('@/composables/usePortalDismissalAlerts', () => ({
  usePortalDismissalAlerts: () => ({
    activeCalls: ref([]),
    sortedCalls: ref([]),
    loading: ref(false),
    liveAnnounce: ref(''),
    wsConnected: ref(true),
    connectionState: ref('normal'),
    connectionMessage: ref(''),
    muted: ref(false),
    audioUnlocked,
    // false → notificationPermitted 為 false → 顯示「無法背景推播」提示
    notificationSupported: ref(false),
    toggleMute: vi.fn(),
    unlockAudio: vi.fn(),
    unlockSpeech: vi.fn(),
    playAlert: vi.fn(),
    cancelPendingSpeech: vi.fn(),
    fetchCalls: vi.fn(),
    retryWebSocket: vi.fn(),
  }),
}))

import PortalDismissalCallsView from '@/views/portal/PortalDismissalCallsView.vue'

const AUDIO_TEXT = '點一下畫面以啟用接送提醒音'
const NOTIFY_TEXT = '此裝置無法背景推播，請保持 App 開啟並開啟聲音'

async function mountView() {
  const wrapper = mount(PortalDismissalCallsView, {
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('PortalDismissalCallsView 裝置提示橫幅', () => {
  beforeEach(() => {
    localStorage.clear()
    audioUnlocked.value = false
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('音效未解鎖且無推播：兩段提示是各自獨立的元素，並在同一個垂直堆疊容器內', async () => {
    const wrapper = await mountView()
    const hint = wrapper.get('.degrade-hint')
    const lines = hint.get('.degrade-hint__lines')

    const spans = lines.findAll('span')
    expect(spans).toHaveLength(2)
    expect(spans[0].text()).toBe(AUDIO_TEXT)
    expect(spans[1].text()).toBe(NOTIFY_TEXT)
    // 不再用「・」把兩段接成同一行
    expect(lines.text()).not.toContain('・')
  })

  it('關閉鈕在堆疊容器之外（維持在橫幅右側），點擊後只剩音效提示', async () => {
    const wrapper = await mountView()
    const hint = wrapper.get('.degrade-hint')
    const close = hint.get('.degrade-hint__close')

    expect(hint.get('.degrade-hint__lines').find('.degrade-hint__close').exists()).toBe(false)
    expect(close.element.parentElement).toBe(hint.element)

    await close.trigger('click')
    const lines = wrapper.get('.degrade-hint .degrade-hint__lines')
    expect(lines.text()).toContain(AUDIO_TEXT)
    expect(lines.text()).not.toContain(NOTIFY_TEXT)
  })

  it('音效已解鎖：只顯示推播提示一行', async () => {
    audioUnlocked.value = true
    const wrapper = await mountView()
    const lines = wrapper.get('.degrade-hint__lines')

    expect(lines.findAll('span')).toHaveLength(1)
    expect(lines.text()).toBe(NOTIFY_TEXT)
  })
})
