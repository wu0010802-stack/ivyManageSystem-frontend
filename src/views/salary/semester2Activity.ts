/**
 * 下學期（2–7 月）推動才藝獎勵金＋教課教師獎勵金 8 月表外批次（義華 2026-10-27）的前端純邏輯。
 * 後端權威：api/extra_bonuses.py semester2-activity、services/semester2_activity_payout。
 *
 * preview 每列的 `detail` 是自由格式 dict（OpenAPI 只有 `{[key: string]: unknown}`），
 * 形狀由類別決定，這裡逐欄 narrow 成顯示用的文字行，缺欄位或型別不對一律略過。
 */

import { removalDescriptionParts } from './semester2Excess'

const CATEGORY_LABELS: Record<string, string> = {
  after_class_promo: '推動才藝獎勵金',
  teaching_extra: '教課教師獎勵金',
}

export function activityCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category
}

type Dict = Record<string, unknown>

const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const fmt = (n: number) => n.toLocaleString('en-US')

function promoLines(detail: Dict): string[] {
  const lines: string[] = []
  if (Array.isArray(detail.classes)) {
    for (const c of detail.classes) {
      if (!isDict(c)) continue
      const j = num(c.j)
      const price = num(c.unit_price)
      const amount = num(c.amount)
      if (typeof c.classroom_name !== 'string' || j === null || price === null || amount === null) continue
      lines.push(`${c.classroom_name}（班導）：${fmt(j)} 人次 × ${fmt(price)} 元 = ${fmt(amount)} 元`)
    }
  }
  if (isDict(detail.promoter)) {
    const totalJ = num(detail.promoter.total_j)
    const price = num(detail.promoter.unit_price)
    const amount = num(detail.promoter.amount)
    if (totalJ !== null && price !== null && amount !== null) {
      lines.push(`全校推動：${fmt(totalJ)} 人次 × ${fmt(price)} 元 = ${fmt(amount)} 元`)
    }
  }
  return lines
}

function teachingLines(detail: Dict): string[] {
  const lines: string[] = []
  if (Array.isArray(detail.courses)) {
    for (const c of detail.courses) {
      if (!isDict(c)) continue
      const students = num(c.student_count)
      const units = num(c.units)
      const price = num(c.unit_price)
      const amount = num(c.amount)
      if (typeof c.course_name !== 'string' || students === null || units === null || price === null || amount === null) continue
      let line = `${c.course_name}：${fmt(students)} 位幼生 × ${fmt(units)} 計次 × ${fmt(price)} 元 = ${fmt(amount)} 元`
      const multiplier = num(c.multiplier)
      const payable = num(c.payable_amount)
      if (multiplier !== null && multiplier !== 1 && payable !== null) line += `，減半後 ${fmt(payable)} 元`
      lines.push(line)
    }
  }
  if (isDict(detail.admin_half_rule)) {
    const fullSlots = num(detail.admin_half_rule.full_slots)
    if (fullSlots !== null) {
      const who = detail.admin_half_rule.mode === 'payroll_staff' ? '（負責核算薪資同事）' : ''
      lines.push(`未帶班減半${who}：第 ${fullSlots + 1} 門起減半`)
    }
  }
  return lines
}

/** 把一列 preview 的 detail 轉成可直接顯示的文字行；未知類別或形狀不對回空陣列。 */
export function activityDetailLines(category: string, detail: unknown): string[] {
  if (!isDict(detail)) return []
  if (category === 'after_class_promo') return promoLines(detail)
  if (category === 'teaching_extra') return teachingLines(detail)
  return []
}

/** 套用時真正會寫入的列數：金額大於 0，且沒有人工登錄（人工優先，不覆寫）。 */
export function payableActivityCount(rows: { amount: number; has_manual_payment: boolean }[]): number {
  return rows.filter((r) => r.amount > 0 && !r.has_manual_payment).length
}

interface Brief {
  employee_name: string
  category: string
  amount?: number
}

/** 同一位員工兩個類別各自一列，名單要註明類別才分得出來。 */
export function activityBriefNames(list: Brief[]): string {
  return list.map((b) => `${b.employee_name}（${activityCategoryLabel(b.category)}）`).join('、')
}

/** 套用結果的補充說明（人工登錄跳過、執行者本人跳過）；兩者皆無回空字串。 */
export function activityApplyDescription(r: {
  skipped_manual: Brief[]
  skipped_self: Brief[]
  removed_duplicates?: Brief[]
  removed_for_manual?: Brief[]
}): string {
  const parts: string[] = []
  if (r.skipped_manual.length > 0) parts.push(`已有人工登錄（未覆寫）：${activityBriefNames(r.skipped_manual)}`)
  if (r.skipped_self.length > 0) {
    parts.push(`執行者本人未產生：${activityBriefNames(r.skipped_self)}，請由其他有權限的人員再執行一次`)
  }
  parts.push(...removalDescriptionParts(r, (b) => `${b.employee_name}（${activityCategoryLabel(b.category)}）`))
  return parts.join('；')
}
