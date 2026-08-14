/**
 * 守衛「權限不足」重導行為。
 *
 * 修正前：portal 子路由權限不足靜默 `return '/portal/home'`、admin 無權路由
 * 靜默導第一個允許路由——使用者觀感是「功能壞掉被丟回首頁」，且無任何
 * 訊息或 Sentry 紀錄（2026-08-14 班級相簿實例）。
 *
 * 修正後契約：
 * - portal 權限不足 → `/portal/error?type=forbidden&feature&permission&from` + Sentry
 * - admin 指名頁面無權限 → `/error?type=forbidden&feature&from` + Sentry
 * - admin 落地 `/`（登入預設落點）→ 維持自動導第一個允許路由（不是錯誤情境）
 * - meta.errorPage 路由本身跳過 canAccessRoute（default-deny 不含錯誤頁）
 * - teacher 打 admin 路由仍導 `/portal/home`（身分隔離，非錯誤）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RouteLocationNormalized } from 'vue-router'

vi.mock('@/utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/auth')>()
  return {
    ...actual,
    isLoggedIn: vi.fn(() => true),
    getUserInfo: vi.fn(),
    hasPortalPermission: vi.fn(),
    canAccessRoute: vi.fn(),
    getAllowedRoutes: vi.fn(() => [] as string[]),
    isPlatformAdmin: vi.fn(() => false),
  }
})

vi.mock('@/api/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/auth')>()
  return { ...actual, refreshSession: vi.fn() }
})

vi.mock('@/utils/sentry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/sentry')>()
  return { ...actual, captureException: vi.fn(async () => {}) }
})

import router, { authGuard } from '@/router'
import {
  getUserInfo,
  hasPortalPermission,
  canAccessRoute,
  getAllowedRoutes,
} from '@/utils/auth'
import { captureException } from '@/utils/sentry'

function resolveTo(path: string): RouteLocationNormalized {
  return router.resolve(path) as unknown as RouteLocationNormalized
}

const TEACHER = { role: 'teacher', must_change_password: false } as unknown as ReturnType<
  typeof getUserInfo
>
const ADMIN = { role: 'admin', must_change_password: false } as unknown as ReturnType<
  typeof getUserInfo
>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('portal 子路由權限不足', () => {
  it('teacher 缺 CLASS_ALBUMS_READ 打班級相簿 → 導 /portal/error 並帶完整脈絡', async () => {
    vi.mocked(getUserInfo).mockReturnValue(TEACHER)
    vi.mocked(hasPortalPermission).mockReturnValue(false)

    const result = await authGuard(resolveTo('/portal/albums'))

    expect(result).toMatchObject({
      path: '/portal/error',
      query: {
        type: 'forbidden',
        feature: '班級相簿',
        permission: 'CLASS_ALBUMS_READ',
        from: '/portal/albums',
      },
    })
  })

  it('權限充足則放行', async () => {
    vi.mocked(getUserInfo).mockReturnValue(TEACHER)
    vi.mocked(hasPortalPermission).mockReturnValue(true)

    await expect(authGuard(resolveTo('/portal/albums'))).resolves.toBe(true)
  })

  it('權限不足的重導會上報 Sentry（帶 permission 與路徑，維運才看得到）', async () => {
    vi.mocked(getUserInfo).mockReturnValue(TEACHER)
    vi.mocked(hasPortalPermission).mockReturnValue(false)

    await authGuard(resolveTo('/portal/albums'))

    expect(captureException).toHaveBeenCalledTimes(1)
    const [err, context] = vi.mocked(captureException).mock.calls[0]!
    expect(err).toBeInstanceOf(Error)
    expect(context).toMatchObject({
      permission: 'CLASS_ALBUMS_READ',
      path: '/portal/albums',
    })
  })
})

describe('admin 路由權限不足', () => {
  it('指名頁面無權限 → 導 /error（不再靜默導第一個允許路由）', async () => {
    vi.mocked(getUserInfo).mockReturnValue(ADMIN)
    vi.mocked(canAccessRoute).mockReturnValue(false)
    vi.mocked(getAllowedRoutes).mockReturnValue(['/attendance'])

    const result = await authGuard(resolveTo('/employees'))

    expect(result).toMatchObject({
      path: '/error',
      query: { type: 'forbidden', from: '/employees' },
    })
    expect(captureException).toHaveBeenCalledTimes(1)
  })

  it("落地 '/'（登入預設落點）維持自動導向第一個允許路由，不進錯誤頁", async () => {
    vi.mocked(getUserInfo).mockReturnValue(ADMIN)
    vi.mocked(canAccessRoute).mockReturnValue(false)
    vi.mocked(getAllowedRoutes).mockReturnValue(['/attendance'])

    await expect(authGuard(resolveTo('/'))).resolves.toBe('/attendance')
    expect(captureException).not.toHaveBeenCalled()
  })

  it('meta.errorPage 路由本身跳過 canAccessRoute（否則 default-deny 會把錯誤頁再重導成迴圈）', async () => {
    vi.mocked(getUserInfo).mockReturnValue(ADMIN)
    vi.mocked(canAccessRoute).mockReturnValue(false)

    await expect(authGuard(resolveTo('/error'))).resolves.toBe(true)
  })
})

describe('既有行為回歸鎖', () => {
  it('teacher 打 admin 路由仍導 /portal/home（身分隔離，非錯誤情境）', async () => {
    vi.mocked(getUserInfo).mockReturnValue(TEACHER)

    await expect(authGuard(resolveTo('/employees'))).resolves.toBe('/portal/home')
    expect(captureException).not.toHaveBeenCalled()
  })

  it('admin 有權限的頁面照常放行', async () => {
    vi.mocked(getUserInfo).mockReturnValue(ADMIN)
    vi.mocked(canAccessRoute).mockReturnValue(true)

    await expect(authGuard(resolveTo('/employees'))).resolves.toBe(true)
  })
})
