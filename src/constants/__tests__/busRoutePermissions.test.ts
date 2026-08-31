/**
 * 娃娃車管理（/bus 整合頁）路由權限規則。
 *
 * admin 路由的授權**不看** `meta.permission`（那只對 `/portal/*` 生效），而是
 * `router.beforeEach` → `canAccessRoute(path)` → `ROUTE_PERMISSION_RULES`。
 * 2026-08-13 起三頁整合為 /bus 單一入口＋頁內分頁：
 * - /bus 主路由承載 BUS_READ / BUS_WRITE（OR，落點由 redirect 依權限決定）；
 * - 三個分頁子路由各自 exact 掛自己的碼——**不可 prefix**，否則 BUS_WRITE
 *   會外溢到監看／歷史（或反向讓唯讀權限進得了寫入頁、進頁後端點全 403）；
 * - 舊路徑規則保留供 redirect 解析（比照 /approvals → /workbench/approvals 先例）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import router, { routes } from '@/router'
import { ROUTE_PERMISSION_RULES, PERMISSION_NAMES } from '@/constants/permissions'
import { canAccessRoute, setUserInfo } from '@/utils/auth'

const rulesFor = (path: string) => ROUTE_PERMISSION_RULES.filter((r) => r.path === path)

describe('娃娃車路由權限規則', () => {
  it('/bus 主路由承載 BUS_READ + BUS_WRITE（OR、非 prefix）', () => {
    const rules = rulesFor('/bus')
    expect(rules.map((r) => r.permission).sort()).toEqual([
      PERMISSION_NAMES.BUS_READ,
      PERMISSION_NAMES.BUS_WRITE,
    ])
    expect(rules.some((r) => 'prefix' in r && r.prefix)).toBe(false)
  })

  it('/bus/monitor 與 /bus/history 掛 BUS_READ（各單條、非 prefix）', () => {
    for (const path of ['/bus/monitor', '/bus/history']) {
      const rules = rulesFor(path)
      expect(rules.map((r) => r.permission), path).toEqual([PERMISSION_NAMES.BUS_READ])
      expect(rules.some((r) => 'prefix' in r && r.prefix), path).toBe(false)
    }
  })

  it('/bus/routes 掛 BUS_WRITE（單條、非 prefix）', () => {
    const rules = rulesFor('/bus/routes')
    expect(rules.map((r) => r.permission)).toEqual([PERMISSION_NAMES.BUS_WRITE])
    expect(rules.some((r) => 'prefix' in r && r.prefix)).toBe(false)
  })

  it('舊路徑規則保留供 redirect 解析（同權限、非 prefix）', () => {
    expect(rulesFor('/bus-monitor').map((r) => r.permission)).toEqual([PERMISSION_NAMES.BUS_READ])
    expect(rulesFor('/bus-history').map((r) => r.permission)).toEqual([PERMISSION_NAMES.BUS_READ])
    expect(rulesFor('/bus-routes').map((r) => r.permission)).toEqual([PERMISSION_NAMES.BUS_WRITE])
  })
})

describe('路由結構（/bus 巢狀 + 舊路徑 redirect）', () => {
  it('三個分頁子路由掛在 /bus 底下且有標題', () => {
    const monitor = router.resolve('/bus/monitor')
    expect(monitor.matched[0]?.meta.title).toBe('娃娃車管理')
    expect(monitor.matched.at(-1)?.meta.title).toBe('娃娃車即時監看')
    expect(router.resolve('/bus/history').matched.at(-1)?.meta.title).toBe('娃娃車乘車歷史')
    expect(router.resolve('/bus/routes').matched.at(-1)?.meta.title).toBe('娃娃車路線管理')
  })

  it('舊路徑 redirect 到對應分頁（書籤與外部連結不壞）', () => {
    const redirectOf = (path: string) => routes.find((r) => r.path === path)?.redirect
    expect(redirectOf('/bus-monitor')).toBe('/bus/monitor')
    expect(redirectOf('/bus-history')).toBe('/bus/history')
    expect(redirectOf('/bus-routes')).toBe('/bus/routes')
  })

  it('/bus 落點依權限：有 BUS_READ 進監看、只有 BUS_WRITE 進路線管理', () => {
    const record = routes.find((r) => r.path === '/bus')
    expect(typeof record?.redirect).toBe('function')
    const resolveRedirect = record?.redirect as (to: unknown) => string

    setUserInfo({ role: 'admin', permission_names: ['BUS_READ'] })
    expect(resolveRedirect({})).toBe('/bus/monitor')

    setUserInfo({ role: 'admin', permission_names: ['BUS_WRITE'] })
    expect(resolveRedirect({})).toBe('/bus/routes')

    setUserInfo(null)
  })
})

describe('canAccessRoute', () => {
  beforeEach(() => setUserInfo(null))

  it('只有 BUS_READ：可進 /bus 與監看／歷史分頁，不可進路線管理分頁', () => {
    setUserInfo({ role: 'admin', permission_names: ['BUS_READ'] })
    expect(canAccessRoute('/bus')).toBe(true)
    expect(canAccessRoute('/bus/monitor')).toBe(true)
    expect(canAccessRoute('/bus/history')).toBe(true)
    expect(canAccessRoute('/bus/routes')).toBe(false)
  })

  it('只有 BUS_WRITE：可進 /bus 與路線管理分頁，不可進監看／歷史分頁', () => {
    setUserInfo({ role: 'admin', permission_names: ['BUS_WRITE'] })
    expect(canAccessRoute('/bus')).toBe(true)
    expect(canAccessRoute('/bus/routes')).toBe(true)
    expect(canAccessRoute('/bus/monitor')).toBe(false)
    expect(canAccessRoute('/bus/history')).toBe(false)
  })

  it('BUS_TRIPS_OPERATE（隨車老師的 per-user 授權）不得進任一管理頁', () => {
    setUserInfo({ role: 'admin', permission_names: ['BUS_TRIPS_OPERATE'] })
    for (const path of ['/bus', '/bus/monitor', '/bus/history', '/bus/routes']) {
      expect(canAccessRoute(path), path).toBe(false)
    }
  })

  it('teacher 角色一律走 portal，整合頁不可達（即使被灌 wildcard）', () => {
    setUserInfo({ role: 'teacher', permission_names: ['*'] })
    expect(canAccessRoute('/bus')).toBe(false)
    expect(canAccessRoute('/bus/monitor')).toBe(false)
    expect(canAccessRoute('/bus/routes')).toBe(false)
  })

  it('wildcard 管理員新舊路徑皆可進（規則漏掉的話這裡會紅）', () => {
    setUserInfo({ role: 'admin', permission_names: ['*'] })
    for (const path of [
      '/bus',
      '/bus/monitor',
      '/bus/history',
      '/bus/routes',
      '/bus-monitor',
      '/bus-history',
      '/bus-routes',
    ]) {
      expect(canAccessRoute(path), path).toBe(true)
    }
  })
})
