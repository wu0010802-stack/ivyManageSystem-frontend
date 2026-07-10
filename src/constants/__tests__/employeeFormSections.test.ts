// src/constants/__tests__/employeeFormSections.test.ts
// countEmptyBySection：員工表單各收合區段「未填 n 項」徽章用的純函式。
import { describe, it, expect } from 'vitest'
import { countEmptyBySection } from '../employeeFormSections'

describe('countEmptyBySection', () => {
  it('區段中值為 \'\'/null/undefined 的欄位計入未填數', () => {
    // jobDetail 4 欄：position/supervisor_role/bonus_grade/probation_end_date
    const form = {
      position: '',
      supervisor_role: null,
      bonus_grade: undefined,
      probation_end_date: '2026-01-01',
    }
    const counts = countEmptyBySection(form)
    expect(counts.jobDetail).toBe(3)
  })

  it('欄位在 form 中完全缺席（key 不存在）視同 undefined，計入未填數', () => {
    const counts = countEmptyBySection({})
    // jobDetail: position/supervisor_role/bonus_grade/probation_end_date 全缺席
    expect(counts.jobDetail).toBe(4)
    // personal: birthday/id_number/phone/email/address/dependents/emergency_contact_name/emergency_contact_phone
    expect(counts.personal).toBe(8)
    // worktime: work_start_time/work_end_time
    expect(counts.worktime).toBe(2)
    // gov: staff_role_category/teacher_cert_no/teacher_cert_type
    expect(counts.gov).toBe(3)
  })

  it('0 與 false 視為已填，不可誤判為未填', () => {
    const form = {
      // personal 區段：dependents=0 是合法值（無眷屬），其餘欄位補滿避免污染計數
      birthday: '2000-01-01',
      id_number: 'A123456789',
      phone: '0912345678',
      email: 'a@b.com',
      address: '台北市',
      dependents: 0,
      emergency_contact_name: '王小明',
      emergency_contact_phone: '0987654321',
    }
    const counts = countEmptyBySection(form)
    expect(counts.personal).toBe(0)
  })

  it('區段全部填寫 → 該區段回 0（n=0 情境，供呼叫端判斷是否隱藏徽章）', () => {
    const form = {
      work_start_time: '08:00',
      work_end_time: '17:00',
    }
    const counts = countEmptyBySection(form)
    expect(counts.worktime).toBe(0)
  })

  it('未登記於 EMPLOYEE_FIELD_SECTION 的鍵不影響任何區段計數', () => {
    const counts = countEmptyBySection({ some_unmapped_field: '' })
    expect(counts.jobDetail).toBe(4)
    expect(counts.personal).toBe(8)
    expect(counts.worktime).toBe(2)
    expect(counts.gov).toBe(3)
  })
})
