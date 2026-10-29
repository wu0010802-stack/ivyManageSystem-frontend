/**
 * 政府報表五頁（教育部四頁 + 勞健保與稅務申報）的側欄入口。
 *
 * 2026-10-12 業主指示曾整組自側邊欄下架；2026-10-29 後台 IA 重整 批次 2 以「財務」群組下
 * 單一選單項「政府申報」恢復（指到 /admin/gov-reports/monthly，頁內由頁籤列串起五頁）。
 * 其餘四個路徑仍不是獨立側欄項目；路由、權限規則、權限編輯器節點與後端 API 皆不動，
 * 深連結仍以原權限碼守衛。
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { SIDEBAR_TREE } from '@/constants/navigation'
import { canAccessRoute, setUserInfo } from '@/utils/auth'

const GOV_VIEW_PATHS = [
  '/admin/gov-reports/monthly',
  '/admin/gov-reports/certificates',
  '/admin/gov-reports/subsidies',
  '/admin/gov-reports/iep',
] as const

const GOV_ENTRY = '/admin/gov-reports/monthly'

const allSidebarItemPaths = (): string[] => [
  ...SIDEBAR_TREE.topLevel.map((i) => i.index),
  ...SIDEBAR_TREE.bottomLevel.map((i) => i.index),
  ...SIDEBAR_TREE.groups.flatMap((g) => g.items.map((i) => i.index)),
]

describe('政府申報只有一個側欄入口（財務群組）', () => {
  it('入口是 /admin/gov-reports/monthly，其餘四個路徑不是側邊欄項目', () => {
    const all = allSidebarItemPaths()
    expect(all).toContain(GOV_ENTRY)
    for (const path of [
      '/admin/gov-reports/certificates',
      '/admin/gov-reports/subsidies',
      '/admin/gov-reports/iep',
      '/gov-reports',
    ]) {
      expect(all).not.toContain(path)
    }
  })

  it('入口在「財務」群組，標題「政府申報」，可見性碼只有 GOV_REPORTS_VIEW（與目標路由 gate 一致）', () => {
    const finance = SIDEBAR_TREE.groups.find((g) => g.index === 'group-finance')
    const entry = finance?.items.find((i) => i.index === GOV_ENTRY)
    expect(entry?.title).toBe('政府申報')
    expect(entry?.visibleCodes).toEqual(['GOV_REPORTS_VIEW'])
  })

  it('「園務行政」群組仍保留其餘項目（防整組被誤刪的假綠）', () => {
    const admin = SIDEBAR_TREE.groups.find((g) => g.index === 'group-admin')
    expect(admin?.items.map((i) => i.index)).toEqual(
      expect.arrayContaining(['/announcements', '/calendar', '/surveys'])
    )
    // 收付款管理 2026-10-29（後台 IA 重整 批次 2）起移到「財務」群組
    const finance = SIDEBAR_TREE.groups.find((g) => g.index === 'group-finance')
    expect(finance?.items.map((i) => i.index)).toEqual(
      expect.arrayContaining(['/fees', '/finance-signoffs', '/reports', GOV_ENTRY])
    )
  })
})

describe('政府報表五頁的深連結守衛不變', () => {
  beforeEach(() => setUserInfo({ role: 'admin', permission_names: ['GOV_REPORTS_VIEW'] }))

  it('持 GOV_REPORTS_VIEW：教育部四頁仍進得去', () => {
    for (const path of GOV_VIEW_PATHS) {
      expect(canAccessRoute(path)).toBe(true)
    }
  })

  it('持 GOV_REPORTS_VIEW：擋在勞健保與稅務申報之外', () => {
    expect(canAccessRoute('/gov-reports')).toBe(false)
  })

  it('持 GOV_REPORTS_EXPORT：勞健保與稅務申報仍進得去', () => {
    setUserInfo({ role: 'admin', permission_names: ['GOV_REPORTS_EXPORT'] })
    expect(canAccessRoute('/gov-reports')).toBe(true)
  })
})
