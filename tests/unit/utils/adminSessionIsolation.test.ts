/**
 * 管理端跨分頁 session 隔離 + 離線佇列保留。
 *
 * 兩個 P1 缺陷的回歸鎖：
 * 1. 登入／登出會 clearAll() 整個共用離線佇列——佇列本身已按 user_id 分區，
 *    清掉等於把其他老師尚未同步的點名一起刪除。
 * 2. userInfo 存在共用 localStorage，且分頁間沒有身分變更通知；A 在另一分頁
 *    登出改登 B 之後，舊分頁仍顯示 A 的畫面並拿 B 的共享 Cookie continue 打 API。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_SESSION_REVISION_KEY, getAdminSessionGeneration, getAdminSessionSignal } from '@/utils/adminSession'
import { clearAuth, getUserInfo, setUserInfo, USER_INFO_KEY, waitForAdminSessionCleanup } from '@/utils/auth'

const clearAllSpy = vi.fn(() => Promise.resolve())

vi.mock('@/utils/offlineQueue', () => ({
  clearAll: () => clearAllSpy(),
}))

function dispatchRemoteRevision(revision: string): void {
  localStorage.setItem(ADMIN_SESSION_REVISION_KEY, revision)
  window.dispatchEvent(new StorageEvent('storage', {
    key: ADMIN_SESSION_REVISION_KEY,
    newValue: revision,
  }))
}

describe('管理端跨分頁 session 隔離', () => {
  beforeEach(async () => {
    await clearAuth({ notifyServer: false })
    clearAllSpy.mockClear()
    window.location.hash = '#/'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('離線佇列不隨身分切換清空', () => {
    it('登出不得 clearAll——佇列已按 user_id 分區，清掉等於刪別人未同步的點名', async () => {
      setUserInfo({ id: 'teacher-A', role: 'teacher' })

      await clearAuth({ notifyServer: false })
      await waitForAdminSessionCleanup()

      expect(clearAllSpy).not.toHaveBeenCalled()
    })

    it('另一分頁身分變更也不得 clearAll', async () => {
      setUserInfo({ id: 'teacher-A', role: 'teacher' })

      dispatchRemoteRevision('remote-login-B')
      await waitForAdminSessionCleanup()

      expect(clearAllSpy).not.toHaveBeenCalled()
    })
  })

  describe('userInfo 改為 per-tab', () => {
    it('setUserInfo 只寫本分頁 sessionStorage，不留 PII 在共用 localStorage', () => {
      setUserInfo({ id: 'admin-A', role: 'admin', permission_names: ['*'] })

      expect(sessionStorage.getItem(USER_INFO_KEY)).toContain('admin-A')
      expect(localStorage.getItem(USER_INFO_KEY)).toBeNull()
      expect(getUserInfo()).toMatchObject({ id: 'admin-A' })
    })

    it('clearAuth 同時清掉 session 與任何 localStorage 殘留', async () => {
      setUserInfo({ id: 'admin-A', role: 'admin' })
      localStorage.setItem(USER_INFO_KEY, JSON.stringify({ id: 'legacy' }))

      await clearAuth({ notifyServer: false })

      expect(getUserInfo()).toBeNull()
      expect(sessionStorage.getItem(USER_INFO_KEY)).toBeNull()
      expect(localStorage.getItem(USER_INFO_KEY)).toBeNull()
    })
  })

  describe('另一分頁換身分時本分頁立即失效', () => {
    it('storage 廣播會前進 session 世代並中止在途 IO', async () => {
      setUserInfo({ id: 'admin-A', role: 'admin' })
      const beforeGeneration = getAdminSessionGeneration()
      const inflightSignal = getAdminSessionSignal()

      dispatchRemoteRevision('remote-login-B')

      expect(getAdminSessionGeneration()).toBeGreaterThan(beforeGeneration)
      expect(inflightSignal.aborted).toBe(true)
    })

    it('本分頁的 userInfo 立刻清空，不讓 A 的畫面拿 B 的 Cookie 續打 API', () => {
      setUserInfo({ id: 'admin-A', role: 'admin', permission_names: ['*'] })

      dispatchRemoteRevision('remote-login-B')

      expect(getUserInfo()).toBeNull()
      expect(sessionStorage.getItem(USER_INFO_KEY)).toBeNull()
    })

    it('會把本分頁導回登入頁，不停在已渲染的受保護畫面', () => {
      setUserInfo({ id: 'admin-A', role: 'admin' })
      window.location.hash = '#/employees'

      dispatchRemoteRevision('remote-login-B')

      expect(window.location.hash).toBe('#/login')
    })

    it('教師端分頁導回教師端登入頁', () => {
      setUserInfo({ id: 'teacher-A', role: 'teacher' })
      window.location.hash = '#/portal/home'

      dispatchRemoteRevision('remote-login-B')

      expect(window.location.hash).toBe('#/portal/login')
    })

    it('本來就沒有身分的分頁（登入頁）不會被別的分頁拉走', () => {
      window.location.hash = '#/login'

      dispatchRemoteRevision('remote-login-B')

      expect(window.location.hash).toBe('#/login')
    })

    it('自己送出的 revision 不會反彈成 remote reset（避免分頁間迴圈）', async () => {
      setUserInfo({ id: 'admin-A', role: 'admin' })
      const ownRevision = localStorage.getItem(ADMIN_SESSION_REVISION_KEY)
      expect(ownRevision).toBeTruthy()
      window.location.hash = '#/employees'

      window.dispatchEvent(new StorageEvent('storage', {
        key: ADMIN_SESSION_REVISION_KEY,
        newValue: ownRevision,
      }))

      expect(getUserInfo()).toMatchObject({ id: 'admin-A' })
      expect(window.location.hash).toBe('#/employees')
    })
  })
})
