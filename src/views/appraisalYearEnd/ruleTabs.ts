// 考核×年終「規則設定」六個頁籤的單一事實來源（後台 IA 重整 批次 3 / S1）。
//
// 側欄把「考核與年終」拆成「考核」「年終」兩個選單項後，規則頁籤依領域分邊：
// 路徑（/appraisal-year-end/rules/<name>）與各頁籤的權限 gate 完全不變，
// 只多一個 `side` 決定「在哪一邊的規則設定裡出現／高亮哪個選單項」。
//
// 歸邊依各頁籤的實際權限碼（RulesSettingsLayout 原有的 gate，路徑與 gate 都不變）：
// - 考核側：scoring／bonus-rates／catalog／enrollment-targets——四頁讀權限都是 APPRAISAL_READ，
//   寫入走 APPRAISAL_RULE_WRITE 或 APPRAISAL_FINALIZE，全是考核權限域。
//   bonus-rates（年終獎金率）名稱帶「年終」，但 gate 是 APPRAISAL_*：只持考核權限的人沒有「年終」選單項，
//   若歸年終側就進不去，所以依碼歸考核側（要改歸年終側，改這裡的 side 並同步 manifest 的 activeAlso，測試會守）。
// - 年終側：year-end-rules（SETTINGS_READ）、festival-headcount（SALARY_READ）——非考核權限域的兩頁。
//   節慶人數是薪資權限（業主裁定 D4）、與薪資結算前檢查共用同一元件；它的受眾是帶薪資權限的財務角色，
//   與年終規則（SETTINGS 域）同一批人，考核側的 APPRAISAL_READ 持有者多半看不到它，放考核側只會多一個
//   大部分人用不到的頁籤，故歸年終側。
//
// 側欄高亮用的別名清單寫在 navigation/manifest.ts 的 menu.activeAlso，
// 與本檔的 side 由 navigation/__tests__/appraisalYearEndSplit.test.ts 守同步。
import { hasPermission } from '@/utils/auth'
import { PAGE_TERMS } from '@/constants/moduleTerms'

export type AyeSide = 'appraisal' | 'year-end'

export interface RuleTabDef {
  name: string
  side: AyeSide
  label: string
  /** 讀權限：決定頁籤是否出現（對齊子頁實際呼叫的後端守衛）。 */
  can: () => boolean
  /** 寫權限：用於頁籤標題旁的唯讀徽章，與 can 分開判定。 */
  canWrite: () => boolean
  permLabel: string
}

// 各 tab 實際「寫入」權限對齊各面板真實 gate（B4 已向後端核實）：
// - scoring / catalog：面板編輯走 APPRAISAL_RULE_WRITE（ScoringRulesPanel canEditRules / PenaltyCatalogPanel canEdit）
// - bonus-rates / enrollment-targets：面板寫入走 APPRAISAL_FINALIZE（BonusRatesPanel canWrite / YearlyEnrollmentTargetSection canEditTarget）
// - year-end-rules：面板儲存走 SETTINGS_WRITE 且 ACTIVITY_PAYMENT_APPROVE 雙權限（YearEndRulesPanel canSaveRules）
// 子頁讀權限：前四頁走 appraisal API（APPRAISAL_READ）、年終規則走 SETTINGS_READ、節慶人數走 SALARY_READ。
export const RULE_TABS: readonly RuleTabDef[] = [
  {
    name: 'scoring',
    side: 'appraisal',
    label: PAGE_TERMS.appraisalScoringRules,
    can: () => hasPermission('APPRAISAL_READ'),
    canWrite: () => hasPermission('APPRAISAL_RULE_WRITE'),
    permLabel: '考核規則設定',
  },
  {
    name: 'bonus-rates',
    side: 'appraisal',
    label: '年終獎金率',
    can: () => hasPermission('APPRAISAL_READ'),
    canWrite: () => hasPermission('APPRAISAL_FINALIZE'),
    permLabel: '考核核定',
  },
  {
    name: 'catalog',
    side: 'appraisal',
    label: PAGE_TERMS.appraisalCatalog,
    can: () => hasPermission('APPRAISAL_READ'),
    canWrite: () => hasPermission('APPRAISAL_RULE_WRITE'),
    permLabel: '考核規則設定',
  },
  {
    name: 'enrollment-targets',
    side: 'appraisal',
    label: '學年目標人數',
    can: () => hasPermission('APPRAISAL_READ'),
    canWrite: () => hasPermission('APPRAISAL_FINALIZE'),
    permLabel: '考核核定',
  },
  {
    // 節慶人數沿用薪資權限（業主裁定 D4）——只持 APPRAISAL_*/YEAR_END_* 者看不到本頁。
    name: 'festival-headcount',
    side: 'year-end',
    label: '節慶人數',
    can: () => hasPermission('SALARY_READ'),
    canWrite: () => hasPermission('SALARY_WRITE'),
    permLabel: '薪資編輯',
  },
  {
    name: 'year-end-rules',
    side: 'year-end',
    label: '年終規則',
    can: () => hasPermission('SETTINGS_READ'),
    canWrite: () => hasPermission('SETTINGS_WRITE') && hasPermission('ACTIVITY_PAYMENT_APPROVE'),
    permLabel: '年終規則設定',
  },
]

/** 規則頁籤名 → 所屬邊（未知名稱回 null）。 */
export function ruleTabSide(name: string | undefined): AyeSide | null {
  return RULE_TABS.find((t) => t.name === name)?.side ?? null
}

/**
 * 路徑落在哪一邊。/appraisal-year-end/appraisal… → 考核、/year-end… → 年終、
 * /rules/<tab> → 該頁籤所屬邊；待辦、待補資料、/rules 本身（會再 redirect）是兩邊共用的，回 null。
 */
export function aeySideOfPath(path: string): AyeSide | null {
  const seg = path.split('/')
  const section = seg[2]
  if (section === 'appraisal') return 'appraisal'
  if (section === 'year-end') return 'year-end'
  if (section === 'rules') return ruleTabSide(seg[3])
  return null
}

/** 某一邊目前使用者看得到的規則頁籤。 */
export function visibleRuleTabs(side: AyeSide): RuleTabDef[] {
  return RULE_TABS.filter((t) => t.side === side && t.can())
}
