import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, reactive, nextTick } from 'vue'

// day-qa F7（2026-11-02）：家長預告接送時老師正開著聯絡簿抽屜，畫面上沒有任何可見提示
// （只有音效／語音／需授權的系統推播）；家長「已到門口」時接送卡又會自動完成而消失。
// 審查 P2：已到門口的常駐提醒被下一則預告關掉、文字相同的連續事件不觸發、WS 斷線輪詢時不提醒。
type Ann = { seq: number; callId: number; kind: 'pre' | 'waiting'; text: string }
type Call = { id: number; student_name: string; classroom_name: string; arrived_at: string | null; status: string }
const lastAnnouncement = ref<Ann | null>(null)
const activeCalls = ref<Call[]>([])
const wsConnected = ref(true)
const route = reactive({ path: '/portal/contact-book' })
const push = vi.fn()
const handles: { close: ReturnType<typeof vi.fn>; opts: Record<string, unknown> }[] = []

vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push }) }))
vi.mock('element-plus', () => ({
  ElNotification: vi.fn((opts: Record<string, unknown>) => {
    const h = { close: vi.fn(), opts }
    handles.push(h)
    return h
  }),
}))
vi.mock('@/composables/usePortalDismissalAlerts', () => ({
  usePortalDismissalAlerts: () => ({ lastAnnouncement, activeCalls, wsConnected }),
}))

import { ElNotification } from 'element-plus'
import PortalDismissalBanner from '@/components/portal/PortalDismissalBanner.vue'

let seq = 0
async function emit(callId: number, kind: Ann['kind'], text: string) {
  lastAnnouncement.value = { seq: ++seq, callId, kind, text }
  await nextTick()
}

describe('PortalDismissalBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    handles.length = 0
    lastAnnouncement.value = null
    activeCalls.value = []
    wsConnected.value = true
    route.path = '/portal/contact-book'
  })

  it('不在接送頁時，家長預告跳出 20 秒提醒，點一下前往接送頁', async () => {
    const wrapper = mount(PortalDismissalBanner)
    await emit(1, 'pre', '預告接送：大班1班唐子瑄的家長10分鐘後會抵達')
    expect(ElNotification).toHaveBeenCalledTimes(1)
    const opts = handles[0].opts as { message: string; duration: number; onClick: () => void }
    expect(opts.message).toContain('唐子瑄')
    expect(opts.duration).toBeGreaterThan(0)
    opts.onClick()
    expect(push).toHaveBeenCalledWith('/portal/dismissal-calls')
    wrapper.unmount()
  })

  it('已到門口的提醒不自動關閉，也不會被下一位家長的預告關掉', async () => {
    const wrapper = mount(PortalDismissalBanner)
    await emit(1, 'waiting', '甲生家長已到門口，請準備放學')
    expect(handles[0].opts.duration).toBe(0)
    await emit(2, 'pre', '預告接送：乙生的家長5分鐘後會抵達')
    expect(ElNotification).toHaveBeenCalledTimes(2)
    expect(handles[0].close).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('同一張單從預告到抵達：抵達取代自己的預告；文字相同的連續事件也會跳', async () => {
    const wrapper = mount(PortalDismissalBanner)
    await emit(1, 'pre', '預告接送：甲生的家長5分鐘後會抵達')
    await emit(1, 'waiting', '甲生家長已到門口，請準備放學')
    expect(handles[0].close).toHaveBeenCalled()
    await emit(3, 'waiting', '學生家長已到門口，請準備放學')
    await emit(4, 'waiting', '學生家長已到門口，請準備放學')
    expect(ElNotification).toHaveBeenCalledTimes(4)
    wrapper.unmount()
  })

  it('WS 斷線改走輪詢時，清單出現新單或抵達也會提醒；開 App 時既有的單不補跳', async () => {
    activeCalls.value = [{ id: 10, student_name: '既有', classroom_name: '大班', arrived_at: null, status: 'pending' }]
    const wrapper = mount(PortalDismissalBanner)
    await flushPromises()
    expect(ElNotification).not.toHaveBeenCalled()

    wsConnected.value = false
    activeCalls.value = [
      ...activeCalls.value,
      { id: 11, student_name: '新生', classroom_name: '中班', arrived_at: null, status: 'pending' },
    ]
    await flushPromises()
    expect(ElNotification).toHaveBeenCalledTimes(1)
    expect(String(handles[0].opts.message)).toContain('新生')

    activeCalls.value = activeCalls.value.map((c) => (c.id === 10 ? { ...c, arrived_at: '2026-11-02T16:00:00' } : c))
    await flushPromises()
    expect(ElNotification).toHaveBeenCalledTimes(2)
    expect(String(handles[1].opts.message)).toContain('既有家長已到門口')
    wrapper.unmount()
  })

  it('開 App 時清單還沒載入（空），第一份回來的清單不跳提醒', async () => {
    wsConnected.value = false
    const wrapper = mount(PortalDismissalBanner)
    activeCalls.value = [
      { id: 20, student_name: 'A', classroom_name: '大班', arrived_at: null, status: 'pending' },
      { id: 21, student_name: 'B', classroom_name: '大班', arrived_at: '2026-11-02T16:00:00', status: 'pending' },
    ]
    await flushPromises()
    expect(ElNotification).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('已經在接送頁就不跳；切到接送頁時關掉所有提醒', async () => {
    const wrapper = mount(PortalDismissalBanner)
    await emit(1, 'waiting', '甲生家長已到門口，請準備放學')
    await emit(2, 'pre', '預告接送：乙生的家長5分鐘後會抵達')
    route.path = '/portal/dismissal-calls'
    await flushPromises()
    expect(handles.every((h) => h.close.mock.calls.length > 0)).toBe(true)

    await emit(3, 'pre', '預告接送：丙生的家長5分鐘後會抵達')
    expect(ElNotification).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})
