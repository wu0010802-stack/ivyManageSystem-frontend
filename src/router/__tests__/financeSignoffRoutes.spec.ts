import { describe, it, expect } from 'vitest'
import type { RouteRecordRaw } from 'vue-router'
import router from '@/router'
import { ROUTE_PERMISSION_RULES } from '@/constants/permissions'

type RedirectFn = (to: { query: Record<string, string> }) => { path: string; query: Record<string, string> }

function flatten(routes: readonly RouteRecordRaw[]): RouteRecordRaw[] {
  return routes.flatMap((r) => [r, ...flatten((r.children ?? []) as RouteRecordRaw[])])
}

const all = flatten(router.options.routes)

describe('收付款管理路由', () => {
  it('/finance-signoffs 存在且標題為收付款管理', () => {
    const rec = all.find((r) => r.path === '/finance-signoffs')
    expect(rec).toBeTruthy()
    expect(rec?.meta?.title).toBe('收付款管理')
  })

  it('/vendor-payments redirect 到 vendor tab 並透傳 query（含 highlight）', () => {
    const rec = all.find((r) => r.path === '/vendor-payments')
    expect(rec?.redirect).toBeTypeOf('function')
    const target = (rec?.redirect as RedirectFn)({ query: { highlight: '5' } })
    expect(target.path).toBe('/finance-signoffs')
    expect(target.query).toMatchObject({ tab: 'vendor', highlight: '5' })
  })

  it('/misc-receipts redirect 到 misc tab 並透傳 query', () => {
    const rec = all.find((r) => r.path === '/misc-receipts')
    expect(rec?.redirect).toBeTypeOf('function')
    const target = (rec?.redirect as RedirectFn)({ query: { highlight: '9' } })
    expect(target.path).toBe('/finance-signoffs')
    expect(target.query).toMatchObject({ tab: 'misc', highlight: '9' })
  })

  it('權限規則：/finance-signoffs 兩碼任一（OR）、舊路徑規則移除', () => {
    const rules = ROUTE_PERMISSION_RULES.filter((r) => r.path === '/finance-signoffs')
    expect(rules.map((r) => r.permission).sort()).toEqual([
      'MISC_RECEIPT_READ',
      'VENDOR_PAYMENT_READ',
    ])
    expect(ROUTE_PERMISSION_RULES.some((r) => r.path === '/vendor-payments')).toBe(false)
    expect(ROUTE_PERMISSION_RULES.some((r) => r.path === '/misc-receipts')).toBe(false)
  })
})
