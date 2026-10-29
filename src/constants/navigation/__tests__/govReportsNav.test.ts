/**
 * 政府報表五頁（教育部四頁 + 勞健保與稅務申報）暫時自側邊欄下架（業主指示，2026-10-12）。
 *
 * 只拿掉選單入口：路由、權限規則、權限編輯器節點與後端 API 全部保留，
 * 深連結仍以原權限碼守衛——日後恢復只需把 manifest 的 menu 加回去。
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

const allSidebarItemPaths = (): string[] => [
  ...SIDEBAR_TREE.topLevel.map((i) => i.index),
  ...SIDEBAR_TREE.bottomLevel.map((i) => i.index),
  ...SIDEBAR_TREE.groups.flatMap((g) => g.items.map((i) => i.index)),
]

describe('政府報表五頁不出現在側邊欄', () => {
  it('五個路徑都不是側邊欄項目', () => {
    const all = allSidebarItemPaths()
    for (const path of [...GOV_VIEW_PATHS, '/gov-reports']) {
      expect(all).not.toContain(path)
    }
  })

  it('「園務行政」群組仍保留其餘項目（防整組被誤刪的假綠）', () => {
    const admin = SIDEBAR_TREE.groups.find((g) => g.index === 'group-admin')
    expect(admin?.items.map((i) => i.index)).toEqual(
      expect.arrayContaining(['/announcements', '/calendar', '/surveys'])
    )
    // 收付款管理 2026-10-29（後台 IA 重整 批次 2）起移到「財務」群組
    const finance = SIDEBAR_TREE.groups.find((g) => g.index === 'group-finance')
    expect(finance?.items.map((i) => i.index)).toEqual(
      expect.arrayContaining(['/fees', '/finance-signoffs', '/reports'])
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
