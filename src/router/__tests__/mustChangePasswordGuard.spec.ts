/**
 * 強制改密碼守衛（must_change_password）不得被削弱。
 *
 * 強制改密頁新增「登出」出口（2026-10-29 UI/UX），但守衛本身一行未動；本檔用「真實」
 * auth 狀態（setUserInfo / clearAuth，不 mock getUserInfo / canAccessRoute）鎖死：
 * - 尚未改密的管理端帳號，打任何其他受保護頁都被導回 /change-password
 * - 尚未改密的教師，打任何其他 portal 頁都被導回 /portal/change-password
 * - 改密頁本身放行（不會互轉成迴圈）
 * - /login 對已登入者導 '/'，而 '/' 又會被導回改密頁——「去登入頁」不是繞過方式
 * - 登出（本地身分清空）後才能到 /login，且改密旗標隨身分一併消失、下次登入重新由後端決定
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { RouteLocationNormalized } from 'vue-router'

vi.mock('@/api/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/auth')>()
  return {
    ...actual,
    // 沒有本地身分時守衛會嘗試 refresh 還原 session；測試中一律視為 cookie 無效
    refreshSession: vi.fn(() => Promise.reject({ response: { status: 401 } })),
  }
})

vi.mock('@/utils/sentry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/sentry')>()
  return { ...actual, captureException: vi.fn(async () => {}) }
})

import router, { authGuard } from '@/router'
import { clearAuth, setUserInfo, getUserInfo } from '@/utils/auth'

function resolveTo(path: string): RouteLocationNormalized {
  const resolved = router.resolve(path)
  // 防止測試路徑打錯變成 404 catch-all（noAuth，會讓「被攔」的斷言空轉）
  expect(resolved.name, `${path} 必須是真實路由`).not.toBe('not-found')
  return resolved as unknown as RouteLocationNormalized
}

const ADMIN_MUST_CHANGE = {
  role: 'admin',
  name: '測試管理員',
  permission_names: ['*'],
  must_change_password: true,
}

const TEACHER_MUST_CHANGE = {
  role: 'teacher',
  name: '測試教師',
  permission_names: [],
  must_change_password: true,
}

beforeEach(async () => {
  await clearAuth({ notifyServer: false })
})

afterEach(async () => {
  await clearAuth({ notifyServer: false })
})

describe('管理端：未改密帳號被鎖在 /change-password', () => {
  beforeEach(() => {
    setUserInfo(ADMIN_MUST_CHANGE)
  })

  it.each(['/', '/profile', '/employees', '/settings', '/salary', '/portal/home'])(
    '打 %s → 導回 /change-password',
    async (path) => {
      await expect(authGuard(resolveTo(path))).resolves.toBe('/change-password')
    },
  )

  it('改密頁本身放行（不互轉成迴圈）', async () => {
    await expect(authGuard(resolveTo('/change-password'))).resolves.toBe(true)
  })

  it('去 /login 不是繞過方式：導 \'/\'，而 \'/\' 仍被導回改密頁', async () => {
    await expect(authGuard(resolveTo('/login'))).resolves.toBe('/')
    await expect(authGuard(resolveTo('/'))).resolves.toBe('/change-password')
  })
})

describe('教師：未改密帳號被鎖在 /portal/change-password', () => {
  beforeEach(() => {
    setUserInfo(TEACHER_MUST_CHANGE)
  })

  it.each(['/portal/home', '/profile', '/employees'])(
    '打 %s → 導回 /portal/change-password',
    async (path) => {
      await expect(authGuard(resolveTo(path))).resolves.toBe('/portal/change-password')
    },
  )

  it('教師改密頁本身放行', async () => {
    await expect(authGuard(resolveTo('/portal/change-password'))).resolves.toBe(true)
  })
})

describe('登出出口（強制改密頁的「登出」走 clearAuth）', () => {
  it('登出後本地身分與改密旗標一併消失，且可到達 /login', async () => {
    setUserInfo(ADMIN_MUST_CHANGE)
    expect(getUserInfo()).not.toBeNull()

    await clearAuth({ notifyServer: false })

    expect(getUserInfo()).toBeNull()
    await expect(authGuard(resolveTo('/login'))).resolves.toBe(true)
  })

  it('登出後不再是「已登入」：直接打 /change-password 或其他頁都回 /login', async () => {
    setUserInfo(ADMIN_MUST_CHANGE)
    await clearAuth({ notifyServer: false })

    await expect(authGuard(resolveTo('/change-password'))).resolves.toBe('/login')
    await expect(authGuard(resolveTo('/employees'))).resolves.toBe('/login')
  })
})

describe('已改密帳號不受影響', () => {
  it('must_change_password=false 的管理員可正常進入受保護頁', async () => {
    setUserInfo({ ...ADMIN_MUST_CHANGE, must_change_password: false })

    await expect(authGuard(resolveTo('/employees'))).resolves.toBe(true)
  })
})
