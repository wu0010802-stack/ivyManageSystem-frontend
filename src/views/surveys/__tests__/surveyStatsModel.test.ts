import { describe, expect, it } from 'vitest'
import {
  buildClassroomRows,
  buildOptionRows,
  buildOverview,
  buildTextRows,
} from '../surveyStatsModel'

describe('buildOverview', () => {
  it('三段相加等於分母，百分比以分母為基準', () => {
    const o = buildOverview({ denominator: 40, replied_count: 30, attending_count: 24 })
    expect(o.attending).toBe(24)
    expect(o.notAttending).toBe(6)
    expect(o.notReplied).toBe(10)
    expect(o.segments.map((s) => s.count)).toEqual([24, 6, 10])
    expect(o.segments.map((s) => s.percent)).toEqual([60, 15, 25])
    expect(o.repliedPercent).toBe(75)
    expect(o.attendingPercent).toBe(60)
  })

  it('分母 0（草稿或對象班級空）時全部為 0，不出現 NaN', () => {
    const o = buildOverview({ denominator: 0, replied_count: 0, attending_count: 0 })
    expect(o.repliedPercent).toBe(0)
    expect(o.segments.every((s) => s.percent === 0 && s.count === 0)).toBe(true)
  })

  it('資料異常（回覆數超過分母、參加超過回覆）夾在合法範圍內', () => {
    const o = buildOverview({ denominator: 10, replied_count: 12, attending_count: 15 })
    expect(o.replied).toBe(10)
    expect(o.attending).toBe(10)
    expect(o.notAttending).toBe(0)
    expect(o.notReplied).toBe(0)
  })
})

describe('buildClassroomRows', () => {
  it('補上未回覆數與回覆率，未回覆多的班排前面', () => {
    const rows = buildClassroomRows([
      { classroom_id: 1, classroom_name: '櫻花', replied: 9, total: 10, attending: 8 },
      { classroom_id: 2, classroom_name: '天堂鳥', replied: 2, total: 12, attending: 2 },
      { classroom_id: null, classroom_name: '未分班', replied: 0, total: 0, attending: 0 },
    ])
    expect(rows.map((r) => r.classroom_name)).toEqual(['天堂鳥', '櫻花', '未分班'])
    expect(rows[0].notReplied).toBe(10)
    expect(rows[0].repliedPercent).toBe(17)
    expect(rows[2].repliedPercent).toBe(0)
  })
})

describe('buildOptionRows', () => {
  it('保留選項順序，佔比以回覆參加者為分母', () => {
    const rows = buildOptionRows(
      {
        question_id: 1,
        question_text: '車次',
        question_type: 'single_choice',
        option_counts: { 早班: 18, 晚班: 6 },
      },
      24,
    )
    expect(rows).toEqual([
      { label: '早班', count: 18, percent: 75 },
      { label: '晚班', count: 6, percent: 25 },
    ])
  })

  it('option_counts 缺或值非數字時不炸', () => {
    expect(buildOptionRows({ question_id: 1, question_text: 'x', question_type: 'single_choice' }, 5)).toEqual([])
    expect(buildOptionRows({ question_id: 1, question_text: 'x', question_type: 'multi_choice', option_counts: { A: 'oops' } }, 5))
      .toEqual([{ label: 'A', count: 0, percent: 0 }])
  })
})

describe('buildTextRows', () => {
  it('轉成字串並略過空值', () => {
    const rows = buildTextRows({
      question_id: 3,
      question_text: '飲食需求',
      question_type: 'text',
      texts: [{ student_name: '小明', value: '素食' }, { student_name: '小華', value: '' }, { value: 3 }],
    })
    expect(rows).toEqual([
      { student_name: '小明', value: '素食' },
      { student_name: '', value: '3' },
    ])
  })
})
