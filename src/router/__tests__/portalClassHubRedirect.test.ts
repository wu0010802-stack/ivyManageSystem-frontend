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

  it('不帶 query 轉到首頁（班級功能 2026-09-14 併入首頁）', () => {
    expect(classHubRedirect()({ query: {} })).toEqual({ path: '/portal/home' })
  })

  it('帶其他 sheet 值也轉到首頁（不是 404）', () => {
    expect(classHubRedirect()({ query: { sheet: 'attendance' } })).toEqual({
      path: '/portal/home',
    })
  })

  it('router 已無 portal-class-hub 這個 name', () => {
    expect(router.hasRoute('portal-class-hub')).toBe(false)
  })
})

/**
 * /portal/class 於 2026-09-14 整頁併進 /portal/home。這條轉址同樣是永久的：
 * 老師的書籤、側欄舊連結與 class-hub 轉過來的流量都落在這裡。
 *
 * 必須保留 query——側欄「全班量體位」與存量通知走的是 ?sheet=measurement，
 * 字串形式的 redirect 會把 query 丟掉，抽屜就再也不會開。
 */
describe('/portal/class 併入首頁後的 redirect', () => {
  function classRedirect(): RedirectFn {
    const rec = router.getRoutes().find((r) => r.path === '/portal/class')
    expect(rec, '/portal/class 的 route record 必須存在（存量書籤靠它）').toBeTruthy()
    expect(typeof rec!.redirect, 'redirect 要是 function：需保留 query').toBe('function')
    return rec!.redirect as RedirectFn
  }

  it('轉到 /portal/home', () => {
    expect(classRedirect()({ query: {} })).toEqual({ path: '/portal/home', query: {} })
  })

  it('保留 ?sheet=measurement，否則側欄的全班量體位再也開不了抽屜', () => {
    expect(classRedirect()({ query: { sheet: 'measurement' } })).toEqual({
      path: '/portal/home',
      query: { sheet: 'measurement' },
    })
  })

  it('保留 ?classroom_id=（多班教師的深連結）', () => {
    expect(classRedirect()({ query: { classroom_id: '5' } })).toEqual({
      path: '/portal/home',
      query: { classroom_id: '5' },
    })
  })

  it('router 已無 portal-class 這個 name', () => {
    expect(router.hasRoute('portal-class')).toBe(false)
  })
})
