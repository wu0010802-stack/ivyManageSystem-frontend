import { computed, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/activityPublic', () => ({
  publicUpdateRegistration: vi.fn(),
}))

import { publicUpdateRegistration } from '@/api/activityPublic'
import { useRegistrationEditSave } from '@/composables/useRegistrationEditSave'

// F5：報名時段守衛疊加進 useRegistrationEditSave 的 saveBlocked / handleSaveChanges。
// 兩個新參數（isRegistrationOpen / timeInfo）皆為可選，預設 fail-open，
// 這裡專門驗證「有接線」時的鎖定行為。

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
  const queryForm = reactive({
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
    hydrateResult: vi.fn(() => true),
    refetchCurrent: vi.fn(),
    showToast,
    ...overrides,
  })
  return { actions, showToast, queryResult }
}

describe('useRegistrationEditSave — 報名時段守衛（F5）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('isRegistrationOpen=false 時 saveBlocked 為 true', () => {
    const { actions } = buildDeps({
      isRegistrationOpen: computed(() => false),
    })
    expect(actions.saveBlocked.value).toBe(true)
  })

  it('isRegistrationOpen 未傳（預設）不影響 saveBlocked（既有行為不變）', () => {
    const { actions } = buildDeps()
    expect(actions.saveBlocked.value).toBe(false)
  })

  it('timeInfo 顯示已截止，但 isRegistrationOpen 尚未反映（reactive tick 落後）時，' +
    'handleSaveChanges 以真實 Date.now() 二次確認並擋下送出，不呼叫更新 API', async () => {
    // isRegistrationOpen 刻意仍為 true（模擬 30s tick 還沒更新畫面），
    // 但 timeInfo.close_at 已是過去時間——handleSaveChanges 應該用 Date.now() 攔下。
    const timeInfo = ref({ is_open: true, open_at: null, close_at: '2000-01-01T00:00:00Z' })
    const { actions, showToast } = buildDeps({
      isRegistrationOpen: computed(() => true),
      timeInfo,
    })

    await actions.handleSaveChanges()

    expect(publicUpdateRegistration).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith(
      '報名時段已變更（可能已截止），請重新查詢以確認目前狀態。',
      'warning',
      6000,
    )
  })

  it('timeInfo 顯示仍開放時，handleSaveChanges 正常送出（回歸）', async () => {
    const timeInfo = ref({ is_open: true, open_at: null, close_at: '2999-01-01T00:00:00Z' })
    publicUpdateRegistration.mockResolvedValue({
      data: {
        id: 1,
        name: '第一位幼兒',
        birthday: '2020-05-10',
        class_name: '大象班',
        courses: [{ name: '圍棋', status: 'enrolled', price: 1000 }],
        supplies: [],
        total_amount: 1000,
        paid_amount: 0,
      },
    })
    const { actions } = buildDeps({
      isRegistrationOpen: computed(() => true),
      timeInfo,
    })

    await actions.handleSaveChanges()

    expect(publicUpdateRegistration).toHaveBeenCalledTimes(1)
  })

  it('timeInfo 未傳時（呼叫端未接線）不做二次確認，維持既有行為', async () => {
    publicUpdateRegistration.mockResolvedValue({
      data: {
        id: 1,
        name: '第一位幼兒',
        birthday: '2020-05-10',
        class_name: '大象班',
        courses: [{ name: '圍棋', status: 'enrolled', price: 1000 }],
        supplies: [],
        total_amount: 1000,
        paid_amount: 0,
      },
    })
    const { actions } = buildDeps()

    await actions.handleSaveChanges()

    expect(publicUpdateRegistration).toHaveBeenCalledTimes(1)
  })
})
