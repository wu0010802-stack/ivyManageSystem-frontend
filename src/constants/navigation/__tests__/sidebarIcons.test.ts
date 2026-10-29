/**
 * 側欄圖示去重（後台 IA 重整 批次 2，2026-10-29）。
 *
 * 圖示重複會讓使用者無法靠圖示分辨相鄰項目：接送授權 vs 學生（User）、成長冊 vs 才藝設定
 * （Collection）、在籍統計 vs 經營報表（PieChart）。本檔釘住這三組已分開，並守住
 * 「群組圖示不與自己的子項重複」「同群組子項圖示不重複」（總部管理群組是既有例外，不在本批範圍）。
 */
import { describe, expect, it } from 'vitest'

import { SIDEBAR_TREE } from '@/constants/navigation'

const itemIcon = (index: string) => {
  const item = SIDEBAR_TREE.groups.flatMap((g) => g.items).find((i) => i.index === index)
  if (!item) throw new Error(`測試前提失效：側欄找不到 ${index}`)
  return item.icon
}

describe('側欄圖示去重', () => {
  it('接送授權 ≠ 學生', () => {
    expect(itemIcon('/pickup-authorizations')).not.toBe(itemIcon('/students'))
  })

  it('成長冊工作台 ≠ 才藝設定與品項', () => {
    expect(itemIcon('/growth-books')).not.toBe(itemIcon('/activity/settings'))
  })

  it('在籍統計 ≠ 經營報表', () => {
    expect(itemIcon('/enrollment-stats')).not.toBe(itemIcon('/reports'))
  })

  it('群組圖示不與自己的子項圖示重複', () => {
    const offenders = SIDEBAR_TREE.groups
      .filter((g) => g.items.some((i) => i.icon === g.icon))
      .map((g) => g.index)
    expect(offenders).toEqual([])
  })

  it('同一群組內的選單項圖示不重複（總部管理群組為既有例外）', () => {
    const offenders: string[] = []
    for (const group of SIDEBAR_TREE.groups) {
      if (group.index === 'group-platform') continue
      const seen = new Set<unknown>()
      for (const item of group.items) {
        if (seen.has(item.icon)) offenders.push(`${group.index} › ${item.index}`)
        seen.add(item.icon)
      }
    }
    expect(offenders).toEqual([])
  })

  it('新群組圖示彼此不同（招生／接送交通／財務）', () => {
    const icons = ['group-recruitment', 'group-transport', 'group-finance'].map(
      (idx) => SIDEBAR_TREE.groups.find((g) => g.index === idx)?.icon
    )
    expect(icons.every((i) => i !== undefined)).toBe(true)
    expect(new Set(icons).size).toBe(3)
  })
})
