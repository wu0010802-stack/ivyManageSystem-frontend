/**
 * 跨分校報表的通用呈現工具（純函式、可單測）。
 *
 * ## 為什麼是「通用」而不是逐報表寫死欄位
 *
 * `PlatformReportOut.totals` / `PlatformReportTenantRow.data` 在 OpenAPI 上都是
 * `additionalProperties: true`（後端合併函式的輸出形狀，五支報表各不相同且會隨業務演進）。
 * 前端若各報表硬寫一份欄位表，後端加一個指標前端就少一欄、而且**不會有任何測試會紅**。
 * 因此本檔改為：欄位由實際資料的 key 推導，數值格式由值的型別與 key 命名推導。
 *
 * 口徑提醒（hq-reporting §6-10）：彙總只對「標準度量」有意義，跨校分類細項不做對齊。
 */

/** 合併全部 tenant row 的 data key，保留第一次出現的順序（後端多半已是有意義的順序）。 */
export function collectMetricKeys(rows: readonly { data?: Record<string, unknown> }[]): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row.data ?? {})) {
      if (!seen.has(key)) {
        seen.add(key)
        keys.push(key)
      }
    }
  }
  return keys
}

/**
 * 跨分校報表指標 key → 中文標籤對照表。
 *
 * 涵蓋五支報表（overview / finance / attendance / salary-cost / recruitment）的
 * per-tenant builder 與 `merge_*` 合併函式實際會回傳的 key（見
 * `ivyManageSystem-backend` `services/platform/report_service.py`、
 * `services/finance_report_service.py`、`services/reports_builders.py`、
 * `api/recruitment/stats.py::_query_stats`）。中文譯名沿用 `src/views/reports/`
 * 與 `src/components/recruitment/` 既有頁面用語，不另創新譯名。
 *
 * 查不到的 key（未來新增、目前未知）由 `metricLabel` fallback 到底線轉空白。
 */
export const METRIC_LABELS: Record<string, string> = {
  // 通用（merge_* 皆有）
  school_count: '分校數',
  failed_count: '取數失敗校數',

  // overview（_build_overview + merge_overview）
  student_count: '學生數',
  employee_count: '員工數',
  finance: '財務摘要',

  // finance（build_finance_summary + merge_finance）
  period: '期間',
  year: '年度',
  month: '月份',
  summary: '收支摘要',
  total_revenue: '總收入',
  total_refund: '總退費',
  net_revenue: '淨收入',
  total_expense: '總支出',
  net_cashflow: '淨現金流',
  revenue_by_category: '收入分類',
  expense_by_category: '支出分類',
  monthly_trend: '月度趨勢',
  category: '分類',
  label: '名稱',
  amount: '金額',
  revenue: '收入',
  refund: '退費',
  expense: '支出',
  net: '淨額',

  // attendance（query_attendance_monthly / query_attendance_by_classroom + merge_attendance）
  attendance_monthly: '每月出勤',
  attendance_by_classroom: '各班出勤',
  total_records: '出勤總筆數',
  normal: '正常',
  late: '遲到',
  early_leave: '早退',
  missing: '缺卡',
  rate: '出勤率',
  classroom_id: '班級 ID',
  classroom: '班級',

  // salary-cost（query_salary_monthly + merge_salary_cost）
  salary_monthly: '每月薪資成本',
  employee_months: '員工人月數',
  employee_months_pending: '待封存人月數',
  employee_count_pending: '待封存人數',
  total_gross: '應發總額',
  total_net: '實發總額',
  total_deductions: '扣款總額',
  total_bonus: '獎金總額',
  total_overtime_pay: '加班費總額',

  // recruitment（_query_stats + merge_recruitment）
  visit: '參觀人次',
  deposit: '預繳人次',
  enrolled: '註冊人次',
  visit_to_deposit_rate: '參觀→預繳率',
  visit_to_enrolled_rate: '參觀→註冊率',
  deposit_to_enrolled_rate: '預繳→註冊率',
  effective_to_enrolled_rate: '排除轉期→註冊率',
  total_visit: '總參觀',
  total_deposit: '總預繳',
  total_enrolled: '總註冊',
  total_transfer_term: '轉學期人次',
  total_pending_deposit: '待預繳人次',
  total_effective_deposit: '有效預繳人次',
  unique_visit: '唯一參觀人數',
  unique_deposit: '唯一預繳人數',
  chuannian_visit: '連年參觀人次',
  chuannian_deposit: '連年預繳人次',
  chuannian_by_expected: '連年－預計入學',
  chuannian_by_grade: '連年－年級分布',
  monthly: '每月統計',
  by_grade: '依年級',
  month_grade: '月度×年級',
  by_source: '依來源',
  by_referrer: '依介紹人',
  referrer_source_cross: '介紹人×來源',
  top_source_names: '主要來源',
  by_district: '依行政區',
  no_deposit_reasons: '未預繳原因',
  no_deposit_total: '未預繳總數',
  by_year: '依年度',
  reference_month: '參考月份',
  decision_summary: '決策摘要',
  ytd: '年初至今',
  current_month: '當月',
  rolling_30d: '近 30 天',
  rolling_90d: '近 90 天',
  funnel_snapshot: '漏斗快照',
  transfer_term: '轉學期',
  effective_deposit: '有效預繳',
  pending_deposit: '待預繳',
  month_over_month: '月增減比較',
  alerts: '警示',
  top_action_queue: '待辦建議',
}

/** `total_income` → `total income`；沒有更好的來源時比原始 snake_case 好讀。 */
function fallbackLabel(key: string): string {
  return key.replace(/_/g, ' ')
}

/** 已知 key 查中文對照表；查不到（未來新增、目前未知的 key）才 fallback 底線轉空白。 */
export function metricLabel(key: string): string {
  return METRIC_LABELS[key] ?? fallbackLabel(key)
}

const RATE_HINT = /(rate|ratio|pct|percent)/i
const MONEY_HINT = /(amount|income|expense|cost|salary|revenue|fee|total_pay)/i

/** 純物件（非 array、非 null）——需要巢狀渲染，不能丟給 `formatMetric` 當文字處理。 */
export function isMetricObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 陣列值——同樣需要巢狀渲染（清單），不能丟給 `formatMetric` 當文字處理。 */
export function isMetricArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

/**
 * 數值呈現（**只處理原始型別**：string/number/boolean/null/undefined）：
 *  - 比率類（key 含 rate/ratio/pct）→ 百分比一位小數（值 <= 1 視為比例，否則已是百分比）
 *  - 金額類 → 千分位整數
 *  - 其他數字 → 千分位
 *  - 非數字 → 原樣字串；null/undefined/空字串 → `—`
 *
 * 物件／陣列不在本函式處理範圍——呼叫端須先用 `isMetricObject` / `isMetricArray`
 * 判斷，物件值要改用巢狀渲染（如 `MetricValue.vue`）逐欄套用中文標籤呈現，
 * 不可整包塞進這裡變成 JSON 字串。萬一誤傳物件進來（型別為 `unknown`，執行期無法
 * 完全防呆），回傳「—」而非 `JSON.stringify` 或 `[object Object]`。
 */
export function formatMetric(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (RATE_HINT.test(key)) {
      const pct = Math.abs(value) <= 1 ? value * 100 : value
      return `${pct.toFixed(1)}%`
    }
    if (MONEY_HINT.test(key)) return value.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
    return value.toLocaleString('zh-TW')
  }
  if (isMetricObject(value) || isMetricArray(value)) return '—'
  return String(value)
}

/** 有 `error` 的分校列不參與比較，但**必須顯示**——靜默略過等於謊報彙總範圍。 */
export function failedTenants<T extends { error?: string | null; name: string }>(rows: readonly T[]): T[] {
  return rows.filter((r) => Boolean(r.error))
}
