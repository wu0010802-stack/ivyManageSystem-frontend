/**
 * NAVIGATION_MANIFEST 完整性測試（M1/M3 + 遷移驗收 fixture）。
 *
 * - M1 碼有效性：manifest 引用的所有碼 ∈ PERMISSION_NAMES。編譯期已由 PermissionName
 *   literal union 保證，此處 runtime 兜底（防 `as` 繞過型別）。
 * - M3（較強版）：每個 PERMISSION_NAMES 碼「恰好一次」主屬於（某頁 views ∪ 某頁 actions
 *   ∪ standalonePermissions）——同時抓「加了碼忘了掛 manifest」與「重複 owned」。
 * - sharedViews / requiresView 的碼必須在他處 owned（借道碼不能是幽靈碼）。
 * - routePath / group key / page key 全域唯一；standalone 豁免必附 note 理由。
 * - fixture set-equality：衍生輸出必須與遷移前手寫 ROUTE_PERMISSION_RULES 完全同集合
 *   （path+permission+prefix 三元組），任何抄錄錯誤第一次跑測試就紅。
 *   staging 驗證跑穩後可議刪除 fixture 段。
 */
import { describe, it, expect } from 'vitest'
import { PERMISSION_NAMES, ROUTE_PERMISSION_RULES } from '@/constants/permissions'
import { NAVIGATION_MANIFEST } from '@/constants/navigation'
import type { ManifestPage } from '@/constants/navigation'
import { collectOwnedCodes } from '@/constants/navigation'

const ALL_PAGES: ManifestPage[] = [
  ...NAVIGATION_MANIFEST.topLevel,
  ...NAVIGATION_MANIFEST.groups.flatMap((g) => [...g.pages]),
]

const VALID_CODES = new Set<string>(Object.values(PERMISSION_NAMES))

describe('NAVIGATION_MANIFEST 完整性', () => {
  it('M1：manifest 引用的所有碼都存在於 PERMISSION_NAMES（runtime 兜底）', () => {
    const referenced: string[] = []
    for (const page of ALL_PAGES) {
      referenced.push(...page.views.map((v) => v.code))
      referenced.push(...(page.sharedViews ?? []))
      for (const a of page.actions ?? []) {
        referenced.push(a.code)
        if (a.requiresView) referenced.push(a.requiresView)
      }
      referenced.push(...(page.extraRoutes ?? []).map((r) => r.permission))
    }
    referenced.push(...NAVIGATION_MANIFEST.standalonePermissions.map((s) => s.code))

    const unknown = referenced.filter((c) => !VALID_CODES.has(c))
    expect(unknown, 'manifest 引用了 PERMISSION_NAMES 沒有的碼').toEqual([])
  })

  it('M3：每個 PERMISSION_NAMES 碼恰好主屬一處（views/actions/standalone）', () => {
    const ownedList: { code: string; where: string }[] = []
    for (const page of ALL_PAGES) {
      for (const v of page.views) ownedList.push({ code: v.code, where: `${page.key}.views` })
      for (const a of page.actions ?? []) ownedList.push({ code: a.code, where: `${page.key}.actions` })
    }
    for (const s of NAVIGATION_MANIFEST.standalonePermissions) {
      ownedList.push({ code: s.code, where: 'standalonePermissions' })
    }

    // 重複 owned：同一碼出現兩處以上（sharedViews 借道不算 owned，不在此列）
    const byCode = new Map<string, string[]>()
    for (const { code, where } of ownedList) {
      byCode.set(code, [...(byCode.get(code) ?? []), where])
    }
    const duplicated = [...byCode.entries()]
      .filter(([, wheres]) => wheres.length > 1)
      .map(([code, wheres]) => `${code} → ${wheres.join(', ')}`)
    expect(duplicated, '同一碼被多處 owned（多頁共用請改 sharedViews 借道）').toEqual([])

    // 漏碼：PERMISSION_NAMES 有但 manifest 沒 owned（新增碼忘了掛 UI）
    const ownedSet = new Set(byCode.keys())
    const missing = [...VALID_CODES].filter((c) => !ownedSet.has(c))
    expect(missing, 'PERMISSION_NAMES 有碼未被 manifest owned（掛頁面或登記 standalonePermissions 豁免）').toEqual([])

    // 反向：manifest owned 了 PERMISSION_NAMES 沒有的碼（M1 已測，此處雙保險）
    const extra = [...ownedSet].filter((c) => !VALID_CODES.has(c))
    expect(extra).toEqual([])
  })

  it('sharedViews 的碼必須在他處 owned；requiresView 必須是同頁 views 之一', () => {
    const owned = collectOwnedCodes(NAVIGATION_MANIFEST)
    const offenders: string[] = []
    for (const page of ALL_PAGES) {
      for (const code of page.sharedViews ?? []) {
        if (!owned.has(code)) offenders.push(`${page.key}.sharedViews: ${code} 無人 owned`)
      }
      const viewCodes = new Set(page.views.map((v) => v.code))
      for (const a of page.actions ?? []) {
        if (a.requiresView && !viewCodes.has(a.requiresView)) {
          offenders.push(`${page.key}.actions.${a.code}: requiresView ${a.requiresView} 不在同頁 views`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('routePath / group key / page key 全域唯一', () => {
    const routePaths = ALL_PAGES.filter((p) => p.routePath !== null).map((p) => p.routePath)
    expect(new Set(routePaths).size, `routePath 重複: ${routePaths.join(', ')}`).toBe(routePaths.length)

    const groupKeys = NAVIGATION_MANIFEST.groups.map((g) => g.key)
    expect(new Set(groupKeys).size).toBe(groupKeys.length)

    const pageKeys = ALL_PAGES.map((p) => p.key)
    expect(new Set(pageKeys).size, `page key 重複: ${pageKeys.join(', ')}`).toBe(pageKeys.length)
  })

  it('standalonePermissions 每筆必附非空 note 理由', () => {
    for (const s of NAVIGATION_MANIFEST.standalonePermissions) {
      expect(s.note.trim().length, `${s.code} 缺豁免理由 note`).toBeGreaterThan(0)
    }
  })

  it('/settings 規則不可為 prefix（子路由權限不同，外溢 = SETTINGS_READ 進帳號/角色頁）', () => {
    const settingsRules = ROUTE_PERMISSION_RULES.filter((r) => r.path === '/settings')
    expect(settingsRules.length).toBeGreaterThan(0)
    expect(settingsRules.some((r) => r.prefix)).toBe(false)
  })
})

// ── 遷移驗收：衍生輸出 vs 遷移前手寫陣列 fixture（set-equality） ──
//
// fixture 為 2026-07-31 遷移當下 src/constants/permissions.ts 87–209 行手寫
// ROUTE_PERMISSION_RULES 的原樣 copy（僅去除行間註解）。
//
// 註：詳設 §1.4 註 2 的兩個已知殘渣（hasVisibleLeaveItems 的 SALARY_WRITE、
// hasVisibleReportsItems 的 SALARY_READ）是 AdminSidebar 手寫可見性 OR 串的殘渣，
// 從未存在於 ROUTE_PERMISSION_RULES——路由規則面預期零差集，故本 fixture 無任何排除項。
// 該兩處殘渣的行為修正由 P1（AdminSidebar 改資料驅動）落地。
const LEGACY_ROUTE_PERMISSION_RULES: { path: string; permission: string; prefix?: boolean }[] = [
  { path: '/', permission: 'DASHBOARD' },
  { path: '/approvals', permission: 'APPROVALS' },
  { path: '/workbench', permission: 'APPROVALS' },
  { path: '/workbench/approvals', permission: 'APPROVALS' },
  { path: '/workbench/high-risk', permission: 'AUDIT_LOGS' },
  { path: '/calendar', permission: 'CALENDAR' },
  { path: '/schedule', permission: 'SCHEDULE' },
  { path: '/attendance', permission: 'ATTENDANCE_READ' },
  { path: '/leaves', permission: 'LEAVES_READ' },
  { path: '/meetings', permission: 'MEETINGS' },
  { path: '/employees', permission: 'EMPLOYEES_READ', prefix: true },
  { path: '/admin/offboarding', permission: 'EMPLOYEES_READ' },
  { path: '/students', permission: 'STUDENTS_READ' },
  { path: '/students/profile', permission: 'STUDENTS_READ', prefix: true },
  { path: '/student-attendance', permission: 'STUDENTS_READ' },
  { path: '/student-leaves', permission: 'STUDENTS_READ' },
  { path: '/student-assessments', permission: 'STUDENTS_READ' },
  { path: '/student-incidents', permission: 'STUDENTS_READ' },
  { path: '/student-academic-affairs', permission: 'STUDENTS_READ' },
  { path: '/classrooms', permission: 'CLASSROOMS_READ' },
  { path: '/growth-books', permission: 'PORTFOLIO_READ' },
  { path: '/salary', permission: 'SALARY_READ', prefix: true },
  { path: '/announcements', permission: 'ANNOUNCEMENTS_READ' },
  { path: '/reports', permission: 'REPORTS' },
  { path: '/gov-reports', permission: 'GOV_REPORTS_EXPORT' },
  { path: '/admin/gov-reports', permission: 'GOV_REPORTS_VIEW', prefix: true },
  { path: '/audit-logs', permission: 'AUDIT_LOGS' },
  { path: '/data-quality', permission: 'DATA_QUALITY_READ' },
  { path: '/settings', permission: 'SETTINGS_READ' },
  { path: '/settings/accounts', permission: 'USER_MANAGEMENT_READ' },
  { path: '/settings/roles', permission: 'ROLES_MANAGE' },
  { path: '/dismissal-queue', permission: 'DISMISSAL_CALLS_READ' },
  { path: '/activity/dashboard', permission: 'ACTIVITY_READ' },
  { path: '/activity/registrations', permission: 'ACTIVITY_READ' },
  { path: '/activity/registrations/pending', permission: 'ACTIVITY_WRITE' },
  { path: '/activity/pos', permission: 'ACTIVITY_WRITE' },
  { path: '/activity/pos/approval', permission: 'ACTIVITY_PAYMENT_APPROVE' },
  { path: '/activity/catalog', permission: 'ACTIVITY_READ' },
  { path: '/activity/courses', permission: 'ACTIVITY_READ' },
  { path: '/activity/supplies', permission: 'ACTIVITY_READ' },
  { path: '/activity/inquiries', permission: 'ACTIVITY_READ' },
  { path: '/activity/settings', permission: 'ACTIVITY_WRITE' },
  { path: '/activity/changes', permission: 'ACTIVITY_READ' },
  { path: '/activity/attendance', permission: 'ACTIVITY_READ', prefix: true },
  { path: '/activity/audit/pos-unlock', permission: 'ACTIVITY_PAYMENT_APPROVE' },
  { path: '/fees', permission: 'FEES_READ' },
  { path: '/student-enrollment', permission: 'CLASSROOMS_READ' },
  { path: '/enrollment-stats', permission: 'STUDENTS_READ' },
  { path: '/students/admissions', permission: 'RECRUITMENT_READ' },
  { path: '/students/year-plan', permission: 'CLASSROOMS_READ' },
  { path: '/recruitment', permission: 'RECRUITMENT_READ' },
  { path: '/portfolio/medication-today', permission: 'STUDENTS_HEALTH_READ' },
  { path: '/appraisal', permission: 'SETTINGS_READ', prefix: true },
  { path: '/appraisal', permission: 'APPRAISAL_READ', prefix: true },
  { path: '/appraisal-management', permission: 'SETTINGS_READ' },
  { path: '/appraisal-management', permission: 'SALARY_READ' },
  { path: '/year_end', permission: 'YEAR_END_READ', prefix: true },
  { path: '/year-end/appraisal-payout', permission: 'APPRAISAL_FINALIZE' },
  { path: '/appraisal-year-end', permission: 'SETTINGS_READ', prefix: true },
  { path: '/appraisal-year-end', permission: 'SALARY_READ', prefix: true },
  { path: '/appraisal-year-end', permission: 'YEAR_END_READ', prefix: true },
  { path: '/appraisal-year-end', permission: 'APPRAISAL_FINALIZE', prefix: true },
  { path: '/appraisal-year-end', permission: 'APPRAISAL_READ', prefix: true },
  { path: '/appraisal-year-end/appraisal', permission: 'APPRAISAL_READ', prefix: true },
  { path: '/appraisal-year-end/year-end', permission: 'YEAR_END_READ', prefix: true },
  { path: '/appraisal-year-end/year-end/payout', permission: 'APPRAISAL_FINALIZE' },
  { path: '/appraisal-year-end/rules', permission: 'APPRAISAL_READ', prefix: true },
  { path: '/appraisal-year-end/rules', permission: 'SETTINGS_READ', prefix: true },
  { path: '/appraisal-year-end/rules/scoring', permission: 'APPRAISAL_READ' },
  { path: '/appraisal-year-end/rules/bonus-rates', permission: 'APPRAISAL_READ' },
  { path: '/appraisal-year-end/rules/catalog', permission: 'APPRAISAL_READ' },
  { path: '/appraisal-year-end/rules/enrollment-targets', permission: 'APPRAISAL_READ' },
  { path: '/appraisal-year-end/rules/year-end-rules', permission: 'SETTINGS_READ' },
  { path: '/appraisal-year-end/exceptions', permission: 'APPRAISAL_READ' },
  { path: '/appraisal-year-end/exceptions', permission: 'YEAR_END_READ' },
  { path: '/overtime', permission: 'OVERTIME_READ' },
  { path: '/overtime', permission: 'MEETINGS' },
  { path: '/finance-signoffs', permission: 'VENDOR_PAYMENT_READ' },
  { path: '/finance-signoffs', permission: 'MISC_RECEIPT_READ' },
]

const tripleKey = (r: { path: string; permission: string; prefix?: boolean }) =>
  `${r.path} × ${r.permission}${r.prefix === true ? ' × prefix' : ''}`

describe('衍生規則 vs 遷移前手寫陣列（fixture set-equality）', () => {
  it('fixture 本身無重複三元組（抄錄防呆）', () => {
    const keys = LEGACY_ROUTE_PERMISSION_RULES.map(tripleKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('衍生輸出無重複三元組', () => {
    const keys = ROUTE_PERMISSION_RULES.map(tripleKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('衍生輸出與 fixture 完全同集合（path+permission+prefix）', () => {
    const derived = new Set(ROUTE_PERMISSION_RULES.map(tripleKey))
    const legacy = new Set(LEGACY_ROUTE_PERMISSION_RULES.map(tripleKey))

    const missing = [...legacy].filter((k) => !derived.has(k))
    const extra = [...derived].filter((k) => !legacy.has(k))

    expect(missing, '手寫規則在衍生輸出中消失（manifest 漏抄或衍生邏輯錯）').toEqual([])
    expect(extra, '衍生輸出多出手寫規則沒有的規則（manifest 多抄或冗餘消除失效）').toEqual([])
  })

  it('prefix 旗標形狀與既有消費端相容（true 才出現，其餘不帶 prefix key）', () => {
    for (const r of ROUTE_PERMISSION_RULES) {
      if ('prefix' in r) expect(r.prefix).toBe(true)
    }
  })
})
