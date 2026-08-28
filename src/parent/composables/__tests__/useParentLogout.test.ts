import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

const { mockLiff, mockLogout, mockGetMyChildren } = vi.hoisted(() => ({
  mockLiff: { isLoggedIn: vi.fn(() => true), logout: vi.fn() },
  mockLogout: vi.fn(),
  mockGetMyChildren: vi.fn(),
}))
vi.mock('@/parent/services/liff', () => ({ liff: mockLiff }))
vi.mock('@/parent/api/auth', () => ({ logout: mockLogout }))
vi.mock('@/parent/api/profile', () => ({
  getMyChildren: mockGetMyChildren,
  getTodayStatus: vi.fn(),
}))

import {
  _resetParentLogoutIsolationForTesting,
  initParentSessionIsolation,
  performParentLogout,
  useParentLogoutState,
} from '@/parent/composables/useParentLogout'
import { useParentAuthStore } from '@/parent/stores/parentAuth'
import { useChildrenStore } from '@/parent/stores/children'
import { useChildSelection } from '@/parent/composables/useChildSelection'
import { useConsentGate } from '@/parent/composables/useConsentGate'
import { useSnackbar } from '@/parent/composables/useSnackbar'
import { useCachedAsync } from '@/composables/useCachedAsync'
import ParentLogoutOverlay from '@/parent/components/ParentLogoutOverlay.vue'

const CACHE_KEY = 'parent:today-status:v1'

beforeEach(() => {
  _resetParentLogoutIsolationForTesting()
  // 不呼叫 vi.unstubAllGlobals()：tests/setup.js 以 stubGlobal 提供完整
  // localStorage；全部解除會退回 Node 22 不完整的內建物件。
  setActivePinia(createPinia())
  mockLiff.isLoggedIn.mockReset().mockReturnValue(true)
  mockLiff.logout.mockReset()
  mockLogout.mockClear().mockResolvedValue(undefined)
  mockGetMyChildren.mockReset()
  sessionStorage.clear()
  localStorage.clear()
  vi.stubGlobal('caches', {
    keys: vi.fn().mockResolvedValue(['parent-home', 'portal-api', 'app-static-assets']),
    delete: vi.fn().mockResolvedValue(true),
  })
  window.location.hash = ''
})

describe('performParentLogout（家長端統一登出清理）', () => {
  it('清今日狀態快取(PII) + 結束 LIFF session + 清 auth store', async () => {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ payload: { x: 1 } }))
    const auth = useParentAuthStore()
    auth.setUser({ name: '家長甲' })

    await performParentLogout()

    expect(mockLogout).toHaveBeenCalled()
    expect(sessionStorage.getItem(CACHE_KEY)).toBeNull() // FE-2：PII 快取已清
    expect(mockLiff.logout).toHaveBeenCalled() // FE-3：LIFF session 已結束
    expect(auth.user).toBeNull()
  })

  it('liff 未登入時不呼叫 liff.logout（避免無謂例外）', async () => {
    mockLiff.isLoggedIn.mockReturnValue(false)
    await performParentLogout()
    expect(mockLiff.logout).not.toHaveBeenCalled()
  })

  it('後端 logout 失敗仍完成本地清理（避免殘留）', async () => {
    mockLogout.mockRejectedValueOnce(new Error('network'))
    sessionStorage.setItem(CACHE_KEY, 'x')
    const auth = useParentAuthStore()
    auth.setUser({ name: '家長乙' })

    await performParentLogout()

    expect(sessionStorage.getItem(CACHE_KEY)).toBeNull()
    expect(auth.user).toBeNull()
  })

  it('清除所有家長 store、全域狀態與舊版個人化 CacheStorage', async () => {
    const auth = useParentAuthStore()
    const children = useChildrenStore()
    const childSelection = useChildSelection()
    const consent = useConsentGate()
    const snackbar = useSnackbar()

    auth.setUser({ user_id: 1, name: '家長甲' })
    children.items = [{ student_id: 11, name: '甲小孩' }]
    children.loaded = true
    childSelection.setSelected(11)
    consent.require('contact_book')
    snackbar.show({ message: '甲的提示' })
    sessionStorage.setItem('parent_faq_v1', JSON.stringify({ private: '甲' }))
    sessionStorage.setItem('parent_message_prefill', '甲的草稿')
    sessionStorage.setItem('parent_api_timings', JSON.stringify([{ u: '/parent/students/11' }]))

    await performParentLogout()

    expect(auth.user).toBeNull()
    expect(children.items).toEqual([])
    expect(children.loaded).toBe(false)
    expect(childSelection.selectedId.value).toBeNull()
    expect(consent.visible.value).toBe(false)
    expect(snackbar.snackbars.value).toEqual([])
    expect(sessionStorage.getItem('parent_faq_v1')).toBeNull()
    expect(sessionStorage.getItem('parent_message_prefill')).toBeNull()
    expect(sessionStorage.getItem('parent_api_timings')).toBeNull()
    expect(caches.delete).toHaveBeenCalledWith('parent-home')
    expect(caches.delete).toHaveBeenCalledWith('portal-api')
    expect(caches.delete).not.toHaveBeenCalledWith('app-static-assets')
  })

  it('A 的舊請求在登出後才完成時，不得覆蓋 B 的子女資料', async () => {
    let resolveA: ((value: { data: { items: unknown[] } }) => void) | undefined
    const requestA = new Promise<{ data: { items: unknown[] } }>((resolve) => {
      resolveA = resolve
    })
    mockGetMyChildren
      .mockReturnValueOnce(requestA)
      .mockResolvedValueOnce({ data: { items: [{ student_id: 22, name: '乙小孩' }] } })

    const auth = useParentAuthStore()
    const children = useChildrenStore()
    auth.setUser({ user_id: 1, name: '家長甲' })
    const loadA = children.load()
    await vi.waitFor(() => expect(mockGetMyChildren).toHaveBeenCalledTimes(1))

    await performParentLogout()
    auth.setUser({ user_id: 2, name: '家長乙' })
    await children.load()
    expect(children.items).toEqual([{ student_id: 22, name: '乙小孩' }])

    resolveA?.({ data: { items: [{ student_id: 11, name: '甲小孩' }] } })
    await loadA
    expect(children.items).toEqual([{ student_id: 22, name: '乙小孩' }])
  })

  it('後端 logout 尚未完成時就同步清空 active cache，並以 blocking overlay 蓋住舊畫面', async () => {
    let resolveLogout: (() => void) | undefined
    mockLogout.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveLogout = resolve }),
    )

    let cached: ReturnType<typeof useCachedAsync<Record<string, unknown>>> | undefined
    const CacheHarness = defineComponent({
      setup() {
        cached = useCachedAsync(
          'parent/home/summary',
          vi.fn().mockResolvedValue({ owner: '家長甲', fee: 1234 }),
          { ttl: 60_000 },
        )
        return () => h('div', JSON.stringify(cached?.data.value ?? null))
      },
    })
    const cacheWrapper = mount(CacheHarness)
    await vi.waitFor(() => expect(cached?.data.value).toEqual({ owner: '家長甲', fee: 1234 }))
    const overlay = mount(ParentLogoutOverlay)

    const pendingLogout = performParentLogout()

    expect(cached?.data.value).toBeNull()
    await nextTick()
    expect(overlay.get('[data-testid="parent-logout-shield"]').attributes('aria-busy')).toBe('true')

    resolveLogout?.()
    await pendingLogout
    await nextTick()
    expect(overlay.find('[data-testid="parent-logout-shield"]').exists()).toBe(false)

    overlay.unmount()
    cacheWrapper.unmount()
  })

  it('收到其他分頁 logout-start 時只做本地清理，不呼叫後端也不重播 broadcast', async () => {
    class FakeBroadcastChannel {
      static instances: FakeBroadcastChannel[] = []
      readonly name: string
      onmessage: ((event: MessageEvent) => void) | null = null
      postMessage = vi.fn()
      close = vi.fn()

      constructor(name: string) {
        this.name = name
        FakeBroadcastChannel.instances.push(this)
      }
    }

    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    _resetParentLogoutIsolationForTesting()
    initParentSessionIsolation()
    const channel = FakeBroadcastChannel.instances.at(-1)
    expect(channel).toBeDefined()

    const auth = useParentAuthStore()
    const children = useChildrenStore()
    auth.setUser({ user_id: 1, name: '家長甲' })
    children.items = [{ student_id: 11, name: '甲小孩' }]

    channel?.onmessage?.({ data: { type: 'logout-start' } } as MessageEvent)

    expect(useParentLogoutState().inProgress.value).toBe(true)
    expect(auth.user).toBeNull()
    expect(children.items).toEqual([])
    expect(mockLogout).not.toHaveBeenCalled()
    expect(channel?.postMessage).not.toHaveBeenCalled()

    channel?.onmessage?.({ data: { type: 'logout-complete' } } as MessageEvent)
    await vi.waitFor(() => expect(useParentLogoutState().inProgress.value).toBe(false))
    expect(window.location.hash).toBe('#/login')
    expect(channel?.postMessage).not.toHaveBeenCalled()
  })

  it('其他分頁 logout-complete 會等待本分頁個人化 cache 清完才解除遮罩', async () => {
    class FakeBroadcastChannel {
      static instances: FakeBroadcastChannel[] = []
      onmessage: ((event: MessageEvent) => void) | null = null
      postMessage = vi.fn()
      close = vi.fn()

      constructor(readonly name: string) {
        FakeBroadcastChannel.instances.push(this)
      }
    }

    let releaseDelete: (() => void) | undefined
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['parent-home']),
      delete: vi.fn(() => new Promise<boolean>((resolve) => {
        releaseDelete = () => resolve(true)
      })),
    })
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    _resetParentLogoutIsolationForTesting()
    initParentSessionIsolation()
    const channel = FakeBroadcastChannel.instances.at(-1)

    channel?.onmessage?.({ data: { type: 'logout-start' } } as MessageEvent)
    await vi.waitFor(() => expect(caches.delete).toHaveBeenCalledWith('parent-home'))
    channel?.onmessage?.({ data: { type: 'logout-complete' } } as MessageEvent)
    await nextTick()

    expect(useParentLogoutState().inProgress.value).toBe(true)
    expect(window.location.hash).not.toBe('#/login')

    releaseDelete?.()
    await vi.waitFor(() => expect(useParentLogoutState().inProgress.value).toBe(false))
    expect(window.location.hash).toBe('#/login')
  })
})
