import { describe, it, expect } from 'vitest'
import {
  FESTIVAL_RULE_TOGGLES,
  emptyFestivalRuleToggles,
  pickFestivalRuleToggles,
  newlyEnabledFestivalRules,
} from '../festivalRuleToggles'

describe('festivalRuleToggles', () => {
  it('四個開關 key 與後端 BonusConfigUpdate 欄位一致、標籤固定', () => {
    expect(FESTIVAL_RULE_TOGGLES.map((t) => [t.key, t.label])).toEqual([
      ['festival_leader_class_ratio', '組長帶班按班級比例'],
      ['festival_unassigned_teacher_school_ratio', '未帶班教保給全校比例'],
      ['festival_new_class_guarantee', '新班／新接班保障 80%'],
      ['festival_shared_assistant_simple_avg', '共用副班導簡單平均'],
    ])
  })

  it('初值全為 null（未載入時送出不異動租戶設定）', () => {
    expect(Object.values(emptyFestivalRuleToggles())).toEqual([null, null, null, null])
  })

  it('pick：布林原樣保留，非布林（缺欄位／字串）轉 null', () => {
    const out = pickFestivalRuleToggles({
      festival_leader_class_ratio: true,
      festival_unassigned_teacher_school_ratio: false,
      festival_new_class_guarantee: 'true',
      other_field: 123,
    })
    expect(out).toEqual({
      festival_leader_class_ratio: true,
      festival_unassigned_teacher_school_ratio: false,
      festival_new_class_guarantee: null,
      festival_shared_assistant_simple_avg: null,
    })
    expect(out).not.toHaveProperty('other_field')
  })

  it('newlyEnabled：只回報由非 true 改成 true 的開關', () => {
    const before = { festival_leader_class_ratio: true, festival_new_class_guarantee: false }
    const after = {
      festival_leader_class_ratio: true,
      festival_new_class_guarantee: true,
      festival_shared_assistant_simple_avg: true,
      festival_unassigned_teacher_school_ratio: false,
    }
    expect(newlyEnabledFestivalRules(before, after).map((d) => d.key)).toEqual([
      'festival_new_class_guarantee',
      'festival_shared_assistant_simple_avg',
    ])
  })

  it('newlyEnabled：關閉或未變動不提示', () => {
    const before = { festival_leader_class_ratio: true }
    const after = { festival_leader_class_ratio: false }
    expect(newlyEnabledFestivalRules(before, after)).toEqual([])
  })
})
