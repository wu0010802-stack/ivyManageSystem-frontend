/**
 * 「家長提問」整個功能下架（業主指示，2026-10-12）。
 *
 * 拿掉的是入口：側欄選單（連同未讀 badge）、公開報名頁「與承辦人員聯繫」、
 * 通知鈴項目（後端）與儀表板「未讀提問」卡。路由、權限規則與後端 API／資料保留，
 * 深連結仍以 ACTIVITY_READ 守衛——恢復時把 manifest 的
 * menu: { icon: icon('ChatDotRound'), badgeKey: 'activityInquiries' } 加回去。
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { SIDEBAR_TREE } from '@/constants/navigation'
import { canAccessRoute, setUserInfo } from '@/utils/auth'

const INQUIRIES_PATH = '/activity/inquiries'

const allSidebarItems = () => [
  ...SIDEBAR_TREE.topLevel,
  ...SIDEBAR_TREE.bottomLevel,
  ...SIDEBAR_TREE.groups.flatMap((g) => g.items),
]

describe('家長提問不出現在側邊欄', () => {
  it('路徑不是側邊欄項目，也沒有任何項目掛 activityInquiries badge', () => {
    const items = allSidebarItems()
    expect(items.map((i) => i.index)).not.toContain(INQUIRIES_PATH)
    expect(items.map((i) => i.title)).not.toContain('家長提問')
    expect(items.filter((i) => i.badgeKey === 'activityInquiries')).toHaveLength(0)
  })

  it('「才藝」群組仍保留其餘項目（防整組被誤刪的假綠）', () => {
    const paths = SIDEBAR_TREE.groups.flatMap((g) => g.items.map((i) => i.index))
    expect(paths).toEqual(
      expect.arrayContaining(['/activity/registrations', '/activity/pos', '/activity/attendance'])
    )
  })
})

describe('家長提問的深連結守衛不變', () => {
  beforeEach(() => setUserInfo({ role: 'admin', permission_names: ['ACTIVITY_READ'] }))

  it('持 ACTIVITY_READ 仍進得去', () => {
    expect(canAccessRoute(INQUIRIES_PATH)).toBe(true)
  })

  it('無 ACTIVITY_READ 擋下', () => {
    setUserInfo({ role: 'admin', permission_names: ['EMPLOYEES_READ'] })
    expect(canAccessRoute(INQUIRIES_PATH)).toBe(false)
  })
})
