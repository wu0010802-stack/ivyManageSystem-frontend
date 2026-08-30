import { describe, it, expect, vi } from 'vitest'

// guard restoreSessionIfNeeded 可能呼叫 refreshSession，不可真打網路
vi.mock('@/api/auth', () => ({
  refreshSession: vi.fn(() => Promise.reject(new Error('no-network'))),
}))

import router from '@/router'
import { TEACHER_PORTAL_ROUTES } from '@/constants/permissions'

/**
 * TEACHER_PORTAL_ROUTES 漂移守衛（2026-08-24）。
 *
 * 背景：此清單曾停在 11 條舊路由、缺近 20 個後來新增的頁面。目前唯一消費端
 * getAllowedRoutes()（teacher 分支）在 router guard 的實際流程走不到（teacher
 * 先被導回 /portal/home），暫時無害——但任何人日後拿它做教師端選單/快捷
 * 產生器就會直接漏頁。本測試把清單釘到 router 真實路由樹：新增/移除 portal
 * 頁面時同步更新 src/constants/permissions.ts 的 TEACHER_PORTAL_ROUTES。
 *
 * 比對口徑：/portal 底下「可直達的靜態頁面」——排除動態參數路由（:param）、
 * 純轉址路由（redirect）與 noAuth 的登入頁。
 */
describe('TEACHER_PORTAL_ROUTES 與 router 路由樹同步', () => {
  const actual = router
    .getRoutes()
    .filter(
      (r) =>
        (r.path === '/portal' || r.path.startsWith('/portal/')) &&
        !r.path.includes(':') &&
        !r.redirect &&
        !r.meta?.noAuth,
    )
    .map((r) => r.path)
    .sort()

  it('清單與實際 portal 靜態路由一致（無缺頁、無過時項）', () => {
    expect([...TEACHER_PORTAL_ROUTES].sort()).toEqual(actual)
  })
})
