import { describe, expect, it } from 'vitest'

import { buildStudentMutationPayload } from '../studentEditPayload'

describe('buildStudentMutationPayload', () => {
  it('編輯資料來源未含政府欄位時，不送預設國籍與弱勢標記覆寫資料庫', () => {
    const payload = buildStudentMutationPayload(
      {
        id: 7,
        name: '測試生',
        nationality: '本國',
        is_disadvantaged: false,
        notes: null,
      },
      {
        isEdit: true,
        initial: { id: 7, name: '測試生', notes: '原備註' },
        canHealthWrite: false,
        canSpecialNeedsWrite: false,
        canGuardianWrite: true,
      },
    )

    expect(payload).toEqual({ notes: null })
    expect(payload).not.toHaveProperty('nationality')
    expect(payload).not.toHaveProperty('is_disadvantaged')
  })

  it('沒有細粒度權限時移除健康與特教寫入欄位', () => {
    const payload = buildStudentMutationPayload(
      {
        id: 9,
        name: '受保護學生',
        allergy: '花生',
        medication: '吸入劑',
        special_needs: '需要協助',
        is_special_education: true,
        disability_type: '聽覺障礙',
      },
      {
        isEdit: true,
        initial: {
          id: 9,
          name: '受保護學生',
          allergy: null,
          medication: null,
          special_needs: null,
          is_special_education: null,
          disability_type: null,
        },
        canHealthWrite: false,
        canSpecialNeedsWrite: false,
        canGuardianWrite: true,
      },
    )

    expect(payload).toEqual({})
  })

  it('沒有監護人讀寫權限時不送遮罩後的 null，避免清除真實聯絡資料', () => {
    const payload = buildStudentMutationPayload(
      {
        id: 10,
        name: '家長欄位學生',
        parent_name: '王家長',
        parent_phone: null,
        address: null,
        emergency_contact_name: null,
        emergency_contact_phone: null,
        emergency_contact_relation: null,
      },
      {
        isEdit: true,
        initial: {
          id: 10,
          name: '家長欄位學生',
          parent_name: '王家長',
          parent_phone: null,
          address: null,
          emergency_contact_name: null,
          emergency_contact_phone: null,
          emergency_contact_relation: null,
        },
        canHealthWrite: false,
        canSpecialNeedsWrite: false,
        canGuardianWrite: false,
      },
    )

    expect(payload).toEqual({})
  })

  it('編輯只送實際變更欄位，避免舊表單覆寫同時發生的更新', () => {
    const payload = buildStudentMutationPayload(
      { id: 11, name: '競態學生', classroom_id: 10, notes: '新備註' },
      {
        isEdit: true,
        initial: { id: 11, name: '競態學生', classroom_id: 10, notes: '舊備註' },
        canHealthWrite: false,
        canSpecialNeedsWrite: false,
        canGuardianWrite: false,
      },
    )

    expect(payload).toEqual({ notes: '新備註' })
  })

  it('真正改班時附上來源班級 CAS', () => {
    const payload = buildStudentMutationPayload(
      { id: 12, name: '轉班學生', classroom_id: 20 },
      {
        isEdit: true,
        initial: { id: 12, name: '轉班學生', classroom_id: 10 },
        canHealthWrite: false,
        canSpecialNeedsWrite: false,
        canGuardianWrite: false,
      },
    )

    expect(payload).toEqual({ classroom_id: 20, source_classroom_id: 10 })
  })
})
