/**
 * TDD：POSSearchPanel by-date 模式付款面板明細不完整
 *
 * 問題根因：handleSingleToggle 以 course_names.split('、') 合成 courses（price:0）、
 * 且 supplies:[]，導致面板拿不到真實課程金額與用品。
 *
 * 修法：抽出純函式 normalizeByDateRow，優先使用 row 已有的 courses/supplies，
 * 僅在缺失時才 fallback 到 course_names 字串拆解。
 */
import { describe, it, expect } from 'vitest'
import { normalizeByDateRow } from '@/constants/pos'

// 模擬後端 getRegistrations 回傳的完整報名列
function makeRow(over: Record<string, unknown> = {}) {
  return {
    id: 42,
    student_name: '林小美',
    class_name: '中班',
    total_amount: 2300,
    paid_amount: 0,
    created_at: '2026-06-20T10:00:00+08:00',
    course_names: '美術、鋼琴',
    courses: [
      { name: '美術', price: 1500, status: 'enrolled' },
      { name: '鋼琴', price: 800, status: 'enrolled' },
    ],
    supplies: [{ name: '手工材料包', price: 0, status: 'active' }],
    ...over,
  }
}

describe('normalizeByDateRow — by-date 模式行資料正規化', () => {
  it('（a）row 有真實 courses → 正規化後保留原始 price，不置零', () => {
    const result = normalizeByDateRow(makeRow())
    expect(result.courses).toHaveLength(2)
    expect(result.courses[0]).toMatchObject({ name: '美術', price: 1500 })
    expect(result.courses[1]).toMatchObject({ name: '鋼琴', price: 800 })
  })

  it('（a）row 有真實 supplies → 正規化後保留 supplies，不回傳空陣列', () => {
    const result = normalizeByDateRow(makeRow())
    expect(result.supplies).toHaveLength(1)
    expect(result.supplies[0]).toMatchObject({ name: '手工材料包' })
  })

  it('（b）防迴歸：row 無 courses 陣列時 fallback 到 course_names 拆解，仍能呈現課程品名', () => {
    const row = makeRow({ courses: undefined })
    const result = normalizeByDateRow(row)
    expect(result.courses).toHaveLength(2)
    expect(result.courses.map((c: { name: string }) => c.name)).toContain('美術')
    expect(result.courses.map((c: { name: string }) => c.name)).toContain('鋼琴')
  })

  it('（b）防迴歸：row 無 supplies 陣列時回傳空陣列（不崩潰）', () => {
    const row = makeRow({ supplies: undefined })
    const result = normalizeByDateRow(row)
    expect(result.supplies).toEqual([])
  })

  it('欠費計算（owed）維持不變：total - paid', () => {
    const result = normalizeByDateRow(makeRow({ total_amount: 2300, paid_amount: 800 }))
    expect(result.owed).toBe(1500)
  })
})
