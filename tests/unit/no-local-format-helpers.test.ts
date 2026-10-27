import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// 共用格式化工具收斂守衛（2026-10-27）。
//
// 背景：formatDate / formatTime / formatDateTime / pad / pad2 / money / formatMoney /
// formatCurrency / formatAmount / escapeHtml 這批小工具曾在各元件內各自重寫，數十處副本
// 的 null 處理、補零、時區各有微妙差異，改一處漏十處。已收斂到 canonical 模組：
//
//   src/utils/format.ts    formatDate / formatTime / formatTimeTW / formatDateTimeTW /
//                          formatIsoMinute / formatIsoDate / formatLocalHourMinute /
//                          dateToLocalISO / todayISO / offsetISO / pad2 / money ...
//   src/utils/currency.ts  formatCurrency / formatAmount / moneyInt
//   src/utils/html.ts      escapeHtml
//
// 本 gate 掃 src/**/*.{ts,vue}（排除 __tests__、_generated、canonical 模組本身），
// 只要在元件／檔案內重新「定義」上述名稱就紅燈。新需求請先看 canonical 模組有沒有現成的；
// 沒有就在 canonical 模組新增明確命名的函式，不要在元件內再寫一份。
//
// 刻意保留的副本列在 ALLOWLIST，每筆必須寫明「與 canonical 差在哪」；
// 另有反向檢查：allowlist 的項目若已不存在（被收斂或改名），也會紅燈，逼人同步清單，
// 避免清單腐爛成永久豁免。

const CONVERGED_NAMES = [
  'formatDate',
  'formatTime',
  'formatDateTime',
  'pad',
  'pad2',
  'formatMoney',
  'money',
  'formatCurrency',
  'formatAmount',
  'escapeHtml',
] as const

/** canonical 模組本身（允許定義這些名稱）。 */
const CANONICAL_FILES = new Set([
  'src/utils/format.ts',
  'src/utils/currency.ts',
  'src/utils/html.ts',
])

interface AllowEntry {
  file: string
  name: (typeof CONVERGED_NAMES)[number]
  reason: string
}

/** 刻意保留的本地定義：輸出與 canonical 不同，硬換會改到畫面文字。 */
const ALLOWLIST: AllowEntry[] = [
  // ── formatDate ──
  {
    file: 'src/components/activity/POSSemesterReconciliation.vue',
    name: 'formatDate',
    reason: "toLocaleString('zh-Hant', Asia/Taipei) 年月日時分，無法解析原樣回傳、空值 '—'；canonical formatDate 是瀏覽器本地時間 YYYY-MM-DD HH:MM、空值 ''；formatDateTimeTW 則含秒",
  },
  {
    file: 'src/components/student/tabs/OverviewTab.vue',
    name: 'formatDate',
    reason: "只取日期 slice(0,10)、空值 '—'；canonical formatDate 含時分、空值 ''（可用 formatIsoDate 但 fallback 與切法不同）",
  },
  {
    file: 'src/parent/views/ChildReportsView.vue',
    name: 'formatDate',
    reason: "toLocaleDateString('zh-TW') 中文長日期（2026年10月27日）；canonical 是 YYYY-MM-DD HH:MM",
  },
  // ── formatTime ──
  {
    file: 'src/components/signoff/SignoffTimeline.vue',
    name: 'formatTime',
    reason: "實為完整日期時間 toLocaleString('zh-TW',{hour12:false})、空值 '—'；canonical formatTime 是 slice 出 HH:MM、空值 '-'",
  },
  {
    file: 'src/components/recruitment/RecruitmentTimelineList.vue',
    name: 'formatTime',
    reason: "完整日期時間 toLocaleString('zh-TW',{hour12:false})，無空值守衛；canonical formatTime 是 HH:MM",
  },
  {
    file: 'src/parent/views/ContactBookDetailView.vue',
    name: 'formatTime',
    reason: "本地 HH:MM，但無法解析的日期會輸出 'NaN:NaN'（formatLocalHourMinute 回空字串），逐字不同故不收斂",
  },
  {
    file: 'src/views/MedicationTodayView.vue',
    name: 'formatTime',
    reason: "toLocaleTimeString('zh-TW') 12 小時制（上午/下午），出錯原樣回傳；canonical 是 24 小時制 HH:MM",
  },
  {
    file: 'src/views/DismissalQueueView.vue',
    name: 'formatTime',
    reason: "委派 taipeiTime.formatTaipeiClock，空值 '-'；與 canonical formatTime（slice）語意不同（強制 Asia/Taipei）",
  },
  {
    file: 'src/views/salary/settle/StepFinalize.vue',
    name: 'formatTime',
    reason: "完整日期時間 toLocaleString('zh-TW')、空值 '-'；canonical formatTime 是 HH:MM",
  },
  {
    file: 'src/views/governance/AuditLogView.vue',
    name: 'formatTime',
    reason: "YYYY-MM-DD HH:mm:ss（含秒）、空值 '-'；canonical formatDate 不含秒、空值 ''",
  },
  // ── formatDateTime ──
  {
    file: 'src/components/fees/FeeRefundsTab.vue',
    name: 'formatDateTime',
    reason: "無法解析的日期原樣回傳、空值 '—'；canonical formatDate 對無效日期會輸出 NaN-NaN-NaN",
  },
  {
    file: 'src/components/signoff/SignoffPanel.vue',
    name: 'formatDateTime',
    reason: "toLocaleString('zh-TW') 完整日期時間、空值 '—'",
  },
  {
    file: 'src/components/offboarding/MagicLinkPanel.vue',
    name: 'formatDateTime',
    reason: "toLocaleString('zh-TW', 年月日時分 2-digit)、空值 '—'",
  },
  {
    file: 'src/views/PickupAuthorizationsView.vue',
    name: 'formatDateTime',
    reason: "命名誤導：實際只回 HH:MM，且 date-only 字串會補 T00:00:00 再解析；與 formatDate 完全不同",
  },
  {
    file: 'src/views/workbench/WorkbenchApprovalsView.vue',
    name: 'formatDateTime',
    reason: "薄包裝：已委派 canonical formatDate，只把空值 fallback 換成 '-'（模板與欄位定義共 6 處呼叫）",
  },
  // ── money / formatMoney / formatCurrency / formatAmount ──
  {
    file: 'src/components/salary/UnusedLeavePayoutTooltip.vue',
    name: 'money',
    reason: "顯示 `$` 前綴（不是 NT$）、預設 locale；canonical money 是 NT$ 千分位。是否統一成 NT$ 需業主／設計裁定，非本次重構範圍",
  },
  {
    file: 'src/views/portal/PortalLeaveHistoryView.vue',
    name: 'money',
    reason: "顯示 `$` 前綴（不是 NT$）；同上，待裁定是否統一成 NT$",
  },
  {
    file: 'src/views/activity/activityDashboardStatCards.ts',
    name: 'money',
    reason: "`$` 前綴、null 顯示 '-'；canonical money 為 NT$ 且 null 顯示 '—'",
  },
  {
    file: 'src/views/reports/HistoricalPnlPanel.vue',
    name: 'money',
    reason: "無幣別前綴、最多兩位小數、null 顯示「未填」（歷史損益匯入預覽專用）",
  },
  {
    file: 'src/validators/rules.ts',
    name: 'money',
    reason: '不是格式化：是 el-form 驗證規則工廠（回傳 FormItemRule），名稱巧合',
  },
  {
    file: 'src/components/signoff/SignoffPanel.vue',
    name: 'formatMoney',
    reason: "null／非數字當 0 顯示 NT$0（Number(value ?? 0) || 0）；canonical formatCurrency 會顯示 '—'",
  },
  {
    file: 'src/components/students/BonusImpactPreview.vue',
    name: 'formatCurrency',
    reason: "`$` 前綴，非 number 顯示「薪資金額已遮罩」（權限遮罩語意），與 canonical formatCurrency 完全不同",
  },
  {
    file: 'src/views/yearEnd/components/ProvenanceDrawer.vue',
    name: 'formatAmount',
    reason: "無法轉數字時原樣回傳字串、用瀏覽器預設 locale；canonical formatAmount 回 '—' 且固定 zh-Hant",
  },
  {
    file: 'src/views/reports/reportFormat.ts',
    name: 'formatAmount',
    reason: "報表模組專用：四捨五入到整數、null／NaN 回空字串（模組檔頭已載明規則）；canonical 不四捨五入且回 '—'",
  },
]

// 函式宣告：[export] [async] function NAME(  /  NAME<
// 變數宣告：[export] const|let|var NAME [: 型別] =
function definitionPattern(name: string): RegExp {
  return new RegExp(
    `^\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*[(<]` +
      `|^\\s*(?:export\\s+)?(?:const|let|var)\\s+${name}\\s*(?::[^=\\n]*)?=`,
    'm',
  )
}

const PATTERNS = CONVERGED_NAMES.map((name) => ({ name, re: definitionPattern(name) }))

function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === '_generated' || e.name === 'node_modules') continue
      out.push(...collectSourceFiles(full))
    } else if (
      /\.(vue|ts)$/.test(e.name) &&
      !/\.d\.ts$/.test(e.name) &&
      !/\.(test|spec)\./.test(e.name)
    ) {
      out.push(full)
    }
  }
  return out
}

const toPosix = (p: string) => relative(process.cwd(), p).split(sep).join('/')

interface Definition {
  file: string
  name: string
}

function findLocalDefinitions(): { files: string[]; defs: Definition[] } {
  const files = collectSourceFiles('src').map(toPosix)
  const defs: Definition[] = []
  for (const file of files) {
    if (CANONICAL_FILES.has(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const { name, re } of PATTERNS) {
      if (re.test(text)) defs.push({ file, name })
    }
  }
  return { files, defs }
}

const key = (d: Definition) => `${d.file}::${d.name}`

describe('共用格式化工具不得在元件內重寫（收斂守衛）', () => {
  const { files, defs } = findLocalDefinitions()
  const allowed = new Set(ALLOWLIST.map(key))

  it('掃描到檔案且 canonical 模組存在（測試非 vacuous）', () => {
    expect(files.length).toBeGreaterThan(100)
    for (const canonical of CANONICAL_FILES) {
      expect(files, `找不到 canonical 模組 ${canonical}`).toContain(canonical)
    }
  })

  it('無未登記的本地副本', () => {
    const offenders = defs.filter((d) => !allowed.has(key(d))).map((d) => `${d.file}  →  ${d.name}`)
    expect(
      offenders,
      `這些檔案自己定義了已有 canonical 版本的格式化工具：\n${offenders.join('\n')}\n` +
        '請改 import：@/utils/format（formatDate／formatTime／formatTimeTW／formatIsoMinute／' +
        'formatIsoDate／formatLocalHourMinute／dateToLocalISO／todayISO／offsetISO／pad2）、' +
        '@/utils/currency（formatCurrency／formatAmount）、@/utils/html（escapeHtml）。\n' +
        '若輸出確實與 canonical 不同（格式、空值 fallback、時區），先考慮在 canonical 模組新增明確命名的函式；' +
        '真的要保留才加進本檔 ALLOWLIST 並寫明差在哪。',
    ).toEqual([])
  })

  it('allowlist 沒有腐爛：每一筆都仍對應一個實際存在的本地定義', () => {
    const actual = new Set(defs.map(key))
    const stale = ALLOWLIST.filter((e) => !actual.has(key(e))).map((e) => `${e.file}  →  ${e.name}`)
    expect(
      stale,
      `這些 allowlist 項目已不存在（已收斂、改名或檔案移動），請從 ALLOWLIST 移除：\n${stale.join('\n')}`,
    ).toEqual([])
  })

  it('allowlist 每筆都寫明保留原因，且不重複', () => {
    for (const e of ALLOWLIST) {
      expect(e.reason.trim().length, `${e.file} → ${e.name} 缺保留原因`).toBeGreaterThan(10)
    }
    expect(new Set(ALLOWLIST.map(key)).size).toBe(ALLOWLIST.length)
  })

  it('偵測器本身有效：能抓到各種本地定義寫法', () => {
    const samples = [
      'function formatDate(iso: string) {',
      '  function formatDate(iso: string) {',
      'export function formatDate(iso: string) {',
      'async function formatDate() {',
      'const formatDate = (iso: string) => iso',
      '  const formatDate: (s: string) => string = (s) => s',
      'export const formatDate = (iso: unknown) => {',
      'let formatDate = null',
    ]
    const re = definitionPattern('formatDate')
    for (const s of samples) expect(re.test(s), s).toBe(true)
    // 不應誤判：呼叫、import、註解、含相同前綴的其他名稱
    const negatives = [
      "import { formatDate } from '@/utils/format'",
      '  return formatDate(value)',
      '// const formatDate = (iso) => iso',
      'function formatDateRange(a: string) {',
      'const formatDateTime = (v: string) => v',
    ]
    for (const s of negatives) expect(re.test(s), s).toBe(false)
  })
})
