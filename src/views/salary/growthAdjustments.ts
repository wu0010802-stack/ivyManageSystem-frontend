/**
 * 自主成長獎勵金：職務異動月額覆寫區段與扣抵（義華第二批 growth2）的純邏輯。
 *
 * 條件與後端 `api/growth_contract.py` 對齊，讓前端先擋掉一定會 422 的輸入：
 * - 覆寫區段：起訖月 `YYYY-MM`、含兩端、須落在民國學年 8 月～次年 7 月、迄不得早於起。
 * - 扣抵：金額為正整數；原因 1–200 字。
 */

const YM_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

/** 職務 key 中文標籤（與後端 services/growth_contract/constants 的 key 對齊；未知 key 原樣顯示）。 */
export const GROWTH_POSITION_LABELS: Record<string, string> = {
  principal: '園長',
  director: '主任',
  admin_staff: '行政會計',
  head_teacher_a: '班導 A 級',
  head_teacher_b: '班導 B 級',
  head_teacher_c: '班導 C 級',
  assistant_teacher_a: '副班導 A 級',
  assistant_teacher_b: '副班導 B 級',
  assistant_teacher_c: '副班導 C 級',
  english_teacher: '美語',
  art_teacher: '藝術',
  nurse: '護理',
  kitchen_staff: '廚師',
  driver: '司機',
  designer: '美編',
}

export function growthPositionLabel(key: string | null | undefined): string {
  if (!key) return '—'
  return GROWTH_POSITION_LABELS[key] ?? key
}

/** 民國學年 → 西元起訖月（8 月～次年 7 月，含兩端），格式 YYYY-MM。 */
export function schoolYearMonthBounds(schoolYear: number): { first: string; last: string } {
  const ad = schoolYear + 1911
  return { first: `${ad}-08`, last: `${ad + 1}-07` }
}

export interface RateSegmentDraft {
  employee_id: number | null
  school_year: number
  start_month: string
  end_month: string
  position_key: string
  note: string
}

/** 回傳第一個錯誤訊息；合法回 null。YYYY-MM 字串可直接字典序比較。 */
export function validateRateSegmentDraft(d: RateSegmentDraft): string | null {
  if (d.employee_id == null) return '請選擇員工'
  if (!d.position_key) return '請選擇異動期間的職務'
  if (!YM_RE.test(d.start_month) || !YM_RE.test(d.end_month)) return '起訖月須為 YYYY-MM'
  if (d.end_month < d.start_month) return '迄月不得早於起月'
  const { first, last } = schoolYearMonthBounds(d.school_year)
  if (d.start_month < first || d.end_month > last) {
    return `起訖月須落在 ${d.school_year} 學年內（${first}～${last}）`
  }
  if (d.note.length > 500) return '備註最多 500 字'
  return null
}

export interface DeductionDraft {
  employee_id: number | null
  school_year: number
  amount: number | null
  reason: string
}

export function validateDeductionDraft(d: DeductionDraft): string | null {
  if (d.employee_id == null) return '請選擇員工'
  if (d.amount == null || !Number.isInteger(d.amount) || d.amount <= 0) return '扣抵金額須為大於 0 的整數'
  const reason = d.reason.trim()
  if (!reason) return '請填寫扣抵原因'
  if (reason.length > 200) return '扣抵原因最多 200 字'
  return null
}

/** 區段月份顯示：「2026-02～2026-07」。 */
export function segmentRangeLabel(start: string, end: string): string {
  return start === end ? start : `${start}～${end}`
}

export interface SemesterProgress {
  semester: number
  actual_hours: number
  credited_hours: number
  required_hours: number
  contract_months: number
}

/** 逐學期「實修/應修（封頂）」：例「上 14/12（計 12）」；無契約月數的學期不顯示。 */
export function semesterProgressLabels(semesters: readonly SemesterProgress[]): string[] {
  return semesters
    .filter((s) => s.contract_months > 0)
    .map((s) => {
      const name = s.semester === 1 ? '上' : s.semester === 2 ? '下' : String(s.semester)
      const capped = s.credited_hours !== s.actual_hours ? `（計 ${fmtHours(s.credited_hours)}）` : ''
      return `${name} ${fmtHours(s.actual_hours)}/${fmtHours(s.required_hours)}${capped}`
    })
}

function fmtHours(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1)
}
