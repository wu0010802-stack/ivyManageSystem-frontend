import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { usePublicRegistrationForm } from '@/composables/usePublicRegistrationForm'

function setup() {
  const courses = ref([{ name: '舞蹈', price: 1800 }, { name: '美術', price: 1500 }])
  const supplies = ref([{ name: '舞衣', price: 600 }])
  const availability = ref<Record<string, number>>({ 舞蹈: 5, 美術: 5 })
  return usePublicRegistrationForm({ courses, supplies, availability })
}

describe('resetForNextApplicant（幫另一位寶貝報名）', () => {
  it('保留家長手機與 Email，清空孩子資料與選課', () => {
    const { form, resetForNextApplicant } = setup()
    form.name = '王小明'
    form.class_name = '大班A'
    form.parent_phone = '0912345678'
    form.email = 'parent@example.com'
    form.selectedCourses = ['舞蹈']
    form.selectedSupplies = ['舞衣']

    resetForNextApplicant({ parentPhone: '0912345678', email: 'parent@example.com' })

    expect(form.parent_phone).toBe('0912345678')
    expect(form.email).toBe('parent@example.com')
    expect(form.name).toBe('')
    expect(form.class_name).toBe('')
    expect(form.selectedCourses).toEqual([])
    expect(form.selectedSupplies).toEqual([])
  })

  it('未帶聯絡資料時等同完整清空（不殘留上一筆的手機）', () => {
    const { form, resetForNextApplicant } = setup()
    form.parent_phone = '0912345678'
    form.email = 'parent@example.com'

    resetForNextApplicant()

    expect(form.parent_phone).toBe('')
    expect(form.email).toBe('')
  })

  it('清掉上一筆送出留下的欄位錯誤，第二位寶貝不會一進來就看到紅字', () => {
    const { form, errors, validateForm, resetForNextApplicant } = setup()
    validateForm()
    expect(errors.name).toBeTruthy()
    expect(errors.courses).toBeTruthy()

    resetForNextApplicant({ parentPhone: '0912345678' })

    expect(errors.name).toBe('')
    expect(errors.class_name).toBe('')
    expect(errors.parent_phone).toBe('')
    expect(errors.email).toBe('')
    expect(errors.courses).toBe('')
    expect(form.parent_phone).toBe('0912345678')
  })
})
