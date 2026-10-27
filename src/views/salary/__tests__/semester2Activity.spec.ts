import { describe, it, expect } from 'vitest'
import {
  activityApplyDescription,
  activityBriefNames,
  activityCategoryLabel,
  activityDetailLines,
  payableActivityCount,
} from '../semester2Activity'

describe('activityCategoryLabel', () => {
  it('兩個類別轉中文，未知代碼原樣顯示', () => {
    expect(activityCategoryLabel('after_class_promo')).toBe('推動才藝獎勵金')
    expect(activityCategoryLabel('teaching_extra')).toBe('教課教師獎勵金')
    expect(activityCategoryLabel('mystery')).toBe('mystery')
  })
})

describe('activityDetailLines — 推動才藝獎勵金', () => {
  it('班導段每班一行，全校推動段一行', () => {
    const lines = activityDetailLines('after_class_promo', {
      classes: [
        { classroom_id: 1, classroom_name: '向日葵班', j: 12, unit_price: 50, amount: 600 },
        { classroom_id: 2, classroom_name: '小熊班', j: 8, unit_price: 40, amount: 320 },
      ],
      promoter: { total_j: 120, unit_price: 30, amount: 3600 },
    })
    expect(lines).toEqual([
      '向日葵班（班導）：12 人次 × 50 元 = 600 元',
      '小熊班（班導）：8 人次 × 40 元 = 320 元',
      '全校推動：120 人次 × 30 元 = 3,600 元',
    ])
  })

  it('沒有班導段或推動段時只列有的', () => {
    expect(activityDetailLines('after_class_promo', { classes: [], promoter: null })).toEqual([])
    expect(
      activityDetailLines('after_class_promo', { promoter: { total_j: 10, unit_price: 15, amount: 150 } }),
    ).toEqual(['全校推動：10 人次 × 15 元 = 150 元'])
  })
})

describe('activityDetailLines — 教課教師獎勵金', () => {
  const course = (over: Record<string, unknown> = {}) => ({
    course_id: 1,
    course_name: '美術',
    student_count: 10,
    units: 4,
    unit_price: 60,
    amount: 2400,
    multiplier: 1,
    payable_amount: 2400,
    ...over,
  })

  it('每門課一行；沒減半就不多寫', () => {
    expect(activityDetailLines('teaching_extra', { courses: [course()], admin_half_rule: null })).toEqual([
      '美術：10 位幼生 × 4 計次 × 60 元 = 2,400 元',
    ])
  })

  it('減半的課程註明減半後的金額，並說明減半規則從第幾門起', () => {
    const lines = activityDetailLines('teaching_extra', {
      courses: [course(), course({ course_id: 2, course_name: '3C3Q', unit_price: 65, amount: 2600, multiplier: 0.5, payable_amount: 1300 })],
      admin_half_rule: { mode: 'payroll_staff', full_slots: 1 },
    })
    expect(lines[0]).toBe('美術：10 位幼生 × 4 計次 × 60 元 = 2,400 元')
    expect(lines[1]).toBe('3C3Q：10 位幼生 × 4 計次 × 65 元 = 2,600 元，減半後 1,300 元')
    expect(lines[2]).toBe('未帶班減半（負責核算薪資同事）：第 2 門起減半')
  })

  it('其他未帶班者：第 3 門起減半', () => {
    const lines = activityDetailLines('teaching_extra', {
      courses: [course()],
      admin_half_rule: { mode: 'other_staff', full_slots: 2 },
    })
    expect(lines[lines.length - 1]).toBe('未帶班減半：第 3 門起減半')
  })
})

describe('activityDetailLines — 容錯', () => {
  it('detail 缺欄位、型別怪異或未知類別都回空陣列，不丟例外', () => {
    expect(activityDetailLines('teaching_extra', {})).toEqual([])
    expect(activityDetailLines('after_class_promo', { classes: 'x', promoter: 5 })).toEqual([])
    expect(activityDetailLines('mystery', { classes: [{}] })).toEqual([])
    expect(activityDetailLines('teaching_extra', { courses: [null, 3, 'x'] })).toEqual([])
  })
})

describe('payableActivityCount', () => {
  it('只算金額大於 0 且沒有人工登錄（人工優先不覆寫）的列', () => {
    expect(
      payableActivityCount([
        { amount: 100, has_manual_payment: false },
        { amount: 0, has_manual_payment: false },
        { amount: 200, has_manual_payment: true },
        { amount: 300, has_manual_payment: false },
      ]),
    ).toBe(2)
  })
})

describe('activityBriefNames', () => {
  it('同一位員工兩個類別各列一次並註明類別', () => {
    expect(
      activityBriefNames([
        { employee_name: '林老師', category: 'after_class_promo' },
        { employee_name: '林老師', category: 'teaching_extra' },
      ]),
    ).toBe('林老師（推動才藝獎勵金）、林老師（教課教師獎勵金）')
  })
})

describe('activityApplyDescription', () => {
  const brief = (employee_name: string, category = 'teaching_extra') => ({ employee_name, category })

  it('沒有跳過的人時回空字串', () => {
    expect(activityApplyDescription({ skipped_manual: [], skipped_self: [] })).toBe('')
  })

  it('人工登錄跳過與本人跳過分開說明，並提示請別人再執行', () => {
    const text = activityApplyDescription({
      skipped_manual: [brief('王老師')],
      skipped_self: [brief('李主任', 'after_class_promo')],
    })
    expect(text).toContain('已有人工登錄（未覆寫）：王老師（教課教師獎勵金）')
    expect(text).toContain('執行者本人未產生：李主任（推動才藝獎勵金）')
    expect(text).toContain('請由其他有權限的人員再執行一次')
  })
})

describe('activityApplyDescription — 移除列', () => {
  it('人工優先移除的系統列與重複列各一句，姓名帶類別與被移除金額', () => {
    const text = activityApplyDescription({
      skipped_manual: [],
      skipped_self: [],
      removed_for_manual: [{ employee_name: '王老師', category: 'teaching_extra', amount: 600 }],
      removed_duplicates: [{ employee_name: '林老師', category: 'after_class_promo', amount: 3600 }],
    })
    expect(text).toContain('已移除系統產生的重複列：王老師（教課教師獎勵金） NT$600')
    expect(text).toContain('重複的系統產生列已去除（保留最早一筆）：林老師（推動才藝獎勵金） NT$3,600')
  })

  it('舊後端沒有移除欄位時照舊', () => {
    expect(activityApplyDescription({ skipped_manual: [], skipped_self: [] })).toBe('')
  })
})
