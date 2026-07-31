/**
 * 守衛：側欄選單的權限 gate 必須與 route guard 的規則一致。
 *
 * 2026-07-31 manifest 化改造後的資料層版本：側欄不再手寫 v-if="canView.X"，而是由
 * NAVIGATION_MANIFEST 衍生（SIDEBAR_TREE 的 visibleCodes = views ∪ sharedViews），
 * route guard 的 ROUTE_PERMISSION_RULES 也由同一 manifest 衍生。本測試因此不再
 * regex 讀 AdminSidebar.vue SFC，改直接對資料層斷言：每個 manifest 選單頁的
 * (views ∪ sharedViews) 必須 ⊆ 該 routePath 的路由規則接受集合。
 *
 * 為什麼還需要這支測試（衍生同源後看似恆真）：兩份衍生物共用 manifest，但衍生
 * 邏輯各自獨立（deriveSidebarTree vs deriveRoutePermissionRules 的攤平＋冗餘消除
 * ＋最長匹配）。derive.ts 的任何改動（例如冗餘消除規則放寬、prefix 語意變動）若讓
 * 「側欄可見但 guard 拒絕」重新出現，本測試就紅。漂移的後果不是越權（guard 是
 * default-deny，仍會擋下），而是**使用者看得到卻進不去**：點下去被彈到「第一個有
 * 權限的路由」，畫面隨機跳頁，沒有任何「無權限」提示，使用者無從自我診斷。
 *
 * 歷史脈絡：2026-07-27 建立本測試（SFC regex 版）時實際抓到 3 條漂移（SA-005 A3）：
 *   - /dismissal-queue        側欄 STUDENTS_READ → 規則要 DISMISSAL_CALLS_READ
 *   - /admin/gov-reports/...  側欄 SALARY_READ   → 規則要 GOV_REPORTS_VIEW
 *   - /gov-reports            側欄 SALARY_READ   → 規則要 REPORTS
 * 這三個路徑續留為防假綠釘子。
 */

import { describe, expect, it } from 'vitest'

import { ROUTE_PERMISSION_RULES } from '@/constants/permissions'
import { NAVIGATION_MANIFEST } from '@/constants/navigation'
import type { ManifestPage } from '@/constants/navigation'

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

/** manifest 中所有會出現在側欄的頁（有 menu 且有 routePath），取其可見性碼集合。 */
function sidebarGates(): MenuGate[] {
  const allPages: ManifestPage[] = [
    ...NAVIGATION_MANIFEST.topLevel,
    ...NAVIGATION_MANIFEST.groups.filter((g) => !g.pickerOnly).flatMap((g) => [...g.pages]),
  ]
  return allPages
    .filter((p) => p.menu !== undefined && p.routePath !== null)
    .map((p) => ({
      path: p.routePath as string,
      permissions: [...p.views.map((v) => v.code), ...(p.sharedViews ?? [])],
    }))
}

describe('AdminSidebar（manifest 選單頁）權限 gate 與 route guard 規則一致性', () => {
  it('抽得到足夠的選單頁（避免 manifest 結構改動造成假綠）', () => {
    const gates = sidebarGates()
    expect(gates.length).toBeGreaterThan(20)
    // 釘住三個曾漂移的路徑，重構改名時直接紅而非靜默略過
    const paths = gates.map((g) => g.path)
    expect(paths).toContain('/dismissal-queue')
    expect(paths).toContain('/gov-reports')
    expect(paths).toContain('/admin/gov-reports/monthly')
  })

  it('每個選單頁的 (views ∪ sharedViews) 都必須被該路由規則接受', () => {
    const offenders: string[] = []

    for (const { path, permissions } of sidebarGates()) {
      const allowed = routePermissions(path)
      if (allowed.length === 0) {
        // 選單頁完全沒有 guard 規則 = 全員 default-deny 卻顯示選單，必為漂移
        offenders.push(`  ${path}\n      無任何路由規則（default-deny 會擋下所有人）`)
        continue
      }

      const mismatched = permissions.filter((p) => !allowed.includes(p))
      if (mismatched.length > 0) {
        offenders.push(
          `  ${path}\n` +
            `      側欄可見碼: ${permissions.join(' | ')}\n` +
            `      規則接受: ${allowed.join(' | ')}\n` +
            `      不被接受: ${mismatched.join(', ')}`
        )
      }
    }

    expect(
      offenders,
      '側欄可見性與 route guard 規則漂移。持有側欄可見碼但不在規則內的使用者，' +
        '會看到選單卻在點擊後被彈走（無錯誤提示，無法自我診斷）。\n' +
        '修法：調整 navigation/manifest.ts 的 views/sharedViews/extraRoutes，' +
        '或檢查 derive.ts 的衍生邏輯（冗餘消除／最長匹配）是否被改壞。\n' +
        offenders.join('\n')
    ).toEqual([])
  })
})
