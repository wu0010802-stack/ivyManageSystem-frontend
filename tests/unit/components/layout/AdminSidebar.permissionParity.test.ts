/**
 * 守衛：側欄選單的權限 gate 必須與 route guard 的規則一致。
 *
 * 側欄用 `v-if="canView.X"` 決定顯不顯示，route guard 用
 * `ROUTE_PERMISSION_RULES` 決定進不進得去，兩份表各自手工維護。漂移的後果不是
 * 越權（guard 是 default-deny，仍會擋下），而是**使用者看得到卻進不去**：點下去
 * 被彈到「第一個有權限的路由」，畫面隨機跳頁，沒有任何「無權限」提示，使用者
 * 無從自我診斷。反方向（側欄比 guard 嚴）則會讓以側欄為準的權限稽核得出錯誤結論。
 *
 * 2026-07-27 建立本測試時實際抓到 3 條漂移（SA-005 A3）：
 *   - /dismissal-queue        側欄 STUDENTS_READ → 規則要 DISMISSAL_CALLS_READ
 *   - /admin/gov-reports/...  側欄 SALARY_READ   → 規則要 GOV_REPORTS_VIEW
 *   - /gov-reports            側欄 SALARY_READ   → 規則要 REPORTS
 *
 * `src/constants/permissions.ts` 的行內註解自述同型回歸已發生過數次，靠人記得
 * 顯然不夠。
 *
 * 讀 SFC 原始碼而非 mount 元件：這裡要驗的是「兩份表的對應關係」這個靜態事實，
 * 掛起整個 Element Plus 選單只會引入不相干的失敗來源。
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ROUTE_PERMISSION_RULES } from '@/constants/permissions'

// happy-dom 環境下 import.meta.url 不是 file: scheme，只能從 cwd 解析。
const SIDEBAR = resolve(process.cwd(), 'src/components/layout/AdminSidebar.vue')

/**
 * 與 `src/utils/auth.ts` 的 `getRoutePermissions` 同邏輯：取所有匹配規則中
 * path 最長的一組（避免短前綴覆蓋具體路徑），回傳陣列代表 OR 語意。
 *
 * 刻意重寫而非 import：auth.ts 沒有 export 它，而測試也不該依賴被測物的
 * 私有實作——兩邊各自寫一次，任一邊改動都會讓這裡紅。
 */
function routePermissions(path: string): string[] {
  const matched = ROUTE_PERMISSION_RULES.filter((rule) =>
    rule.prefix ? path === rule.path || path.startsWith(`${rule.path}/`) : path === rule.path
  )
  if (matched.length === 0) return []
  const maxLen = Math.max(...matched.map((r) => r.path.length))
  return matched.filter((r) => r.path.length === maxLen).map((r) => r.permission)
}

interface MenuGate {
  path: string
  permissions: string[]
}

/** 抽出所有 `<el-menu-item v-if="...canView.X..." index="/path">` 的 (path, [X]) 對。 */
function sidebarGates(): MenuGate[] {
  if (!existsSync(SIDEBAR)) {
    throw new Error(`找不到 AdminSidebar.vue（解析為 ${SIDEBAR}）——路徑失效會讓本測試假綠`)
  }
  const source = readFileSync(SIDEBAR, 'utf-8')
  const gates: MenuGate[] = []
  const itemRe = /<el-menu-item\s+([^>]*?)index="([^"]+)"/g

  for (const match of source.matchAll(itemRe)) {
    const [, attrs, path] = match
    if (!path.startsWith('/')) continue
    const vIf = /v-if="([^"]*)"/.exec(attrs)
    if (!vIf) continue
    const permissions = [...vIf[1].matchAll(/canView\.([A-Z_]+)/g)].map((m) => m[1])
    if (permissions.length === 0) continue // 非權限條件（如 isMobile）不在本測試範圍
    gates.push({ path, permissions })
  }
  return gates
}

describe('AdminSidebar 權限 gate 與 route guard 規則一致性', () => {
  it('抽得到足夠的選單項（避免 regex 失效造成假綠）', () => {
    const gates = sidebarGates()
    expect(gates.length).toBeGreaterThan(20)
    // 釘住三個曾漂移的路徑，重構改名時直接紅而非靜默略過
    const paths = gates.map((g) => g.path)
    expect(paths).toContain('/dismissal-queue')
    expect(paths).toContain('/gov-reports')
    expect(paths).toContain('/admin/gov-reports/monthly')
  })

  it('每個選單項的 canView 權限都必須是該路由規則接受的權限', () => {
    const offenders: string[] = []

    for (const { path, permissions } of sidebarGates()) {
      const allowed = routePermissions(path)
      if (allowed.length === 0) continue // 該路徑無 guard 規則，不在本測試範圍

      const mismatched = permissions.filter((p) => !allowed.includes(p))
      if (mismatched.length > 0) {
        offenders.push(
          `  ${path}\n` +
            `      側欄 gate: ${permissions.join(' | ')}\n` +
            `      規則接受: ${allowed.join(' | ')}\n` +
            `      不被接受: ${mismatched.join(', ')}`
        )
      }
    }

    expect(
      offenders,
      '側欄權限與 route guard 規則漂移。持有側欄權限但不在規則內的使用者，' +
        '會看到選單卻在點擊後被彈走（無錯誤提示，無法自我診斷）。\n' +
        '修法：改 AdminSidebar.vue 的 canView.X 對齊 ROUTE_PERMISSION_RULES，' +
        '或補規則。\n' +
        offenders.join('\n')
    ).toEqual([])
  })
})
