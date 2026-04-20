// POS 收銀常數
// 園所資訊變動頻率極低，直接定義於此；日後要動態化再搬至 SystemConfig API

export const POS_ORG_INFO = {
  name: '常春藤幼兒園',
  subtitle: '課後才藝繳費收據',
}

export const POS_PAYMENT_METHODS = [
  { value: '現金', label: '現金' },
  { value: '轉帳', label: '轉帳' },
  { value: '其他', label: '其他' },
]

export const POS_MODES = [
  { value: 'by-student', label: '依學生' },
  { value: 'by-registration', label: '依日期' },
]

export const CASH_METHOD = '現金'

// 大額交易二次確認門檻（元）
export const LARGE_AMOUNT_THRESHOLD = 10000

export const formatTWD = (n) => {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return `NT$ ${Number(n).toLocaleString('zh-Hant')}`
}

/**
 * 統一欠費計算：各頁面都應透過此 helper 以保持規則一致。
 * 若之後後端調整 derive（例如加上 offline_paid 扣減），只改這裡即可。
 */
export const computeOwed = (total, paid) =>
  Math.max(0, (Number(total) || 0) - (Number(paid) || 0))

// 中文大寫金額（收據用）：1500 → 壹仟伍佰元整
const _CN_DIGITS = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖']
const _CN_UNITS = ['', '拾', '佰', '仟']
const _CN_BIG_UNITS = ['', '萬', '億', '兆']

export function toChineseAmount(n) {
  const num = Math.floor(Number(n) || 0)
  if (num === 0) return '零元整'
  if (num < 0) return `負${toChineseAmount(-num)}`

  // 以 4 位一組分段
  const str = String(num)
  const groups = []
  for (let i = str.length; i > 0; i -= 4) {
    groups.unshift(str.slice(Math.max(0, i - 4), i))
  }

  const parts = []
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
