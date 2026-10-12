import { describe, it, expect } from 'vitest'
import {
  initialCategory, matchesSearch, methodBreakdown, splitDetail, subtotal, type FinanceDetail,
} from '../financeDetail'

function detail(): FinanceDetail {
  return {
    period: { year: 2026, month: 9 },
    tuition: [
      { kind: 'payment', date: '2026-09-01', amount: 11290, student_name: '王小明', classroom_name: '茉莉班', payment_method: '轉帳' },
      { kind: 'payment', date: '2026-09-02', amount: 10800, student_name: '陳小華', classroom_name: '百合班', payment_method: 'cash' },
      { kind: 'refund', date: '2026-09-05', amount: 23000, student_name: '林小美', reason: '退學' },
    ],
    activity: [{ kind: 'payment', date: '2026-09-03', amount: 3000, student_name: '學生乙', receipt_no: 'R-0099', payment_method: 'cash' }],
    misc_receipt: [],
    salary: [{ employee_name: '甲', real_cost: null, gross_salary: null, employer_benefit: null, is_finalized: true }],
    vendor_payment: [],
    fixed_cost: [],
    collection_fee: [{ date: '2026-09-01', channel: '統一', gross_amount: 10800, amount: 2 }],
    year_end: [],
    extra_bonus: [],
  } as unknown as FinanceDetail
}

describe('splitDetail', () => {
  it('學費退款拆到「退款」組並標來源', () => {
    const s = splitDetail(detail())
    expect(s.tuition).toHaveLength(2)
    expect(s.refund).toHaveLength(1)
    expect(s.refund[0].source).toBe('學費')
    expect(s.collection_fee).toHaveLength(1)
  })
  it('null／缺欄位不炸', () => {
    const s = splitDetail(null)
    expect(s.tuition).toEqual([])
    expect(s.collection_fee).toEqual([])
  })
})

describe('subtotal／methodBreakdown', () => {
  it('付款方式小計中文化並由大到小', () => {
    const s = splitDetail(detail())
    expect(subtotal('tuition', s.tuition)).toEqual({ total: 22090, masked: false })
    expect(methodBreakdown(s.tuition)).toEqual([
      { label: '轉帳', amount: 11290 },
      { label: '現金', amount: 10800 },
    ])
  })
  it('薪資金額被遮罩（null）時標 masked，不當 0 加總', () => {
    const s = splitDetail(detail())
    expect(subtotal('salary', s.salary)).toEqual({ total: 0, masked: true })
  })
})

describe('initialCategory／matchesSearch', () => {
  it('指定組別找第一個有資料的分類；該組沒有就退回第一個有資料的', () => {
    const s = splitDetail(detail())
    expect(initialCategory(s, 'expense')).toBe('salary')
    expect(initialCategory(s, 'refund')).toBe('refund')
    expect(initialCategory({ ...s, salary: [], collection_fee: [] }, 'expense')).toBe('tuition')
  })
  it('搜尋姓名、班級、代收機構', () => {
    const s = splitDetail(detail())
    expect(s.tuition.filter(r => matchesSearch(r, '茉莉'))).toHaveLength(1)
    expect(s.collection_fee.filter(r => matchesSearch(r, '統一'))).toHaveLength(1)
    expect(s.tuition.filter(r => matchesSearch(r, ''))).toHaveLength(2)
    expect(s.activity.filter(r => matchesSearch(r, 'R-0099'))).toHaveLength(1) // 才藝收據號欄位叫 receipt_no
  })
})
