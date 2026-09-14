import { describe, it, expect, vi } from 'vitest'

// guard restoreSessionIfNeeded 可能呼叫 refreshSession，不可真打網路
vi.mock('@/api/auth', () => ({
  refreshSession: vi.fn(() => Promise.reject(new Error('no-network'))),
}))

import router from '@/router'

/**
 * 課程點名獨立頁（2026-09-14）。
 *
 * 原本是 /portal/activity 的第二個 tab，老師得先進「才藝管理」再切 tab 才找得到。
 * 拆成獨立頁後側欄直接有入口，而舊網址 /portal/activity?tab=attendance 已經散在
 * 老師書籤與既有推播 deep_link 裡改不動，因此 /portal/activity 保留一條 beforeEnter
 * 永久轉址——這不是過渡措施。
 *
 * ⚠ 為何直接呼叫 guard 而不用 router.resolve()／push()：resolve() 不跑 navigation
 * guard（同 portalClassHubRedirect.test.ts 的理由），push() 又會被 requiresAuth
 * 攔去登入頁。取 route record 的 beforeEnter 直接測，才真的驗到轉向規則。
 */
type GuardFn = (to: { query: Record<string, unknown> }) => unknown

function activityGuard(): GuardFn {
  const rec = router.getRoutes().find((r) => r.path === '/portal/activity')
  expect(rec, '/portal/activity 的 route record 必須存在').toBeTruthy()
  const guard = rec!.beforeEnter
  const fn = Array.isArray(guard) ? guard[0] : guard
  expect(typeof fn, 'beforeEnter 要是 function：需讀 query 決定是否轉址').toBe('function')
  return fn as unknown as GuardFn
}

describe('課程點名獨立路由', () => {
  it('/portal/activity/attendance 是可直達的獨立頁（非轉址）', () => {
    const rec = router.getRoutes().find((r) => r.path === '/portal/activity/attendance')
    expect(rec, '課程點名必須有自己的 route record').toBeTruthy()
    expect(rec!.redirect, '它是真頁面，不能退回成轉址').toBeFalsy()
    expect(rec!.name).toBe('portal-activity-attendance')
    expect(rec!.meta?.title).toBe('課程點名')
  })

  it('舊網址 ?tab=attendance 轉到獨立頁（存量書籤與推播 deep link）', () => {
    expect(activityGuard()({ query: { tab: 'attendance' } })).toEqual({
      path: '/portal/activity/attendance',
      replace: true,
    })
  })

  it('不帶 tab 時照常顯示才藝報名頁', () => {
    expect(activityGuard()({ query: {} })).toBe(true)
  })

  it('帶其他 tab 值也不轉址（舊的 ?tab=registrations 仍停在本頁）', () => {
    expect(activityGuard()({ query: { tab: 'registrations' } })).toBe(true)
  })
})
