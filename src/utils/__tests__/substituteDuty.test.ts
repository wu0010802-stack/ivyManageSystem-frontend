import { describe, expect, it } from 'vitest'
import { extractSubstituteDutyWarnings, formatSubstituteDutyWarning } from '@/utils/substituteDuty'

describe('formatSubstituteDutyWarning', () => {
  it('帶假單編號與日期', () => {
    expect(
      formatSubstituteDutyWarning({ code: 'existing_shift', leave_id: 12, date: '2026-09-16', message: '9/16 代理人已有調班' }),
    ).toBe('【代理接手職務】假單 #12（2026-09-16）：9/16 代理人已有調班')
  })

  it('沒有日期時省略括號', () => {
    expect(formatSubstituteDutyWarning({ code: 'waived', leave_id: 3, date: null, message: '主管未等代理人接受就核准' })).toBe(
      '【代理接手職務】假單 #3：主管未等代理人接受就核准',
    )
  })

  it('缺 message 或不是物件時回空字串', () => {
    expect(formatSubstituteDutyWarning({ code: 'x', leave_id: 1 })).toBe('')
    expect(formatSubstituteDutyWarning(null)).toBe('')
    expect(formatSubstituteDutyWarning('oops')).toBe('')
  })
})

describe('extractSubstituteDutyWarnings', () => {
  it('從 axios 回應的 data 取出並格式化', () => {
    const res = {
      data: {
        message: '已核准',
        substitute_duty_warnings: [
          { code: 'existing_shift', leave_id: 5, date: '2026-09-16', message: 'A' },
          { code: 'recorded_attendance', leave_id: 5, date: '2026-09-17', message: 'B' },
        ],
      },
    }
    expect(extractSubstituteDutyWarnings(res)).toEqual([
      '【代理接手職務】假單 #5（2026-09-16）：A',
      '【代理接手職務】假單 #5（2026-09-17）：B',
    ])
  })

  it('沒有欄位、不是陣列、回應為空都回空陣列', () => {
    expect(extractSubstituteDutyWarnings(undefined)).toEqual([])
    expect(extractSubstituteDutyWarnings({})).toEqual([])
    expect(extractSubstituteDutyWarnings({ data: {} })).toEqual([])
    expect(extractSubstituteDutyWarnings({ data: { substitute_duty_warnings: 'x' } })).toEqual([])
  })

  it('略過格式不對的項目，不拋錯', () => {
    const res = { data: { substitute_duty_warnings: [null, { leave_id: 1 }, { leave_id: 2, message: 'ok' }] } }
    expect(extractSubstituteDutyWarnings(res)).toEqual(['【代理接手職務】假單 #2：ok'])
  })
})
