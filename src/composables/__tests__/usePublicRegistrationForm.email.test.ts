import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { usePublicRegistrationForm } from '@/composables/usePublicRegistrationForm'

function setup() {
  const courses = ref([{ name: '圍棋', price: 1000 }])
  const supplies = ref<{ name: string; price?: number }[]>([])
  const availability = ref<Record<string, number>>({})
  return usePublicRegistrationForm({ courses, supplies, availability })
}

function fillValidBase(form: ReturnType<typeof setup>['form']) {
  form.name = '王小明'
  form.birthday = '2020-05-10'
  form.parent_phone = '0912345678'
  form.class_name = '海豚班'
  form.selectedCourses = ['圍棋']
}

describe('公開報名表單 email 欄位', () => {
  it('email 空值放行（選填）', () => {
    const { form, errors, validateForm } = setup()
    fillValidBase(form)
    form.email = ''
    expect(validateForm()).toBe(true)
    expect(errors.email).toBe('')
  })

  it('email 非法格式擋 submit 並填入錯誤訊息', () => {
    const { form, errors, validateForm } = setup()
    fillValidBase(form)
    form.email = 'not-an-email'
    expect(validateForm()).toBe(false)
    expect(errors.email).not.toBe('')
  })

  it('email 合法格式放行', () => {
    const { form, validateForm } = setup()
    fillValidBase(form)
    form.email = 'parent@example.com'
    expect(validateForm()).toBe(true)
  })

  it('email 超過 200 字元擋 submit', () => {
    const { form, validateForm } = setup()
    fillValidBase(form)
    form.email = `${'a'.repeat(195)}@b.com`
    expect(validateForm()).toBe(false)
  })

  it('resetForm 清空 email', () => {
    const { form, resetForm } = setup()
    form.email = 'parent@example.com'
    resetForm()
    expect(form.email).toBe('')
  })
})

// 2026-07-31 稽核：原本的 /^[^@\s]+@[^@\s]+\.[^@\s]+$/ 比後端 email-validator 寬得多，
// 下列 typo 全數放行 → 前端不標紅、直接送出 → 後端 422 把整筆報名打回，而 Email 是
// 「選填」欄位，家長只看到籠統的送出失敗，根本不知道是哪裡錯。
describe('公開報名表單 email 格式收緊', () => {
  function emailError(email: string) {
    const { form, errors, validateForm } = setup()
    fillValidBase(form)
    form.email = email
    validateForm()
    return errors.email
  }

  it.each([
    ['wang@gmail..com', '網域出現連續句點'],
    ['abc@gmail.com.', '結尾多一個句點'],
    ['.abc@gmail.com', 'local part 以句點開頭'],
    ['abc@my_domain.com', '網域含底線'],
    ['abc@-domain.com', '網域段以連字號開頭'],
    ['abc@gmail', '沒有頂級網域'],
  ])('擋下 %s（%s）', (email) => {
    expect(emailError(email)).not.toBe('')
  })

  it.each([
    'wang@gmail.com',
    'wang.ming@gmail.com.tw',
    'wang+activity@my-domain.co',
    'a@b.co',
  ])('放行合法的 %s', (email) => {
    expect(emailError(email)).toBe('')
  })
})
