/**
 * SPEC-025：學生編輯表單的銷帳碼欄位。
 *
 * 這個 4 碼是永豐認學生的身分，跟著學生走（不是跟著某一批檢核檔）。
 *
 * ⚠ 斷言對象是 STUDENT_FIELD_SECTION 這張表本身，不是 sectionForStudentField()
 * ——後者對未登記欄位會 fallback 回 'core'，拿它斷言的話實作前就會綠。
 */
import { describe, expect, it } from 'vitest'
import { STUDENT_FIELD_SECTION } from '@/constants/studentFormSections'

describe('銷帳碼欄位登記', () => {
  it('已登記在核心區段（永遠顯示，不必展開）', () => {
    expect(STUDENT_FIELD_SECTION.collection_suffix).toBe('core')
  })
})
