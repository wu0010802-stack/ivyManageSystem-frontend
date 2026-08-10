/**
 * 娃娃車兩個管理端路由的權限規則。
 *
 * admin 路由的授權**不看** `meta.permission`（那只對 `/portal/*` 生效），而是
 * `router.beforeEach` → `canAccessRoute(path)` → `ROUTE_PERMISSION_RULES`。
 * 因此：
 * - 漏了規則 → default-deny 把**所有人**（含 wildcard 管理員）鎖在頁外；
 * - 規則掛太寬（例如 /bus-routes 只要 BUS_READ）→ 只有唯讀權限的人進得了寫入頁，
 *   而該頁的三個端點後端要 BUS_WRITE，畫面上會變成「每個動作都 403」。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import router from '@/router'
import { ROUTE_PERMISSION_RULES, PERMISSION_NAMES } from '@/constants/permissions'
import { canAccessRoute, setUserInfo } from '@/utils/auth'

const rulesFor = (path: string) => ROUTE_PERMISSION_RULES.filter((r) => r.path === path)

describe('娃娃車路由權限規則', () => {
  it('/bus-routes 掛 BUS_WRITE（單條、非 prefix）', () => {
    const rules = rulesFor('/bus-routes')
    expect(rules.map((r) => r.permission)).toEqual([PERMISSION_NAMES.BUS_WRITE])
    expect(rules.some((r) => 'prefix' in r && r.prefix)).toBe(false)
  })

  it('/bus-monitor 掛 BUS_READ（單條、非 prefix）', () => {
    const rules = rulesFor('/bus-monitor')
    expect(rules.map((r) => r.permission)).toEqual([PERMISSION_NAMES.BUS_READ])
    expect(rules.some((r) => 'prefix' in r && r.prefix)).toBe(false)
  })

  it('/bus-history 掛 BUS_READ（單條、非 prefix）', () => {
    const rules = rulesFor('/bus-history')
    expect(rules.map((r) => r.permission)).toEqual([PERMISSION_NAMES.BUS_READ])
    expect(rules.some((r) => 'prefix' in r && r.prefix)).toBe(false)
  })

  it('三條路由都註冊在 router 上且有標題', () => {
    expect(router.resolve('/bus-routes').matched.at(-1)?.meta.title).toBe('娃娃車路線')
    expect(router.resolve('/bus-monitor').matched.at(-1)?.meta.title).toBe('娃娃車監看')
    expect(router.resolve('/bus-history').matched.at(-1)?.meta.title).toBe('娃娃車乘車歷史')
  })
})

describe('canAccessRoute', () => {
  beforeEach(() => setUserInfo(null))

  it('只有 BUS_READ：可進監看頁與乘車歷史頁，不可進路線管理頁', () => {
    setUserInfo({ role: 'admin', permission_names: ['BUS_READ'] })
    expect(canAccessRoute('/bus-monitor')).toBe(true)
    expect(canAccessRoute('/bus-history')).toBe(true)
    expect(canAccessRoute('/bus-routes')).toBe(false)
  })

  it('只有 BUS_WRITE：可進路線管理頁', () => {
    setUserInfo({ role: 'admin', permission_names: ['BUS_WRITE'] })
    expect(canAccessRoute('/bus-routes')).toBe(true)
  })

  it('BUS_TRIPS_OPERATE（隨車老師的 per-user 授權）不得進任一管理頁', () => {
    setUserInfo({ role: 'admin', permission_names: ['BUS_TRIPS_OPERATE'] })
    expect(canAccessRoute('/bus-routes')).toBe(false)
    expect(canAccessRoute('/bus-monitor')).toBe(false)
    expect(canAccessRoute('/bus-history')).toBe(false)
  })

  it('teacher 角色一律走 portal，三頁皆不可達（即使被灌 wildcard）', () => {
    setUserInfo({ role: 'teacher', permission_names: ['*'] })
    expect(canAccessRoute('/bus-routes')).toBe(false)
    expect(canAccessRoute('/bus-monitor')).toBe(false)
    expect(canAccessRoute('/bus-history')).toBe(false)
  })

  it('wildcard 管理員三頁皆可進（規則漏掉的話這裡會紅）', () => {
    setUserInfo({ role: 'admin', permission_names: ['*'] })
    expect(canAccessRoute('/bus-routes')).toBe(true)
    expect(canAccessRoute('/bus-monitor')).toBe(true)
    expect(canAccessRoute('/bus-history')).toBe(true)
  })
})
