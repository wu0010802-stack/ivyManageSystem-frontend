import { describe, it, expect } from 'vitest'
import {
  ACTIVITY_RULE_TOGGLES,
  emptyActivityRuleToggles,
  parseEmployeeIdList,
  pickActivityRuleToggles,
} from '../activityRuleToggles'

describe('ACTIVITY_RULE_TOGGLES', () => {
  it('兩個開關的 key 與後端 BonusConfig 欄名一致，各屬推動獎與教課獎勵一張卡片', () => {
    expect(ACTIVITY_RULE_TOGGLES.map((d) => [d.key, d.section])).toEqual([
      ['after_class_award_midterm_rule', 'promo'],
      ['teaching_extra_admin_half_rule', 'teaching'],
    ])
  })

  it('文案不寫死特定租戶品牌', () => {
    for (const def of ACTIVITY_RULE_TOGGLES) {
      expect(`${def.label}${def.hint}`).not.toMatch(/義華|仁武/)
    }
  })
})

describe('emptyActivityRuleToggles / pickActivityRuleToggles', () => {
  it('初值全部是 null（未載入＝不異動，不是 false）', () => {
    expect(emptyActivityRuleToggles()).toEqual({
      teaching_extra_admin_half_rule: null,
      after_class_award_midterm_rule: null,
    })
  })

  it('保留布林值，非布林一律轉 null', () => {
    expect(
      pickActivityRuleToggles({
        teaching_extra_admin_half_rule: true,
        after_class_award_midterm_rule: false,
      }),
    ).toEqual({ teaching_extra_admin_half_rule: true, after_class_award_midterm_rule: false })

    expect(
      pickActivityRuleToggles({
        teaching_extra_admin_half_rule: 'true',
        after_class_award_midterm_rule: undefined,
      }),
    ).toEqual({ teaching_extra_admin_half_rule: null, after_class_award_midterm_rule: null })
  })

  it('來源缺欄位（舊後端）時兩個都是 null', () => {
    expect(pickActivityRuleToggles({})).toEqual(emptyActivityRuleToggles())
  })
})

describe('parseEmployeeIdList', () => {
  it('欄位不存在回 null（呼叫端不送出，避免洗掉既有名單）', () => {
    expect(parseEmployeeIdList(undefined)).toBeNull()
  })

  it('新後端尚未設定（null）視為空名單', () => {
    expect(parseEmployeeIdList(null)).toEqual([])
  })

  it('陣列轉成數字，丟掉無法轉換或非正整數的值', () => {
    expect(parseEmployeeIdList([3, '5', 'x', 0, -1, 2.5])).toEqual([3, 5])
  })

  it('非陣列的怪值視為空名單', () => {
    expect(parseEmployeeIdList('3,5')).toEqual([])
  })
})
