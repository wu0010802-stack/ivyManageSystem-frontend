import { computed, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/activityPublic', () => ({
  publicUpdateRegistration: vi.fn(),
}))

import { publicUpdateRegistration } from '@/api/activityPublic'
import { useRegistrationEditSave } from '@/composables/useRegistrationEditSave'

function deferred() {
  let resolve
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('useRegistrationEditSave 查詢碼輪替競態', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('舊報名回應因 guard 過期時，仍保留換手機後的新查詢碼供使用者保存', async () => {
    const update = deferred()
    publicUpdateRegistration.mockImplementationOnce(() => update.promise)

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
      token: 'token_OLD',
      name: '第一位幼兒',
      birthday: '2020-05-10',
      parent_phone: '0912345678',
    })
    const queryForm = reactive({
      token: 'token_OLD',
      birthday: '2020-05-10',
      parent_phone: '0912345678',
    })
    const editForm = reactive({
      class_name: '大象班',
      selectedCourses: ['圍棋'],
      selectedSupplies: [],
      new_parent_phone: '0987654321',
    })
    const actions = useRegistrationEditSave({
      editForm,
      queryResult,
      queryForm,
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
      hydrateResult: vi.fn(() => false),
      refetchCurrent: vi.fn(),
      showToast: vi.fn(),
    })

    const save = actions.handleSaveChanges()
    await vi.waitFor(() => expect(publicUpdateRegistration).toHaveBeenCalledOnce())
    update.resolve({
      data: {
        ...queryResult.value,
        parent_phone: '0987654321',
        rotated_query_token: 'token_ROTATED',
      },
    })
    await save

    expect(actions.rotatedCredentialRecovery.value).toEqual({
      registrationId: 1,
      token: 'token_ROTATED',
      parentPhone: '0987654321',
    })
    expect(queryForm.token).toBe('token_OLD')
  })
})
