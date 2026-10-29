/**
 * 2026-10-29 後台 IA 重整 S3 回歸：/attendance 拆頁後不再借道 SCHEDULE。
 *
 * 只持 SCHEDULE（無 ATTENDANCE_READ）的人開舊 /attendance（舊側欄入口、書籤、不帶排班頁籤）
 * 拆頁前直接落在排班頁籤；拆頁後必須落到 /schedule，而不是被擋成 403。
 *
 * 刻意用真的 canAccessRoute＋真權限集合（只 mock 登入狀態），不 mock 權限判斷——
 * scheduleSplit.spec.ts 把 canAccessRoute mock 成恆 true，測不到這個情境。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RouteLocationNormalized } from 'vue-router'

vi.mock('@/utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/auth')>()
  return { ...actual, isLoggedIn: vi.fn(() => true) }
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
import { setUserInfo } from '@/utils/auth'

function resolveTo(path: string): RouteLocationNormalized {
  return router.resolve(path) as unknown as RouteLocationNormalized
}

function loginAs(permission_names: string[]) {
  setUserInfo({ role: 'custom', must_change_password: false, permission_names })
}

describe('只持 SCHEDULE 開舊 /attendance', () => {
  beforeEach(() => vi.clearAllMocks())

  it('不帶 query → 落 /schedule', async () => {
    loginAs(['SCHEDULE'])
    expect(await authGuard(resolveTo('/attendance'))).toEqual({ path: '/schedule', query: {} })
  })

  it('帶合法 date → 保留 date；核對專屬 query 丟掉', async () => {
    loginAs(['SCHEDULE'])
    expect(await authGuard(resolveTo('/attendance?date=2026-09-14&emp=3&view=person'))).toEqual({
      path: '/schedule',
      query: { date: '2026-09-14' },
    })
  })

  it('不合法 date 不帶過去', async () => {
    loginAs(['SCHEDULE'])
    expect(await authGuard(resolveTo('/attendance?date=abc'))).toEqual({ path: '/schedule', query: {} })
  })

  it('持 ATTENDANCE_READ 的人照常進出勤核對（不被轉走）', async () => {
    loginAs(['ATTENDANCE_READ', 'SCHEDULE'])
    const out = await authGuard(resolveTo('/attendance?date=2026-09-14'))
    expect(out === undefined || out === true).toBe(true)
  })

  it('兩者皆無 → 仍是 403 錯誤頁，不被誤導去排班', async () => {
    loginAs(['LEAVES_READ'])
    const out = (await authGuard(resolveTo('/attendance'))) as { path?: string } | string
    const path = typeof out === 'string' ? out : out?.path
    expect(path).toBe('/error')
  })
})
