import { describe, it, expect, vi } from 'vitest'

vi.mock('@/api/auth', () => ({
  refreshSession: vi.fn(() => Promise.reject(new Error('no-network'))),
}))

import router from '@/router'

/**
 * 存量推播的 deep_link 已寫進 DB 改不動（SPEC-024）：
 * - 用藥提醒：/portal/class-hub?sheet=medication&id=<log_id>
 * - 學生請假：/portal/class-hub
 * 這條 redirect 必須永久保留，不是過渡措施。
 *
 * ⚠ 為何直接呼叫 redirect 函式而不用 router.resolve()：vue-router 4 的
 * resolve() **不跟隨 redirect**——redirect 是在 navigation guard 階段才解析的，
 * resolve('/portal/class-hub') 仍回傳原 path。用 router.push() 則會被
 * requiresAuth guard 攔去登入頁。取 route record 的 redirect 函式直接測，
 * 是唯一不依賴導航流程、又真的驗到轉向規則的方式。
 */
type RedirectFn = (to: { query: Record<string, unknown> }) => unknown

function classHubRedirect(): RedirectFn {
  const rec = router.getRoutes().find((r) => r.path === '/portal/class-hub')
  expect(rec, '/portal/class-hub 的 route record 必須存在（存量通知靠它）').toBeTruthy()
  const redirect = rec!.redirect
  expect(typeof redirect, 'redirect 要是 function：需讀 query 決定去向').toBe('function')
  return redirect as RedirectFn
}

describe('/portal/class-hub 舊連結 redirect', () => {
  it('帶 ?sheet=medication 轉到用藥執行頁並保留 id', () => {
    expect(classHubRedirect()({ query: { sheet: 'medication', id: '42' } })).toEqual({
      path: '/portal/medications',
      query: { id: '42' },
    })
  })

  it('不帶 query 轉到班級總覽', () => {
    expect(classHubRedirect()({ query: {} })).toEqual({ path: '/portal/class' })
  })

  it('帶其他 sheet 值也轉到班級總覽（不是 404）', () => {
    expect(classHubRedirect()({ query: { sheet: 'attendance' } })).toEqual({
      path: '/portal/class',
    })
  })

  it('router 已無 portal-class-hub 這個 name', () => {
    expect(router.hasRoute('portal-class-hub')).toBe(false)
  })
})
