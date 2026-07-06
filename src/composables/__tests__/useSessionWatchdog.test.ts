import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/api/auth', () => ({
  refreshSession: vi.fn(() => Promise.resolve({ data: { user: {} } })),
}))
vi.mock('@/utils/auth', () => ({
  clearAuth: vi.fn(),
  USER_INFO_KEY: 'userInfo',
}))
// continueSession 網路錯誤分支的動態 import
vi.mock('element-plus', () => ({ ElMessage: { warning: vi.fn() } }))

import { refreshSession } from '@/api/auth'
import { clearAuth } from '@/utils/auth'
import {
  startSessionWatchdog,
  stopSessionWatchdog,
  useSessionWatchdogState,
  continueSession,
  logoutNow,
  IDLE_LOGOUT_FLAG_KEY,
  LAST_ACTIVITY_KEY,
} from '../useSessionWatchdog'

const IDLE_MS = 60 * 60_000
const COUNTDOWN_MS = 5 * 60_000

function startWatchdog() {
  startSessionWatchdog({ idleMs: IDLE_MS, countdownMs: COUNTDOWN_MS, loginPath: '/login' })
}

describe('useSessionWatchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem('userInfo', '{}') // 模擬已登入
    window.location.hash = '#/'
    vi.mocked(clearAuth).mockClear()
    vi.mocked(refreshSession).mockReset()
    vi.mocked(refreshSession).mockResolvedValue({ data: { user: {} } } as never)
  })

  afterEach(() => {
    stopSessionWatchdog()
    vi.useRealTimers()
  })

  it('閒置達門檻 → 進入倒數（不直接登出）', () => {
    startWatchdog()
    const { countdownRemainingMs } = useSessionWatchdogState()
    vi.advanceTimersByTime(IDLE_MS + 15_000)
    expect(countdownRemainingMs.value).not.toBeNull()
    expect(clearAuth).not.toHaveBeenCalled()
  })

  it('活動重置閒置計時，不彈倒數', () => {
    startWatchdog()
    const { countdownRemainingMs } = useSessionWatchdogState()
    vi.advanceTimersByTime(30 * 60_000)
    window.dispatchEvent(new Event('mousemove'))
    vi.advanceTimersByTime(40 * 60_000)
    expect(countdownRemainingMs.value).toBeNull()
    expect(clearAuth).not.toHaveBeenCalled()
  })

  it('倒數歸零無操作 → clearAuth(notifyServer) + one-shot 旗標 + 導登入頁', () => {
    startWatchdog()
    vi.advanceTimersByTime(IDLE_MS + 15_000)
    vi.advanceTimersByTime(COUNTDOWN_MS + 15_000)
    expect(clearAuth).toHaveBeenCalledWith({ notifyServer: true })
    expect(sessionStorage.getItem(IDLE_LOGOUT_FLAG_KEY)).toBe('1')
    expect(window.location.hash).toBe('#/login')
  })

  it('倒數中 continueSession → refreshSession 續期並退出倒數', async () => {
    startWatchdog()
    const { countdownRemainingMs } = useSessionWatchdogState()
    vi.advanceTimersByTime(IDLE_MS + 15_000)
    expect(countdownRemainingMs.value).not.toBeNull()
    await continueSession()
    expect(refreshSession).toHaveBeenCalled()
    expect(countdownRemainingMs.value).toBeNull()
    expect(clearAuth).not.toHaveBeenCalled()
  })

  it('其他分頁有活動（共享時間戳新）→ 倒數靜默退出、不登出', () => {
    startWatchdog()
    const { countdownRemainingMs } = useSessionWatchdogState()
    vi.advanceTimersByTime(IDLE_MS + 15_000)
    expect(countdownRemainingMs.value).not.toBeNull()
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()))
    vi.advanceTimersByTime(1_000)
    expect(countdownRemainingMs.value).toBeNull()
    vi.advanceTimersByTime(COUNTDOWN_MS + 60_000)
    expect(clearAuth).not.toHaveBeenCalled()
  })

  it('休眠斷層超過閒置+倒數 → 喚醒後第一個活動直接登出', () => {
    startWatchdog()
    vi.setSystemTime(Date.now() + 70 * 60_000) // 休眠 70 分（timer 未跑）
    window.dispatchEvent(new Event('mousemove'))
    expect(clearAuth).toHaveBeenCalledWith({ notifyServer: true })
    expect(window.location.hash).toBe('#/login')
  })

  it('休眠斷層落在倒數窗內 → 喚醒後活動視為回來，直接續用不彈窗', () => {
    startWatchdog()
    const { countdownRemainingMs } = useSessionWatchdogState()
    vi.setSystemTime(Date.now() + 62 * 60_000)
    window.dispatchEvent(new Event('pointerdown'))
    expect(countdownRemainingMs.value).toBeNull()
    expect(clearAuth).not.toHaveBeenCalled()
    vi.advanceTimersByTime(30 * 60_000)
    expect(countdownRemainingMs.value).toBeNull()
  })

  it('離線時倒數到期不登出（重置計時，回線後重新累計）', () => {
    startWatchdog()
    const onLineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    vi.advanceTimersByTime(IDLE_MS + COUNTDOWN_MS + 30_000)
    expect(clearAuth).not.toHaveBeenCalled()
    onLineSpy.mockRestore()
  })

  it('continueSession 網路錯誤 → 維持倒數不登出', async () => {
    startWatchdog()
    const { countdownRemainingMs } = useSessionWatchdogState()
    vi.mocked(refreshSession).mockRejectedValueOnce(new Error('Network Error'))
    vi.advanceTimersByTime(IDLE_MS + 15_000)
    await continueSession()
    expect(countdownRemainingMs.value).not.toBeNull()
    expect(clearAuth).not.toHaveBeenCalled()
  })

  it('continueSession 401 → 直接登出', async () => {
    startWatchdog()
    vi.mocked(refreshSession).mockRejectedValueOnce(
      Object.assign(new Error('401'), { response: { status: 401 } })
    )
    vi.advanceTimersByTime(IDLE_MS + 15_000)
    await continueSession()
    expect(clearAuth).toHaveBeenCalledWith({ notifyServer: true })
    expect(window.location.hash).toBe('#/login')
  })

  it('userInfo 被清（他分頁登出）→ 下個 tick 導回登入頁', () => {
    startWatchdog()
    localStorage.removeItem('userInfo')
    vi.advanceTimersByTime(15_000)
    expect(window.location.hash).toBe('#/login')
  })

  it('倒數中 logoutNow → clearAuth(notifyServer) + 導登入頁，但不設閒置 one-shot 旗標', () => {
    startWatchdog()
    const { countdownRemainingMs } = useSessionWatchdogState()
    vi.advanceTimersByTime(IDLE_MS + 15_000)
    expect(countdownRemainingMs.value).not.toBeNull()
    logoutNow()
    expect(clearAuth).toHaveBeenCalledWith({ notifyServer: true })
    expect(window.location.hash).toBe('#/login')
    // 手動登出 ≠ 閒置登出：登入頁不應顯示「閒置已登出」提示
    expect(sessionStorage.getItem(IDLE_LOGOUT_FLAG_KEY)).toBeNull()
  })
})
