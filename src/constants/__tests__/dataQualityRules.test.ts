import { describe, it, expect } from 'vitest'

import {
  DATA_QUALITY_RULES,
  RULE_FILTER_OPTIONS,
  SEVERITY_TAG_TYPES,
  STATUS_LABELS,
  getEntityMeta,
  getRuleMeta,
} from '../dataQualityRules'

describe('dataQualityRules', () => {
  describe('getRuleMeta', () => {
    it('回傳已知規則的中文說明', () => {
      const meta = getRuleMeta('employee_active_but_offboarded')
      expect(meta.label).toBe('員工已過離職日但仍為在職')
      expect(meta.selfServiceable).toBe(true)
      expect(meta.howToFix).not.toBe('')
    })

    it('未知 rule_code 降級為 fallback 而不拋錯', () => {
      // 後端新增規則但前端還沒同步時的情境——本頁不可以壞掉
      const meta = getRuleMeta('some_future_rule_not_yet_known')
      expect(meta.label).toBe('some_future_rule_not_yet_known')
      expect(meta.selfServiceable).toBe(false)
      expect(meta.what).toContain('尚未有中文說明')
    })

    it('孤兒外鍵類規則標記為無法自行修正', () => {
      for (const code of [
        'contact_book_orphan_student',
        'salary_record_orphan_employee',
        'guardian_orphan_user',
      ]) {
        expect(getRuleMeta(code).selfServiceable).toBe(false)
      }
    })
  })

  describe('getEntityMeta', () => {
    it('學生與員工可跳轉至對應管理頁', () => {
      expect(getEntityMeta('student').toRoute?.('123')).toBe('/students/profile/123')
      expect(getEntityMeta('employee').toRoute?.('45')).toBe('/employees/45')
    })

    it('無對應管理頁的實體 toRoute 為 null', () => {
      expect(getEntityMeta('contact_book_entry').toRoute).toBeNull()
      expect(getEntityMeta('guardian').toRoute).toBeNull()
      expect(getEntityMeta('salary_record').toRoute).toBeNull()
    })

    it('未知 entity_type 降級為不可點的純文字', () => {
      const meta = getEntityMeta('mystery_table')
      expect(meta.label).toBe('mystery_table')
      expect(meta.toRoute).toBeNull()
    })
  })

  it('規則篩選選項涵蓋全部已知規則', () => {
    expect(RULE_FILTER_OPTIONS).toHaveLength(Object.keys(DATA_QUALITY_RULES).length)
    expect(RULE_FILTER_OPTIONS.every((o) => o.label && o.value)).toBe(true)
  })

  it('嚴重度與狀態皆有對應標籤', () => {
    expect(SEVERITY_TAG_TYPES.P0).toBe('danger')
    expect(STATUS_LABELS.open).toBe('待處理')
    expect(STATUS_LABELS.fixed).toBe('已修正')
  })
})
