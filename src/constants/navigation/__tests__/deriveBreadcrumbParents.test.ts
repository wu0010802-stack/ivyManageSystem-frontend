/**
 * 麵包屑父層候選表衍生測試（spec §3.4）。
 *
 * 守的是：候選表 = 「有 menu 且有 routePath」的選單項，且依 path 長度降冪
 * ——後者是 resolveBreadcrumbParent 用 find 取最長前綴的前提，排序壞掉會讓
 * /activity/pos/approval 誤配到較短的前綴，症狀是父層指到錯的模組。
 */
import { describe, expect, it } from 'vitest'
import { NAVIGATION_MANIFEST } from '@/constants/navigation'
import { deriveBreadcrumbParents } from '../derive'

describe('deriveBreadcrumbParents', () => {
  const parents = deriveBreadcrumbParents(NAVIGATION_MANIFEST)

  it('防假綠哨兵：候選數量合理且含代表項', () => {
    expect(parents.length).toBeGreaterThan(30)
    const paths = parents.map((p) => p.path)
    expect(paths).toContain('/salary')
    expect(paths).toContain('/employees')
    expect(paths).toContain('/students')
    expect(paths).toContain('/surveys')
  })

  it('title 取自 manifest 選單項名稱（與側邊欄同源）', () => {
    expect(parents.find((p) => p.path === '/salary')?.title).toBe('薪資管理')
    expect(parents.find((p) => p.path === '/surveys')?.title).toBe('調查管理')
    expect(parents.find((p) => p.path === '/employees')?.title).toBe('員工管理')
  })

  it('排除 routePath 為 null 的純授權節點', () => {
    const offenders = parents.filter((p) => typeof p.path !== 'string' || p.path.length === 0)
    expect(offenders, 'routePath 為 null 的節點混進候選表').toEqual([])
    expect(parents.some((p) => p.title === '課後才藝（全模組）')).toBe(false)
    expect(parents.some((p) => p.title === '特教需求')).toBe(false)
  })

  it('排除無 menu 的隱藏頁（pickerOnly 群組節點）', () => {
    expect(parents.some((p) => p.title === '班級相簿（教師端）')).toBe(false)
  })

  it('依 path 長度降冪排序（最長前綴匹配的前提）', () => {
    const lengths = parents.map((p) => p.path.length)
    expect(lengths).toEqual([...lengths].sort((a, b) => b - a))
  })

  it('長路徑排在短路徑之前（/activity/pos 早於 /salary）', () => {
    const iPos = parents.findIndex((p) => p.path === '/activity/pos')
    const iSalary = parents.findIndex((p) => p.path === '/salary')
    expect(iPos).toBeGreaterThanOrEqual(0)
    expect(iSalary).toBeGreaterThanOrEqual(0)
    expect(iPos).toBeLessThan(iSalary)
  })
})
