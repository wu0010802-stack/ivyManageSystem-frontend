import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

// ── API mocks ──────────────────────────────────────────────────────────────
const publicRegister = vi.fn()

vi.mock('@/api/activityPublic', () => ({
  publicRegister: (...a) => publicRegister(...a),
}))

// ── Element Plus mocks ─────────────────────────────────────────────────────
const ElMessageSuccess = vi.fn()
const ElMessageError = vi.fn()

vi.mock('element-plus', () => ({
  ElMessage: {
    success: (...a) => ElMessageSuccess(...a),
    error: (...a) => ElMessageError(...a),
  },
}))

// ────────────────────────────────────────────────────────────────── //

import { usePublicRegistrationForm } from '@/composables/usePublicRegistrationForm'

function makeComposable(overrides = {}) {
  const courses = ref([
    { name: '美術', price: 1000 },
    { name: '舞蹈', price: 1500 },
  ])
  const supplies = ref([
    { name: '畫筆', price: 200 },
    { name: '顏料', price: 300 },
  ])
  const availability = ref({ 美術: 5, 舞蹈: 0, 音樂: -1 })

  return usePublicRegistrationForm({
    courses,
    supplies,
    availability,
    ...overrides,
  })
}

describe('usePublicRegistrationForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    publicRegister.mockResolvedValue({ data: { id: 1 } })
  })

  it('canSubmit 缺少 name 時為 false', () => {
    const { form, canSubmit } = makeComposable()
    form.birthday = '2020-01-01'
    form.class_name = '大班'
    form.selectedCourses = ['美術']

    expect(canSubmit.value).toBeFalsy()
  })

  it('canSubmit 缺少 birthday 時為 false', () => {
    const { form, canSubmit } = makeComposable()
    form.name = '王小明'
    form.class_name = '大班'
    form.selectedCourses = ['美術']

    expect(canSubmit.value).toBeFalsy()
  })

  it('canSubmit 缺少 class_name 時為 false', () => {
    const { form, canSubmit } = makeComposable()
    form.name = '王小明'
    form.birthday = '2020-01-01'
    form.selectedCourses = ['美術']

    expect(canSubmit.value).toBeFalsy()
  })

  it('canSubmit 缺少 selectedCourses 時為 false', () => {
    const { form, canSubmit } = makeComposable()
    form.name = '王小明'
    form.birthday = '2020-01-01'
    form.class_name = '大班'

    expect(canSubmit.value).toBe(false)
  })

  it('canSubmit 所有欄位填好時為 true', () => {
    const { form, canSubmit } = makeComposable()
    form.name = '王小明'
    form.birthday = '2020-01-01'
    form.parent_phone = '0912345678'
    form.class_name = '大班'
    form.selectedCourses = ['美術']

    expect(canSubmit.value).toBe(true)
  })

  it('canSubmit 電話格式錯誤時為 false', () => {
    const { form, canSubmit } = makeComposable()
    form.name = '王小明'
    form.birthday = '2020-01-01'
    form.parent_phone = '123'  // 非 09 開頭 10 碼
    form.class_name = '大班'
    form.selectedCourses = ['美術']

    expect(canSubmit.value).toBe(false)
  })

  it('totalCost 計算課程 + 用品費用', () => {
    const { form, totalCost } = makeComposable()
    form.selectedCourses = ['美術', '舞蹈']
    form.selectedSupplies = ['畫筆']

    // 1000 + 1500 + 200 = 2700
    expect(totalCost.value).toBe(2700)
  })

  it('toggleCourse availability<0 時不加入', () => {
    const { form, toggleCourse } = makeComposable()
    toggleCourse({ name: '音樂' })

    expect(form.selectedCourses).not.toContain('音樂')
  })

  it('handleSubmit 成功後呼叫 onSuccess callback', async () => {
    const { form, handleSubmit } = makeComposable()
    form.name = '王小明'
    form.birthday = '2020-01-01'
    form.class_name = '大班'
    form.selectedCourses = ['美術']

    const onSuccess = vi.fn()
    await handleSubmit(onSuccess)

    expect(onSuccess).toHaveBeenCalledOnce()
  })
})
