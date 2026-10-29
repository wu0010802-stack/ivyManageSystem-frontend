/**
 * 「考核與年終」拆成「考核」「年終」兩個選單項（後台 IA 重整 批次 3 / S1，2026-10-29）。
 *
 * 釘住四件事：
 * 1. 兩個選單項的 routePath／可見碼與高亮別名；
 * 2. 規則頁籤歸邊（views/appraisalYearEnd/ruleTabs.ts）與 manifest 高亮別名同步；
 * 3. 權限語意不變：visibleAlso 只影響側欄可見性，不放寬任何路由規則；
 * 4. 每個 PERMISSION_NAMES 碼仍恰好主屬一處（由 manifestIntegrity 守，這裡只釘拆分後的分配）。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { ACTIVE_MENU_ENTRIES, NAVIGATION_MANIFEST, ROUTE_PERMISSION_RULES, SIDEBAR_TREE } from '@/constants/navigation'
import { canAccessRoute, setUserInfo } from '@/utils/auth'
import { RULE_TABS } from '@/views/appraisalYearEnd/ruleTabs'

const pageByKey = (key: string) => {
  const page = NAVIGATION_MANIFEST.groups.flatMap((g) => [...g.pages]).find((p) => p.key === key)
  if (!page) throw new Error(`manifest 找不到 ${key}`)
  return page
}
const APPRAISAL = '/appraisal-year-end/appraisal'
const YEAR_END = '/appraisal-year-end/year-end'

describe('考核／年終 拆分的 manifest 形狀', () => {
  it('舊單一節點 appraisalYearEnd 已移除，由 appraisal、yearEnd 取代，同在人事薪資群', () => {
    const allKeys = NAVIGATION_MANIFEST.groups.flatMap((g) => g.pages.map((p) => p.key))
    expect(allKeys).not.toContain('appraisalYearEnd')
    const leave = NAVIGATION_MANIFEST.groups.find((g) => g.key === 'leave')!
    const keys = leave.pages.map((p) => p.key)
    expect(keys).toContain('appraisal')
    expect(keys).toContain('yearEnd')
    expect(pageByKey('appraisal').routePath).toBe(APPRAISAL)
    expect(pageByKey('yearEnd').routePath).toBe(YEAR_END)
  })

  it('檢視碼與操作碼依領域分配（APPRAISAL_* 在考核，YEAR_END_* 在年終），每碼恰好一處', () => {
    const appraisal = pageByKey('appraisal')
    const yearEnd = pageByKey('yearEnd')
    expect(appraisal.views.map((v) => v.code)).toEqual(['APPRAISAL_READ'])
    expect((appraisal.actions ?? []).map((a) => a.code).sort()).toEqual([
      'APPRAISAL_ACCOUNTING', 'APPRAISAL_EVENT_WRITE', 'APPRAISAL_FINALIZE', 'APPRAISAL_REVIEW', 'APPRAISAL_RULE_WRITE',
    ])
    expect(yearEnd.views.map((v) => v.code)).toEqual(['YEAR_END_READ'])
    expect((yearEnd.actions ?? []).map((a) => a.code).sort()).toEqual([
      'YEAR_END_ACCOUNTING', 'YEAR_END_FINALIZE', 'YEAR_END_REVIEW', 'YEAR_END_WRITE',
    ])
    // 不再用 sharedViews 表達 5 碼 OR（會把 SETTINGS_READ／SALARY_READ 放寬到考核頁）
    expect(appraisal.sharedViews ?? []).toEqual([])
    expect(yearEnd.sharedViews ?? []).toEqual([])
  })

  it('側欄兩個入口都在人事薪資群，且圖示不同', () => {
    const leave = SIDEBAR_TREE.groups.find((g) => g.index === 'group-leave')!
    const appraisal = leave.items.find((i) => i.index === APPRAISAL)
    const yearEnd = leave.items.find((i) => i.index === YEAR_END)
    expect(appraisal?.title).toBe('考核')
    expect(yearEnd?.title).toBe('年終')
    expect(appraisal?.icon).not.toBe(yearEnd?.icon)
    expect(leave.items.some((i) => i.index === '/appraisal-year-end')).toBe(false)
  })

  it('年終入口帶 visibleAlso＋fallback；考核入口不帶', () => {
    const leave = SIDEBAR_TREE.groups.find((g) => g.index === 'group-leave')!
    const appraisal = leave.items.find((i) => i.index === APPRAISAL)!
    const yearEnd = leave.items.find((i) => i.index === YEAR_END)!
    expect(appraisal.fallbackIndex).toBeUndefined()
    expect(yearEnd.fallbackIndex).toBe('/appraisal-year-end/todo')
    expect(yearEnd.primaryCodes).toEqual(['YEAR_END_READ'])
    expect(yearEnd.visibleCodes).toEqual(['YEAR_END_READ', 'SETTINGS_READ', 'SALARY_READ', 'APPRAISAL_FINALIZE'])
    // 舊「考核與年終」入口的 5 碼 OR 可見性，拆開後的聯集不縮水
    const union = new Set([...appraisal.visibleCodes, ...yearEnd.visibleCodes])
    for (const code of ['APPRAISAL_READ', 'YEAR_END_READ', 'SETTINGS_READ', 'SALARY_READ', 'APPRAISAL_FINALIZE']) {
      expect(union.has(code), code).toBe(true)
    }
  })
})

describe('規則頁籤歸邊與側欄高亮別名同步', () => {
  const owner = (path: string) => {
    const matches = ACTIVE_MENU_ENTRIES.filter((e) => path === e.path || path.startsWith(`${e.path}/`))
    const longest = Math.max(...matches.map((m) => m.path.length))
    // 同長度可有多筆（共用頁掛在兩邊）；規則頁籤只該掛一邊
    return matches.filter((m) => m.path.length === longest).map((m) => m.index)
  }

  it.each(RULE_TABS.map((t) => [t.name, t.side] as const))('rules/%s → 高亮 %s 側的選單項', (name, side) => {
    expect(owner(`/appraisal-year-end/rules/${name}`)).toEqual([side === 'appraisal' ? APPRAISAL : YEAR_END])
  })

  it('考核側：scoring／catalog／enrollment-targets；年終側：bonus-rates／festival-headcount／year-end-rules', () => {
    const names = (side: string) => RULE_TABS.filter((t) => t.side === side).map((t) => t.name).sort()
    expect(names('appraisal')).toEqual(['catalog', 'enrollment-targets', 'scoring'])
    expect(names('year-end')).toEqual(['bonus-rates', 'festival-headcount', 'year-end-rules'])
  })

  it('待辦、overview、待補資料兩邊共用：兩個選單項都掛別名（考核在前）', () => {
    for (const path of ['todo', 'overview', 'exceptions']) {
      expect(owner(`/appraisal-year-end/${path}`)).toEqual([APPRAISAL, YEAR_END])
    }
  })

  it('考核／年終既有深路徑（payout、週期工作區、考核子頁）落在各自前綴', () => {
    expect(owner('/appraisal-year-end/year-end/payout')).toEqual([YEAR_END])
    expect(owner('/appraisal-year-end/year-end/cycles/3')).toEqual([YEAR_END])
    expect(owner('/appraisal-year-end/appraisal/calibration')).toEqual([APPRAISAL])
  })
})

describe('權限語意不變：路由規則仍是原本的集合', () => {
  const rulesFor = (path: string, prefix?: boolean) =>
    ROUTE_PERMISSION_RULES.filter((r) => r.path === path && (prefix === undefined || (r.prefix === true) === prefix))
      .map((r) => r.permission)
      .sort()

  it('/appraisal-year-end 頂層 prefix 仍是原 5 碼 OR', () => {
    expect(rulesFor('/appraisal-year-end', true)).toEqual([
      'APPRAISAL_FINALIZE', 'APPRAISAL_READ', 'SALARY_READ', 'SETTINGS_READ', 'YEAR_END_READ',
    ])
  })

  it('visibleAlso 不衍生任何路由規則：年終入口 routePath 只吃 YEAR_END_READ', () => {
    expect(rulesFor(YEAR_END, true)).toEqual(['YEAR_END_READ'])
    expect(rulesFor(APPRAISAL, true)).toEqual(['APPRAISAL_READ'])
  })

  beforeEach(() => {
    localStorage.clear()
  })

  it.each([
    // [權限, 路徑, 是否可進]
    [['SETTINGS_READ'], '/appraisal-year-end/todo', true],
    [['SETTINGS_READ'], '/appraisal-year-end/rules/year-end-rules', true],
    [['SETTINGS_READ'], YEAR_END, false],
    [['SETTINGS_READ'], APPRAISAL, false],
    [['SALARY_READ'], '/appraisal-year-end/rules/festival-headcount', true],
    [['SALARY_READ'], YEAR_END, false],
    [['APPRAISAL_READ'], '/appraisal-year-end/rules/bonus-rates', true],
    [['APPRAISAL_READ'], YEAR_END, false],
    [['YEAR_END_READ'], YEAR_END, true],
    [['YEAR_END_READ'], APPRAISAL, false],
    [['YEAR_END_READ'], '/appraisal-year-end/exceptions', true],
    [['APPRAISAL_FINALIZE'], `${YEAR_END}/payout`, true],
    [['APPRAISAL_FINALIZE'], YEAR_END, false],
  ] as const)('%j 進 %s → %s', (perms, path, ok) => {
    setUserInfo({ role: 'admin', permission_names: [...perms] })
    expect(canAccessRoute(path)).toBe(ok)
  })
})
