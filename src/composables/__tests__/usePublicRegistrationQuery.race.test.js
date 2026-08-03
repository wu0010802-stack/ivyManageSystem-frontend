import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, nextTick, ref } from 'vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
}))

vi.mock('@/api/activityPublic', () => ({
  publicQueryByToken: vi.fn(),
  publicConfirmPromotion: vi.fn(),
  publicDeclinePromotion: vi.fn(),
}))

import {
  publicConfirmPromotion,
  publicQueryByToken,
} from '@/api/activityPublic'
import { usePromotionActions } from '@/composables/usePromotionActions'
import { usePublicRegistrationQuery } from '@/composables/usePublicRegistrationQuery'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function makeResult(id, name) {
  return {
    data: {
      id,
      name,
      birthday: '2020-05-10',
      courses: [],
      supplies: [],
    },
  }
}

// 2026-08-03 起僅剩「查詢碼＋手機」單一模式；下面的 race 測試一律以
// queryForm.token 的變更驅動「換一筆查詢」，取代舊版靠 queryForm.name 驅動。
function setup() {
  const query = usePublicRegistrationQuery({
    refreshAvailability: vi.fn(),
    startPolling: vi.fn(),
  })
  query.queryForm.token = 'TOKEN_FIRST'
  query.queryForm.parent_phone = '0912345678'
  return query
}

describe('usePublicRegistrationQuery 查詢亂序守衛', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('較舊的慢回應最後完成時，不覆寫較新的查詢結果', async () => {
    const first = deferred()
    const second = deferred()
    publicQueryByToken
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const query = setup()

    const firstRun = query.handleQuery()
    query.queryForm.token = 'TOKEN_SECOND'
    const secondRun = query.handleQuery()

    second.resolve(makeResult(2, '第二位幼兒'))
    await secondRun
    expect(query.queryResult.value?.id).toBe(2)

    first.resolve(makeResult(1, '第一位幼兒'))
    await firstRun
    expect(query.queryResult.value?.id).toBe(2)
    expect(query.queryLoading.value).toBe(false)
  })

  it('較舊請求先完成時，不會提前清除最新請求的 loading', async () => {
    const first = deferred()
    const second = deferred()
    publicQueryByToken
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const query = setup()

    const firstRun = query.handleQuery()
    query.queryForm.token = 'TOKEN_SECOND'
    const secondRun = query.handleQuery()

    first.resolve(makeResult(1, '第一位幼兒'))
    await firstRun
    expect(query.queryLoading.value).toBe(true)
    expect(query.queryResult.value).toBeNull()

    second.resolve(makeResult(2, '第二位幼兒'))
    await secondRun
    expect(query.queryResult.value?.id).toBe(2)
    expect(query.queryLoading.value).toBe(false)
  })

  it('較舊請求的遲到錯誤不會蓋掉較新的成功結果', async () => {
    const first = deferred()
    const second = deferred()
    publicQueryByToken
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const query = setup()

    const firstRun = query.handleQuery()
    query.queryForm.token = 'TOKEN_SECOND'
    const secondRun = query.handleQuery()

    second.resolve(makeResult(2, '第二位幼兒'))
    await secondRun
    first.reject({ response: { data: { detail: '舊查詢失敗' } } })
    await firstRun

    expect(query.queryResult.value?.id).toBe(2)
    expect(query.searchError.value).toBe('')
  })

  it('舊報名 mutation 的遲到 refresh 不覆寫較新的查詢結果與憑證', async () => {
    const oldRefresh = deferred()
    const newQuery = deferred()
    publicQueryByToken
      .mockResolvedValueOnce(makeResult(1, '第一位幼兒'))
      .mockImplementationOnce(() => oldRefresh.promise)
      .mockImplementationOnce(() => newQuery.promise)
    publicConfirmPromotion.mockResolvedValueOnce({ data: { message: '已確認' } })

    const query = setup()
    query.queryForm.token = 'token_FIRST'
    await query.handleQuery()

    const actions = usePromotionActions({
      queryResult: query.queryResult,
      activeQueryCredentials: query.activeQueryCredentials,
      activeQueryToken: query.activeQueryToken,
      refetchCurrent: query.refetchCurrent,
      createHydrationGuard: query.createHydrationGuard,
      hydrateResult: query.hydrateResult,
      showToast: vi.fn(),
    })
    const promotionRun = actions.handleConfirmPromotion({
      name: '美術',
      status: 'promoted_pending',
      course_id: 10,
      confirm_deadline: '2026-07-14T00:00:00',
    })
    await vi.waitFor(() => {
      expect(publicQueryByToken).toHaveBeenCalledTimes(2)
    })

    query.queryForm.token = 'token_SECOND'
    const newQueryRun = query.handleQuery()
    newQuery.resolve(makeResult(2, '第二位幼兒'))
    await newQueryRun
    expect(query.queryResult.value?.id).toBe(2)

    oldRefresh.resolve(makeResult(1, '第一位幼兒'))
    await promotionRun

    expect(query.queryResult.value?.id).toBe(2)
    expect(query.activeQueryCredentials.value?.token).toBe('token_SECOND')
  })

  it('請求進行中修改成無效條件時，立即作廢舊請求且不回填舊結果', async () => {
    const first = deferred()
    publicQueryByToken.mockImplementationOnce(() => first.promise)
    const query = setup()

    const firstRun = query.handleQuery()
    expect(query.queryLoading.value).toBe(true)

    query.queryForm.token = ''
    await nextTick()

    expect(query.queryLoading.value).toBe(false)
    first.resolve(makeResult(1, '第一位幼兒'))
    await firstRun
    expect(query.queryResult.value).toBeNull()
  })

  it('查詢 pending 時 scope 卸載，遲到成功不得 hydrate 或啟動名額輪詢', async () => {
    const pending = deferred()
    publicQueryByToken.mockReturnValueOnce(pending.promise)
    const startPolling = vi.fn()
    const refreshAvailability = vi.fn()
    const scope = effectScope()
    let query
    scope.run(() => {
      query = usePublicRegistrationQuery({ refreshAvailability, startPolling })
      query.queryForm.token = 'TOKEN_FIRST'
      query.queryForm.parent_phone = '0912345678'
    })

    const run = query.handleQuery()
    scope.stop()
    pending.resolve(makeResult(1, '第一位幼兒'))
    await run

    expect(query.queryResult.value).toBeNull()
    expect(refreshAvailability).not.toHaveBeenCalled()
    expect(startPolling).not.toHaveBeenCalled()
  })

  it('成功查詢的身分憑證與可編輯搜尋欄分離', async () => {
    publicQueryByToken.mockResolvedValueOnce(makeResult(1, '第一位幼兒'))
    const query = setup()
    query.queryForm.token = 'token_ORIGINAL'

    await query.handleQuery()

    expect(query.activeQueryCredentials.value).toEqual({
      token: 'token_ORIGINAL',
      name: '第一位幼兒',
      birthday: '2020-05-10',
      parent_phone: '0912345678',
    })

    query.queryForm.token = 'token_CHANGED'
    query.queryForm.parent_phone = '0987654321'
    expect(query.activeQueryToken.value).toBe('token_ORIGINAL')
    expect(query.activeQueryCredentials.value?.parent_phone).toBe('0912345678')
  })

  // 生日驗證（birthdayValid / birthdayErrorMsg）已隨三欄查詢整組移除
  // （2026-08-03），原「20 年前同一天在台北上午仍落在合法查詢邊界」與
  // 「瀏覽器時區落後台北時，台北今天仍是合法生日」兩案例已刪除。

  it('候補操作進行中時阻止另一門課同時送出，避免跨課程 mutation 互踩', async () => {
    const mutation = deferred()
    publicConfirmPromotion.mockReturnValue(mutation.promise)
    const queryResult = ref({
      id: 1,
      name: '第一位幼兒',
      birthday: '2020-05-10',
      courses: [],
      supplies: [],
    })
    const credentials = ref({
      token: 'token_FIRST',
      name: '第一位幼兒',
      birthday: '2020-05-10',
      parent_phone: '0912345678',
    })
    const actions = usePromotionActions({
      queryResult,
      activeQueryCredentials: credentials,
      activeQueryToken: computed(() => credentials.value.token),
      refetchCurrent: vi.fn().mockResolvedValue(queryResult.value),
      createHydrationGuard: () => ({
        requestId: 1,
        registrationId: 1,
        credentials: { ...credentials.value },
      }),
      hydrateResult: vi.fn(() => true),
      showToast: vi.fn(),
    })

    const first = actions.handleConfirmPromotion({
      name: '美術',
      status: 'promoted_pending',
      course_id: 10,
      confirm_deadline: '2099-12-31T00:00:00+08:00',
    })
    const second = actions.handleConfirmPromotion({
      name: '足球',
      status: 'promoted_pending',
      course_id: 11,
      confirm_deadline: '2099-12-31T00:00:00+08:00',
    })

    expect(publicConfirmPromotion).toHaveBeenCalledTimes(1)
    mutation.resolve({ data: { message: '已確認' } })
    await Promise.all([first, second])
  })
})
