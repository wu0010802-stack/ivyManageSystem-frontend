import { describe, it, expect } from 'vitest'
import { resolveManualDeltaRanges } from '../manualDeltaRanges'
import { MANUAL_DELTA_RANGES } from '@/constants/appraisal'

// 後端 api/appraisal/score_items.py 以「週期基準日當下有效的 MANUAL_DELTA 規則」
// rule_config.min_delta／max_delta 驗證手填分值（超界 422）；租戶可在規則設定頁改上下限。
// 前端輸入框上下限應以同一份規則為準，常數只當載入前／失敗時的 fallback。
describe('resolveManualDeltaRanges', () => {
  it('沒有規則時回 fallback 常數', () => {
    expect(resolveManualDeltaRanges({})).toEqual(MANUAL_DELTA_RANGES)
    expect(resolveManualDeltaRanges(null)).toEqual(MANUAL_DELTA_RANGES)
  })

  it('MANUAL_DELTA 規則的 min_delta／max_delta 覆蓋 fallback', () => {
    const r = resolveManualDeltaRanges({
      EXAM_RESULT: { item_code: 'EXAM_RESULT', rule_type: 'MANUAL_DELTA', rule_config: { min_delta: -5, max_delta: 15 } },
    })
    expect(r.EXAM_RESULT).toEqual({ min: -5, max: 15 })
    expect(r.RECRUIT_SCORE).toEqual(MANUAL_DELTA_RANGES.RECRUIT_SCORE)
  })

  it('後端 Decimal 序列化成字串也能解析', () => {
    const r = resolveManualDeltaRanges({
      RECRUIT_SCORE: { rule_type: 'MANUAL_DELTA', rule_config: { min_delta: '0', max_delta: '25.5' } },
    })
    expect(r.RECRUIT_SCORE).toEqual({ min: 0, max: 25.5 })
  })

  it('非 MANUAL_DELTA 規則或 config 缺值時不覆蓋', () => {
    const r = resolveManualDeltaRanges({
      EXAM_RESULT: { rule_type: 'PER_COUNT', rule_config: { min_delta: -1, max_delta: 1 } },
      SUPERVISOR_SCORE: { rule_type: 'MANUAL_DELTA', rule_config: { min_delta: 0 } },
    })
    expect(r.EXAM_RESULT).toEqual(MANUAL_DELTA_RANGES.EXAM_RESULT)
    expect(r.SUPERVISOR_SCORE).toEqual(MANUAL_DELTA_RANGES.SUPERVISOR_SCORE)
  })
})
