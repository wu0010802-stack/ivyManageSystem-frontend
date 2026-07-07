import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/dashboard' }),
  useRouter: () => ({ push: pushMock }),
}))

const { isLoggedInMock, clearAuthMock, getUserInfoMock, setUserInfoMock } = vi.hoisted(() => ({
  isLoggedInMock: vi.fn(),
  clearAuthMock: vi.fn(),
  getUserInfoMock: vi.fn(),
  setUserInfoMock: vi.fn(),
}))

vi.mock('@/utils/auth', async () => {
  const actual = await vi.importActual<typeof import('@/utils/auth')>('@/utils/auth')
  return {
    ...actual,
    isLoggedIn: isLoggedInMock,
    clearAuth: clearAuthMock,
    getUserInfo: getUserInfoMock,
    setUserInfo: setUserInfoMock,
  }
})

const { refreshSessionMock } = vi.hoisted(() => ({ refreshSessionMock: vi.fn() }))
vi.mock('@/api/auth', () => ({ refreshSession: refreshSessionMock }))

import { useIdleTimeout } from '@/composables/useIdleTimeout'
import { SESSION_MAX_AGE_MS } from '@/utils/auth'

// 對齊設計文件：逾時前 5 分鐘跳警告 modal、refresh 節流 2 分鐘。
const WARNING_BEFORE_MS = 5 * 60_000
const WARN_AT_MS = SESSION_MAX_AGE_MS - WARNING_BEFORE_MS
const REFRESH_THROTTLE_MS = 2 * 60_000

function mountHost() {
  let api!: ReturnType<typeof useIdleTimeout>
  const Host = defineComponent({
    setup() {
      api = useIdleTimeout()
      return () => h('div')
    },
  })
  const wrapper = mount(Host, { attachTo: document.body })
  return { wrapper, api }
}

describe('useIdleTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    isLoggedInMock.mockReturnValue(true)
    getUserInfoMock.mockReturnValue({ role: 'admin' })
    refreshSessionMock.mockResolvedValue({ data: { user: { role: 'admin' } } })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('idle 達 9 分鐘（逾時前 5 分鐘）→ showWarningModal 變 true', async () => {
    const { wrapper, api } = mountHost()
    expect(api.showWarningModal.value).toBe(false)

    vi.advanceTimersByTime(WARN_AT_MS)
    expect(api.showWarningModal.value).toBe(true)

    wrapper.unmount()
  })

  it('idle 達 14 分鐘 → 觸發登出（clearAuth + router push 導向 /login）', async () => {
    const { wrapper } = mountHost()

    vi.advanceTimersByTime(SESSION_MAX_AGE_MS)

    expect(clearAuthMock).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith('/login')

    wrapper.unmount()
  })

  it('教師角色 idle 達 14 分鐘 → 導向 /portal/login', async () => {
    getUserInfoMock.mockReturnValue({ role: 'teacher' })
    const { wrapper } = mountHost()

    vi.advanceTimersByTime(SESSION_MAX_AGE_MS)

    expect(pushMock).toHaveBeenCalledWith('/portal/login')

    wrapper.unmount()
  })

  it('活動事件重置計時：原訂警告時間點不會觸發，需等重置後的新時間點', async () => {
    const { wrapper, api } = mountHost()

    // 在原訂警告時間點之前一小段時間觸發活動 → 重置計時
    vi.advanceTimersByTime(WARN_AT_MS - 1_000)
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
    await flushPromises()
    expect(api.showWarningModal.value).toBe(false)

    // 前進到「原本」的警告時間點之後，因為已重置，仍不應顯示
    vi.advanceTimersByTime(2_000)
    expect(api.showWarningModal.value).toBe(false)

    // 前進到「重置後」真正的新警告時間點才會顯示
    vi.advanceTimersByTime(WARN_AT_MS - 1_000)
    expect(api.showWarningModal.value).toBe(true)

    wrapper.unmount()
  })

  it('mousemove 不算活動：不會重置計時', async () => {
    const { wrapper, api } = mountHost()

    vi.advanceTimersByTime(WARN_AT_MS - 1_000)
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    await flushPromises()

    // mousemove 已被排除，計時不受影響，原訂時間點仍會顯示 modal
    vi.advanceTimersByTime(1_000)
    expect(api.showWarningModal.value).toBe(true)

    wrapper.unmount()
  })

  it('活動事件節流呼叫 refreshSession：節流間隔內不重複呼叫', async () => {
    const { wrapper } = mountHost()

    // 第一次活動：距 start() 已超過節流間隔 → 觸發 refresh
    vi.advanceTimersByTime(REFRESH_THROTTLE_MS + 1_000)
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
    await flushPromises()
    expect(refreshSessionMock).toHaveBeenCalledTimes(1)

    // 節流間隔內的第二次活動（間隔 > 1 秒活動節流，但 < 2 分鐘 refresh 節流）→ 不重複呼叫
    vi.advanceTimersByTime(2_000)
    document.dispatchEvent(new MouseEvent('keydown', { bubbles: true }))
    await flushPromises()
    expect(refreshSessionMock).toHaveBeenCalledTimes(1)

    // 超過節流間隔後的活動 → 再次呼叫
    vi.advanceTimersByTime(REFRESH_THROTTLE_MS + 1_000)
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
    await flushPromises()
    expect(refreshSessionMock).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })

  it('refreshSession 成功後呼叫 setUserInfo，延續 isLoggedIn() 賴以判斷的驗證時間戳', async () => {
    const { wrapper } = mountHost()

    vi.advanceTimersByTime(REFRESH_THROTTLE_MS + 1_000)
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
    await flushPromises()

    expect(setUserInfoMock).toHaveBeenCalledWith({ role: 'admin' })

    wrapper.unmount()
  })

  it('巢狀 overflow 容器內不冒泡的 scroll 事件仍會被偵測為活動（capture 監聽）', async () => {
    const { wrapper, api } = mountHost()

    const scrollContainer = document.createElement('div')
    document.body.appendChild(scrollContainer)

    vi.advanceTimersByTime(WARN_AT_MS - 1_000)
    scrollContainer.dispatchEvent(new Event('scroll', { bubbles: false }))
    await flushPromises()
    expect(api.showWarningModal.value).toBe(false)

    vi.advanceTimersByTime(2_000)
    expect(api.showWarningModal.value).toBe(false)

    vi.advanceTimersByTime(WARN_AT_MS - 1_000)
    expect(api.showWarningModal.value).toBe(true)

    document.body.removeChild(scrollContainer)
    wrapper.unmount()
  })

  it('stop() 後才 resolve 的 refreshSession 不會呼叫 setUserInfo（refreshGeneration race 防護）', async () => {
    let resolveRefresh!: (value: { data: { user: { role: string } } }) => void
    refreshSessionMock.mockReturnValueOnce(
      new Promise((resolve) => { resolveRefresh = resolve })
    )

    const { wrapper, api } = mountHost()

    // extend() 立即（不節流）觸發一次 refreshSession，但先不 resolve
    api.extend()
    api.stop()

    resolveRefresh({ data: { user: { role: 'admin' } } })
    await flushPromises()

    expect(setUserInfoMock).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('modal 顯示中偵測到背景活動 → 自動關閉並重置', async () => {
    const { wrapper, api } = mountHost()

    vi.advanceTimersByTime(WARN_AT_MS)
    expect(api.showWarningModal.value).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
    await flushPromises()
    expect(api.showWarningModal.value).toBe(false)

    // 原訂（未重置）登出時間點為 mount 後 SESSION_MAX_AGE_MS；目前只過了 WARN_AT_MS，
    // 前進到剛好越過原本的登出時間點：若重置生效，新登出時間點已被往後推
    // （WARN_AT_MS + SESSION_MAX_AGE_MS），此時不應觸發登出。
    vi.advanceTimersByTime(WARNING_BEFORE_MS + 2_000)
    expect(clearAuthMock).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('dismiss() 只關閉 modal，不重置計時、不呼叫 refresh（logoutTimer 持續倒數）', async () => {
    const { wrapper, api } = mountHost()

    vi.advanceTimersByTime(WARN_AT_MS)
    expect(api.showWarningModal.value).toBe(true)
    const refreshCallsBeforeDismiss = refreshSessionMock.mock.calls.length

    api.dismiss()
    expect(api.showWarningModal.value).toBe(false)
    expect(refreshSessionMock.mock.calls.length).toBe(refreshCallsBeforeDismiss)

    // logoutTimer 沒被重置：原訂 14 分鐘時間點仍會觸發登出
    vi.advanceTimersByTime(WARNING_BEFORE_MS)
    expect(clearAuthMock).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('事件來源在 modal 根節點內時，全域 handler 不誤觸發重置', async () => {
    const { wrapper, api } = mountHost()

    vi.advanceTimersByTime(WARN_AT_MS)
    expect(api.showWarningModal.value).toBe(true)
    const refreshCallsBeforeClick = refreshSessionMock.mock.calls.length

    const modalRoot = document.createElement('div')
    modalRoot.className = 'session-idle-modal'
    const button = document.createElement('button')
    modalRoot.appendChild(button)
    document.body.appendChild(modalRoot)

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // modal 內的點擊不應被全域 handler 誤判成背景活動：modal 應維持顯示、不重置、不 refresh
    expect(api.showWarningModal.value).toBe(true)
    expect(refreshSessionMock.mock.calls.length).toBe(refreshCallsBeforeClick)

    document.body.removeChild(modalRoot)
    wrapper.unmount()
  })
})
