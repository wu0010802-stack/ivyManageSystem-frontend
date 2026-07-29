import { computed, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/activityPublic', () => ({
  publicUpdateRegistration: vi.fn(),
}))

import { publicUpdateRegistration } from '@/api/activityPublic'
import { useRegistrationEditSave } from '@/composables/useRegistrationEditSave'

function buildDeps(overrides = {}) {
  const queryResult = ref({
    id: 1,
    name: '第一位幼兒',
    birthday: '2020-05-10',
    class_name: '大象班',
    total_amount: 1000,
    paid_amount: 0,
    courses: [{ name: '圍棋', status: 'enrolled', price: 1000 }],
    supplies: [],
  })
  const activeQueryCredentials = ref({
    mode: 'token',
    token: 'token_ABC',
    name: '第一位幼兒',
    birthday: '2020-05-10',
    parent_phone: '0912345678',
  })
  const editForm = reactive({
    class_name: '大象班',
    selectedCourses: ['圍棋'],
    selectedSupplies: [],
    new_parent_phone: '',
    new_name: '第一位幼兒',
    new_birthday: '2020-05-10',
  })
  const showToast = vi.fn()
  const actions = useRegistrationEditSave({
    editForm,
    queryResult,
    queryForm: reactive({
      token: 'token_ABC',
      name: '第一位幼兒',
      birthday: '2020-05-10',
      parent_phone: '0912345678',
    }),
    activeQueryCredentials,
    activeQueryToken: computed(() => activeQueryCredentials.value?.token ?? null),
    courses: ref([{ name: '圍棋', price: 1000 }]),
    supplies: ref([]),
    availability: ref({ 圍棋: 1 }),
    createHydrationGuard: () => ({
      requestId: 1,
      registrationId: 1,
      credentials: { ...activeQueryCredentials.value },
    }),
    hydrateResult: vi.fn(() => true),
    refetchCurrent: vi.fn(),
    showToast,
    ...overrides,
  })
  return { actions, showToast }
}

describe('useRegistrationEditSave 報名時段守衛', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('報名已關閉時 saveBlocked=true', () => {
    const { actions } = buildDeps({
      isRegistrationOpen: computed(() => false),
    })
    expect(actions.saveBlocked.value).toBe(true)
  })

  it('畫面 tick 尚未更新但實際已截止時，儲存前以真實時間二次攔截', async () => {
    const { actions, showToast } = buildDeps({
      isRegistrationOpen: computed(() => true),
      timeInfo: ref({
        is_open: true,
        open_at: null,
        close_at: '2000-01-01T00:00:00Z',
      }),
    })

    await actions.handleSaveChanges()

    expect(publicUpdateRegistration).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith(
      '報名時段已變更（可能已截止），請重新查詢以確認目前狀態。',
      'warning',
      6000,
    )
  })
})
