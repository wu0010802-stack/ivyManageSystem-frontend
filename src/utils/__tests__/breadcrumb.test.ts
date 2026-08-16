/**
 * 麵包屑父層解析測試（spec §3.1 四規則 + §3.3 邊界案例表）。
 *
 * 核心不變式：**回傳非 null 者一律可點且點得到實質頁面**。
 * 任何讓「顯示了卻點不動」的情況通過，就是本檔失守。
 */
import { describe, expect, it } from 'vitest'
import type { BreadcrumbParent } from '@/constants/navigation'
import { resolveBreadcrumbParent, type BreadcrumbResolveContext } from '../breadcrumb'

// 依 path 長度降冪的候選表（模擬 BREADCRUMB_PARENTS 的排序契約）
const PARENTS: BreadcrumbParent[] = [
  { path: '/activity/pos/approval', title: 'POS 收款簽核' },
  { path: '/platform/tenants', title: '分校管理' },
  { path: '/appraisal-year-end', title: '考核與年終' },
  { path: '/activity/dashboard', title: '統計儀表板' },
  { path: '/settings/accounts', title: '帳號設定' },
  { path: '/activity/pos', title: 'POS 收銀' },
  { path: '/employees', title: '員工管理' },
  { path: '/workbench', title: '審核工作台' },
  { path: '/students', title: '學生' },
  { path: '/surveys', title: '調查管理' },
  { path: '/salary', title: '薪資管理' },
  { path: '/bus', title: '娃娃車管理' },
  { path: '/', title: '儀表板' },
]

const CONTAINERS = new Set(['/bus', '/workbench', '/appraisal-year-end'])
const TITLES: Record<string, string> = { '/appraisal-year-end/year-end': '年終' }

const ctx = (over: Partial<BreadcrumbResolveContext> = {}): BreadcrumbResolveContext => ({
  parents: PARENTS,
  isContainer: (p) => CONTAINERS.has(p),
  titleOf: (p) => TITLES[p] ?? '',
  ...over,
})

describe('resolveBreadcrumbParent', () => {
  describe('規則 3：最長前綴反查', () => {
    it('子頁取得可點父層', () => {
      expect(resolveBreadcrumbParent('/salary/growth-contract', ctx())).toEqual({
        path: '/salary',
        title: '薪資管理',
      })
    })

    it('動態參數子頁同樣命中', () => {
      expect(resolveBreadcrumbParent('/employees/123', ctx())).toEqual({
        path: '/employees',
        title: '員工管理',
      })
      expect(resolveBreadcrumbParent('/platform/tenants/7', ctx())).toEqual({
        path: '/platform/tenants',
        title: '分校管理',
      })
    })

    it('多段子路徑取最長前綴', () => {
      expect(resolveBreadcrumbParent('/students/profile/5', ctx())).toEqual({
        path: '/students',
        title: '學生',
      })
    })

    it('調查子頁父層是「調查管理」而非群組名「活動調查」', () => {
      expect(resolveBreadcrumbParent('/surveys/new', ctx())?.title).toBe('調查管理')
      expect(resolveBreadcrumbParent('/surveys/42/edit', ctx())?.title).toBe('調查管理')
      expect(resolveBreadcrumbParent('/surveys/42', ctx())?.title).toBe('調查管理')
    })

    it('要求尾隨斜線：/student-attendance 不得誤配到 /students', () => {
      expect(resolveBreadcrumbParent('/student-attendance', ctx())).toBeNull()
    })

    it('根路徑 / 不得成為任何路徑的前綴父層', () => {
      expect(resolveBreadcrumbParent('/data-quality', ctx())).toBeNull()
    })
  })

  describe('規則 1：自己是側邊欄項目 → 無父層', () => {
    it('一級頁無父層', () => {
      expect(resolveBreadcrumbParent('/employees', ctx())).toBeNull()
      expect(resolveBreadcrumbParent('/activity/dashboard', ctx())).toBeNull()
      expect(resolveBreadcrumbParent('/settings/accounts', ctx())).toBeNull()
    })

    it('本身是選單項時，即使 URL 上是別的選單項的子路徑也無父層', () => {
      expect(resolveBreadcrumbParent('/activity/pos/approval', ctx())).toBeNull()
    })

    it('規則 1 優先於 meta.parent', () => {
      expect(resolveBreadcrumbParent('/employees', ctx({ metaParent: '/salary' }))).toBeNull()
    })
  })

  describe('規則 2：meta.parent 明示', () => {
    it('指向選單項時取 manifest title', () => {
      expect(
        resolveBreadcrumbParent('/activity/audit/pos-unlock', ctx({ metaParent: '/activity/pos' })),
      ).toEqual({ path: '/activity/pos', title: 'POS 收銀' })
    })

    it('指向非選單項時以 titleOf 取路由 meta.title', () => {
      expect(
        resolveBreadcrumbParent(
          '/appraisal-year-end/year-end/cycles/9',
          ctx({ metaParent: '/appraisal-year-end/year-end' }),
        ),
      ).toEqual({ path: '/appraisal-year-end/year-end', title: '年終' })
    })

    it('優先於最長前綴反查', () => {
      expect(resolveBreadcrumbParent('/students/profile/5', ctx({ metaParent: '/salary' }))).toEqual(
        { path: '/salary', title: '薪資管理' },
      )
    })

    it('取不到顯示文字時回 null，不渲染空白連結', () => {
      expect(resolveBreadcrumbParent('/foo/bar', ctx({ metaParent: '/unknown-path' }))).toBeNull()
    })
  })

  describe('規則 4：redirect 容器撤銷', () => {
    it('父層是 redirect 容器時不顯示（點了會被轉回原頁）', () => {
      expect(resolveBreadcrumbParent('/bus/monitor', ctx())).toBeNull()
      expect(resolveBreadcrumbParent('/bus/history', ctx())).toBeNull()
      expect(resolveBreadcrumbParent('/workbench/approvals', ctx())).toBeNull()
      expect(resolveBreadcrumbParent('/appraisal-year-end/rules/scoring', ctx())).toBeNull()
    })

    it('meta.parent 指向容器時同樣撤銷（維持「顯示即可點」不變式）', () => {
      expect(resolveBreadcrumbParent('/anything/deep', ctx({ metaParent: '/bus' }))).toBeNull()
    })
  })
})
