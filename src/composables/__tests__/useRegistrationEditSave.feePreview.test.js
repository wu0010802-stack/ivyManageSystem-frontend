import { computed, reactive, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/api/activityPublic', () => ({
  publicUpdateRegistration: vi.fn(),
}))

import { useRegistrationEditSave } from '@/composables/useRegistrationEditSave'

// feePreview 只依賴 queryResult / editForm / availability / courses / supplies，
// 其餘 mutation 相關參數給最小可用值即可。
function setup({
  queryResult,
  selectedCourses,
  selectedSupplies = [],
  availability,
  courses = [],
  supplies = [],
}) {
  const creds = ref({
    mode: 'token',
    token: 't',
    name: queryResult.name,
    birthday: queryResult.birthday,
    parent_phone: '0912345678',
  })
  const editForm = reactive({
    class_name: queryResult.class_name || '象班',
    selectedCourses: [...selectedCourses],
    selectedSupplies: [...selectedSupplies],
    new_parent_phone: '',
    new_name: queryResult.name || '幼兒',
    new_birthday: queryResult.birthday || '2020-01-01',
  })
  return useRegistrationEditSave({
    editForm,
    queryResult: ref(queryResult),
    queryForm: reactive({
      token: 't',
      name: queryResult.name,
      birthday: queryResult.birthday,
      parent_phone: '0912345678',
    }),
    activeQueryCredentials: creds,
    activeQueryToken: computed(() => creds.value.token),
    courses: ref(courses),
    supplies: ref(supplies),
    availability: ref(availability),
    createHydrationGuard: () => ({
      requestId: 1,
      registrationId: queryResult.id,
      credentials: { ...creds.value },
    }),
    hydrateResult: vi.fn(() => true),
    refetchCurrent: vi.fn(),
    showToast: vi.fn(),
  })
}

describe('useRegistrationEditSave feePreview — 待審核報名不虛報課程費用', () => {
  it('待審核報名（identity_editable）既有課程即使有名額也不計費，避免零改動虛報需補繳', () => {
    const actions = setup({
      queryResult: {
        id: 1,
        name: '幼兒',
        birthday: '2020-01-01',
        class_name: '象班',
        total_amount: 0, // 後端對 pending_review 報名課程部分不計價
        paid_amount: 0,
        courses: [{ name: '鋼琴', status: 'pending_review', price: 1200 }],
        supplies: [],
        field_state: { identity_editable: true },
      },
      selectedCourses: ['鋼琴'],
      availability: { 鋼琴: 5 }, // 有名額 → 修前會被 estimateCourseStatus 估成 enrolled
      courses: [{ name: '鋼琴', price: 1200 }],
    })
    const fp = actions.feePreview.value
    expect(fp.newTotal).toBe(0)
    expect(fp.additionalDue).toBe(0)
    expect(fp.hasChange).toBe(false)
  })

  it('待審核報名新增課程仍不計費（後端對 pending_review 報名的新課亦為 pending_review）', () => {
    const actions = setup({
      queryResult: {
        id: 2,
        name: '幼兒',
        birthday: '2020-01-01',
        total_amount: 0,
        paid_amount: 0,
        courses: [{ name: '鋼琴', status: 'pending_review', price: 1200 }],
        supplies: [],
        field_state: { identity_editable: true },
      },
      selectedCourses: ['鋼琴', '足球'],
      availability: { 鋼琴: 5, 足球: 3 },
      courses: [
        { name: '鋼琴', price: 1200 },
        { name: '足球', price: 800 },
      ],
    })
    expect(actions.feePreview.value.newTotal).toBe(0)
  })

  it('待審核報名的用品照後端仍計費（用品與課程審核狀態無關）', () => {
    const actions = setup({
      queryResult: {
        id: 4,
        name: '幼兒',
        birthday: '2020-01-01',
        total_amount: 500, // 後端 total = 用品 500（課程 pending 不計）
        paid_amount: 0,
        courses: [{ name: '鋼琴', status: 'pending_review', price: 1200 }],
        supplies: [{ name: '教材', price: 500 }],
        field_state: { identity_editable: true },
      },
      selectedCourses: ['鋼琴'],
      selectedSupplies: ['教材'],
      availability: { 鋼琴: 5 },
      courses: [{ name: '鋼琴', price: 1200 }],
      supplies: [{ name: '教材', price: 500 }],
    })
    // 課程 0 + 用品 500 = 500，與後端 total_amount 一致 → 無虛報補繳
    expect(actions.feePreview.value.newTotal).toBe(500)
    expect(actions.feePreview.value.additionalDue).toBe(500)
  })

  it('已審核（enrolled）報名照常計費 — 不受本修正影響', () => {
    const actions = setup({
      queryResult: {
        id: 3,
        name: '幼兒',
        birthday: '2020-01-01',
        total_amount: 1200,
        paid_amount: 0,
        courses: [{ name: '鋼琴', status: 'enrolled', price: 1200 }],
        supplies: [],
        field_state: { identity_editable: false },
      },
      selectedCourses: ['鋼琴'],
      availability: { 鋼琴: 5 },
      courses: [{ name: '鋼琴', price: 1200 }],
    })
    expect(actions.feePreview.value.newTotal).toBe(1200)
  })
})
