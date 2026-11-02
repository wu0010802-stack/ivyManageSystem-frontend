import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, reactive, nextTick } from 'vue'

// day-qa F7（2026-11-02）：家長預告接送時老師正開著聯絡簿抽屜，畫面上沒有任何可見提示
// （只有音效／語音／需授權的系統推播）；家長「已到門口」時接送卡又會自動完成而消失。
const liveAnnounce = ref('')
const route = reactive({ path: '/portal/contact-book' })
const push = vi.fn()
const close = vi.fn()

vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push }) }))
vi.mock('element-plus', () => ({ ElNotification: vi.fn(() => ({ close })) }))
vi.mock('@/composables/usePortalDismissalAlerts', () => ({
  usePortalDismissalAlerts: () => ({ liveAnnounce }),
}))

import { ElNotification } from 'element-plus'
import PortalDismissalBanner from '@/components/portal/PortalDismissalBanner.vue'

describe('PortalDismissalBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    liveAnnounce.value = ''
    route.path = '/portal/contact-book'
  })

  it('不在接送頁時，家長預告會跳出可見提醒，點一下前往接送頁', async () => {
    const wrapper = mount(PortalDismissalBanner)
    liveAnnounce.value = '預告接送：大班1班唐子瑄的家長10分鐘後會抵達'
    await nextTick()

    expect(ElNotification).toHaveBeenCalledTimes(1)
    const opts = vi.mocked(ElNotification).mock.calls[0][0] as { message: string; duration: number; onClick: () => void }
    expect(opts.message).toContain('唐子瑄')
    expect(opts.duration).toBeGreaterThan(0)
    opts.onClick()
    expect(push).toHaveBeenCalledWith('/portal/dismissal-calls')
    wrapper.unmount()
  })

  it('「家長已到門口」的提醒不自動關閉', async () => {
    const wrapper = mount(PortalDismissalBanner)
    liveAnnounce.value = '唐子瑄家長已到門口，請準備放學'
    await nextTick()
    const opts = vi.mocked(ElNotification).mock.calls[0][0] as { duration: number; title: string }
    expect(opts.duration).toBe(0)
    expect(opts.title).toContain('已到門口')
    wrapper.unmount()
  })

  it('已經在接送頁就不重複跳提醒；切到接送頁時關掉現有提醒', async () => {
    const wrapper = mount(PortalDismissalBanner)
    liveAnnounce.value = '預告接送：A 的家長5分鐘後會抵達'
    await nextTick()
    route.path = '/portal/dismissal-calls'
    await flushPromises()
    expect(close).toHaveBeenCalled()

    liveAnnounce.value = '預告接送：B 的家長5分鐘後會抵達'
    await nextTick()
    expect(ElNotification).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
