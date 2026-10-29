/**
 * 政府申報頁籤表守衛（後台 IA 重整 批次 2，2026-10-29）。
 *
 * 頁籤的 permission 必須與該頁路由規則接受的碼完全一致：頁籤看得到卻點不進去，
 * 會被路由守衛彈到「第一個有權限的路由」，使用者無從診斷。
 * 另外釘住：五頁都掛在同一個頁籤殼之下、舊網址不變、舊路由名稱不變。
 */
import { describe, expect, it } from 'vitest'

import router from '@/router'
import { ROUTE_PERMISSION_RULES } from '@/constants/permissions'
import { GOV_REPORT_TABS } from '../govReportTabs'

/** 與 auth.ts getRoutePermissions 同語意（最長匹配那組）；刻意重寫，不依賴被測物私有實作。 */
function routePermissions(path: string): string[] {
  const matched = ROUTE_PERMISSION_RULES.filter((rule) =>
    rule.prefix ? path === rule.path || path.startsWith(`${rule.path}/`) : path === rule.path
  )
  if (matched.length === 0) return []
  const maxLen = Math.max(...matched.map((r) => r.path.length))
  return matched.filter((r) => r.path.length === maxLen).map((r) => r.permission)
}

describe('GOV_REPORT_TABS ↔ 路由規則', () => {
  it('五個頁籤，順序＝教育部四頁 → 勞健保與稅務申報', () => {
    expect(GOV_REPORT_TABS.map((t) => t.path)).toEqual([
      '/admin/gov-reports/monthly',
      '/admin/gov-reports/certificates',
      '/admin/gov-reports/subsidies',
      '/admin/gov-reports/iep',
      '/gov-reports',
    ])
  })

  it('每個頁籤的 permission＝該頁路由規則接受的碼（不多不少）', () => {
    for (const tab of GOV_REPORT_TABS) {
      expect(routePermissions(tab.path), tab.path).toEqual([tab.permission])
    }
  })

  it('教育部四頁共用 GOV_REPORTS_VIEW；勞健保與稅務申報是 GOV_REPORTS_EXPORT', () => {
    const byPath = Object.fromEntries(GOV_REPORT_TABS.map((t) => [t.path, t.permission]))
    expect(byPath['/gov-reports']).toBe('GOV_REPORTS_EXPORT')
    for (const path of GOV_REPORT_TABS.map((t) => t.path).filter((p) => p !== '/gov-reports')) {
      expect(byPath[path], path).toBe('GOV_REPORTS_VIEW')
    }
  })
})

describe('router：五頁掛在同一個頁籤殼之下，網址不變', () => {
  it('五個頁籤路徑都解析到實頁，且第一層 matched 是 /admin/gov-reports 殼', () => {
    for (const tab of GOV_REPORT_TABS) {
      const resolved = router.resolve(tab.path)
      expect(resolved.path, tab.path).toBe(tab.path)
      expect(resolved.matched.length, tab.path).toBe(2)
      expect(resolved.matched[0]?.path, tab.path).toBe('/admin/gov-reports')
      expect(resolved.matched[1]?.redirect, `${tab.path} 不得是 redirect`).toBeUndefined()
    }
  })

  it('舊路由名稱不變（既有 router.push({ name }) 呼叫不受影響）', () => {
    const names = Object.fromEntries(
      GOV_REPORT_TABS.map((t) => [t.path, router.resolve(t.path).name])
    )
    expect(names).toEqual({
      '/admin/gov-reports/monthly': 'AdminGovReportsMonthly',
      '/admin/gov-reports/certificates': 'AdminGovReportsCertificates',
      '/admin/gov-reports/subsidies': 'AdminGovReportsSubsidies',
      '/admin/gov-reports/iep': 'AdminGovReportsIep',
      '/gov-reports': 'gov-reports',
    })
  })

  it('各頁 meta.title 不變（頁籤列不改頁面標題）', () => {
    expect(router.resolve('/admin/gov-reports/monthly').meta.title).toBe('月度幼生在園統計')
    expect(router.resolve('/admin/gov-reports/certificates').meta.title).toBe('在學證明開立紀錄')
    expect(router.resolve('/admin/gov-reports/subsidies').meta.title).toBe('特教加給與鐘點費')
    expect(router.resolve('/admin/gov-reports/iep').meta.title).toBe('IEP 個別化教育計畫')
    expect(router.resolve('/gov-reports').meta.title).toBe('勞健保與稅務申報')
  })

  it('/admin/gov-reports 容器導到第一個頁籤（月度幼生在園統計）', () => {
    const last = router.resolve('/admin/gov-reports').matched.at(-1)
    expect(last?.redirect).toBe('/admin/gov-reports/monthly')
  })

  it('教育部三頁的麵包屑父層指向入口 monthly；/gov-reports 不掛 parent（gate 不同）', () => {
    for (const path of [
      '/admin/gov-reports/certificates',
      '/admin/gov-reports/subsidies',
      '/admin/gov-reports/iep',
    ]) {
      expect(router.resolve(path).meta.parent, path).toBe('/admin/gov-reports/monthly')
    }
    expect(router.resolve('/admin/gov-reports/monthly').meta.parent).toBeUndefined()
    expect(router.resolve('/gov-reports').meta.parent).toBeUndefined()
  })
})
