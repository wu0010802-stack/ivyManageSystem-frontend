// POS 收銀常數
// 園所資訊變動頻率極低，直接定義於此；日後要動態化再搬至 SystemConfig API

import { formatCurrency } from '@/utils/currency'

export const POS_ORG_INFO = {
  name: '常春藤幼兒園',
  subtitle: '課後才藝繳費收據',
}

export const POS_MODES = [
  { value: 'by-student', label: '依學生' },
  { value: 'by-registration', label: '依日期' },
]

// 才藝 POS 僅收現金（spec 2026-05-06-pos-cash-only-design.md）
// 若未來擴充付款方式，後端 schema (api/activity/pos.py POSCheckoutRequest.payment_method)
// 與此處需同步調整
export const CASH_METHOD = '現金'

// 大額交易二次確認門檻（元）：金額 ≥ 此值時跳出確認框，避免手誤輸錯金額
export const LARGE_AMOUNT_THRESHOLD = 10000

// 退費簽核門檻（元）：單筆退費 > 此值需 ACTIVITY_PAYMENT_APPROVE 權限
// 必須與後端 api/activity/_shared.py REFUND_APPROVAL_THRESHOLD 對齊
export const REFUND_APPROVAL_THRESHOLD = 1000

// 委派至全站單一金額 helper（NT$1,234，無空格 / —）。
export const formatTWD = (n: unknown): string => formatCurrency(n)

/**
 * 統一欠費計算：各頁面都應透過此 helper 以保持規則一致。
 * 若之後後端調整 derive（例如加上 offline_paid 扣減），只改這裡即可。
 */
export const computeOwed = (total: unknown, paid: unknown): number =>
  Math.max(0, (Number(total) || 0) - (Number(paid) || 0))

export interface POSCourseEntry {
  name: string
  price: number
  [key: string]: unknown
}

export interface POSByDateNormalized {
  id: unknown
  student_name: string
  class_name: string
  total_amount: number
  paid_amount: number
  owed: number
  courses: POSCourseEntry[]
  supplies: POSCourseEntry[]
  [key: string]: unknown
}

/**
 * by-date 模式行資料正規化：
 * 優先使用後端回傳的真實 courses / supplies（含 price），
 * 僅在缺失時才 fallback 到 course_names 字串拆解（price 為 0）。
 * handleSingleToggle 呼叫此函式，確保付款面板顯示完整明細。
 */
export function normalizeByDateRow(row: Record<string, unknown>): POSByDateNormalized {
  const owed = computeOwed(row.total_amount, row.paid_amount)

  let courses: POSCourseEntry[]
  if (Array.isArray(row.courses) && row.courses.length > 0) {
    courses = row.courses as POSCourseEntry[]
  } else {
    // fallback：後端若未回傳結構化課程，以 course_names 拆解，price 填 0
    courses = (String(row.course_names || ''))
      .split('、')
      .filter(Boolean)
      .map((name) => ({ name, price: 0, status: 'enrolled' }))
  }

  const supplies: POSCourseEntry[] = Array.isArray(row.supplies)
    ? (row.supplies as POSCourseEntry[])
    : []

  return {
    ...row,
    id: row.id,
    student_name: String(row.student_name || ''),
    class_name: String(row.class_name || ''),
    total_amount: Number(row.total_amount || 0),
    paid_amount: Number(row.paid_amount || 0),
    owed,
    courses,
    supplies,
  }
}

// 中文大寫金額（收據用）：1500 → 壹仟伍佰元整
const _CN_DIGITS = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖']
const _CN_UNITS = ['', '拾', '佰', '仟']
const _CN_BIG_UNITS = ['', '萬', '億', '兆']

export function toChineseAmount(n: unknown): string {
  const num = Math.floor(Number(n) || 0)
  if (num === 0) return '零元整'
  if (num < 0) return `負${toChineseAmount(-num)}`

  // 以 4 位一組分段
  const str = String(num)
  const groups: string[] = []
  for (let i = str.length; i > 0; i -= 4) {
    groups.unshift(str.slice(Math.max(0, i - 4), i))
  }

  const parts: string[] = []
  const totalGroups = groups.length
  groups.forEach((group, gi) => {
    const groupDigits = group.split('').map(Number)
    let segment = ''
    let zeroPending = false
    const len = groupDigits.length
    groupDigits.forEach((d, idx) => {
      const unit = _CN_UNITS[len - 1 - idx]
      if (d === 0) {
        zeroPending = true
      } else {
        if (zeroPending && segment) segment += '零'
        segment += _CN_DIGITS[d] + unit
        zeroPending = false
      }
    })
    if (segment) {
      parts.push(segment + _CN_BIG_UNITS[totalGroups - 1 - gi])
    } else if (parts.length && totalGroups - 1 - gi === 0) {
      // 全零段（通常不會進來，但保險）
    }
  })

  return parts.join('') + '元整'
}
