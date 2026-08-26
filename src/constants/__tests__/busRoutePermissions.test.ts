/**
 * 娃娃車管理（/bus 整合頁）路由權限規則。
 *
 * admin 路由的授權**不看** `meta.permission`（那只對 `/portal/*` 生效），而是
 * `router.beforeEach` → `canAccessRoute(path)` → `ROUTE_PERMISSION_RULES`。
 * 2026-08-13 起三頁整合為 /bus 單一入口＋頁內分頁，2026-08-26 班次排程再加
 * 今日調度與設定兩頁：
 * - /bus 主路由承載 BUS_READ / BUS_WRITE（OR，落點由 redirect 依權限決定）；
 * - 五個分頁子路由各自 exact 掛自己的碼——**不可 prefix**，否則 BUS_WRITE
 *   會外溢到監看／歷史／今日調度（或反向讓唯讀權限進得了寫入頁、進頁後端點全 403）；
 * - /bus/dispatch 掛 BUS_READ 而非 BUS_WRITE：發車後的編輯由頁內
 *   BUS_IN_PROGRESS_WRITE 控制，route 層收緊會讓唯讀行政看不到當日名單；
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

  it('/bus/dispatch 掛 BUS_READ（進頁碼；寫入鎖在頁內，非 prefix）', () => {
    const rules = rulesFor('/bus/dispatch')
    expect(rules.map((r) => r.permission)).toEqual([PERMISSION_NAMES.BUS_READ])
    expect(rules.some((r) => 'prefix' in r && r.prefix)).toBe(false)
  })

  it('/bus/settings 掛 BUS_WRITE（單條、非 prefix）', () => {
    const rules = rulesFor('/bus/settings')
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
  it('五個分頁子路由掛在 /bus 底下且有標題', () => {
    const monitor = router.resolve('/bus/monitor')
    expect(monitor.matched[0]?.meta.title).toBe('娃娃車管理')
    expect(monitor.matched.at(-1)?.meta.title).toBe('娃娃車即時監看')
    expect(router.resolve('/bus/history').matched.at(-1)?.meta.title).toBe('娃娃車乘車歷史')
    expect(router.resolve('/bus/routes').matched.at(-1)?.meta.title).toBe('娃娃車路線管理')
    expect(router.resolve('/bus/dispatch').matched.at(-1)?.meta.title).toBe('娃娃車今日調度')
    expect(router.resolve('/bus/settings').matched.at(-1)?.meta.title).toBe('娃娃車設定')
  })

  it('新分頁掛 route name（BusLayout 的 tab name 與路徑尾段一致）', () => {
    expect(router.resolve('/bus/dispatch').name).toBe('bus-dispatch')
    expect(router.resolve('/bus/settings').name).toBe('bus-settings')
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

  // 上面兩條是落點的**字面值**，這條是落點的**不變式**：進得了 /bus 的人，
  // redirect 送他去的分頁自己也必須進得去。硬編字面值擋不住「加了分頁、順手改
  // redirect」造成的自撞——落到進不去的分頁會被 guard 再彈一次到 /error，使用者
  // 看到的是「側欄點得到、點進去變錯誤頁」，而且完全無從診斷。
  it('落點不變式：凡進得了 /bus 的權限組合，其 redirect 落點自己也進得去', () => {
    const record = routes.find((r) => r.path === '/bus')
    const resolveRedirect = record?.redirect as (to: unknown) => string

    const combos: { role: string; permission_names: string[] }[] = [
      { role: 'admin', permission_names: ['BUS_READ'] },
      { role: 'admin', permission_names: ['BUS_WRITE'] },
      { role: 'admin', permission_names: ['BUS_READ', 'BUS_WRITE'] },
      { role: 'admin', permission_names: ['*'] },
      { role: 'admin', permission_names: ['BUS_READ', 'BUS_IN_PROGRESS_WRITE'] },
      { role: 'admin', permission_names: ['BUS_WRITE', 'BUS_IN_PROGRESS_WRITE'] },
      { role: 'admin', permission_names: ['BUS_IN_PROGRESS_WRITE'] },
      { role: 'admin', permission_names: ['BUS_TRIPS_OPERATE'] },
      { role: 'teacher', permission_names: ['*'] },
    ]

    for (const combo of combos) {
      setUserInfo(combo)
      const label = `${combo.role}:${combo.permission_names.join('+')}`
      // 進不了 /bus 的人根本不會走到 redirect（guard 先彈），不在本不變式範圍。
      if (!canAccessRoute('/bus')) continue
      expect(canAccessRoute(resolveRedirect({})), label).toBe(true)
    }

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
    expect(canAccessRoute('/bus/dispatch')).toBe(true)
    expect(canAccessRoute('/bus/routes')).toBe(false)
    expect(canAccessRoute('/bus/settings')).toBe(false)
  })

  it('只有 BUS_WRITE：可進 /bus 與路線管理分頁，不可進監看／歷史分頁', () => {
    setUserInfo({ role: 'admin', permission_names: ['BUS_WRITE'] })
    expect(canAccessRoute('/bus')).toBe(true)
    expect(canAccessRoute('/bus/routes')).toBe(true)
    expect(canAccessRoute('/bus/settings')).toBe(true)
    expect(canAccessRoute('/bus/monitor')).toBe(false)
    expect(canAccessRoute('/bus/history')).toBe(false)
    expect(canAccessRoute('/bus/dispatch')).toBe(false)
  })

  it('BUS_TRIPS_OPERATE（隨車老師的 per-user 授權）不得進任一管理頁', () => {
    setUserInfo({ role: 'admin', permission_names: ['BUS_TRIPS_OPERATE'] })
    for (const path of [
      '/bus', '/bus/monitor', '/bus/history', '/bus/routes',
      '/bus/dispatch', '/bus/settings',
    ]) {
      expect(canAccessRoute(path), path).toBe(false)
    }
  })

  it('teacher 角色一律走 portal，整合頁不可達（即使被灌 wildcard）', () => {
    setUserInfo({ role: 'teacher', permission_names: ['*'] })
    expect(canAccessRoute('/bus')).toBe(false)
    expect(canAccessRoute('/bus/monitor')).toBe(false)
    expect(canAccessRoute('/bus/routes')).toBe(false)
    expect(canAccessRoute('/bus/dispatch')).toBe(false)
    expect(canAccessRoute('/bus/settings')).toBe(false)
  })

  it('wildcard 管理員新舊路徑皆可進（規則漏掉的話這裡會紅）', () => {
    setUserInfo({ role: 'admin', permission_names: ['*'] })
    for (const path of [
      '/bus',
      '/bus/monitor',
      '/bus/history',
      '/bus/routes',
      '/bus/dispatch',
      '/bus/settings',
      '/bus-monitor',
      '/bus-history',
      '/bus-routes',
    ]) {
      expect(canAccessRoute(path), path).toBe(true)
    }
  })
})

describe('BUS_IN_PROGRESS_WRITE 常數（FE-NAV-01，2026-08-26 班次排程）', () => {
  it('常數存在且與後端 enum 字面一致', () => {
    expect(PERMISSION_NAMES.BUS_IN_PROGRESS_WRITE).toBe('BUS_IN_PROGRESS_WRITE')
  })

  it('主屬娃娃車管理群組 actions（頁面進入權限仍為 BUS_READ，不進 route 規則）', () => {
    // /bus/dispatch 已於 FE-NAV-02 掛上，但進頁碼是 BUS_READ：本碼只控制
    // in_progress 階段的頁內操作可見性。若哪天它出現在 route 規則裡，代表有人把
    // 「發車後可改」錯當成「可進今日調度」——只持檢視碼的行政會被擋在名單外。
    expect(
      ROUTE_PERMISSION_RULES.some((r) => r.permission === 'BUS_IN_PROGRESS_WRITE'),
    ).toBe(false)
  })
})
