import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
}))

vi.mock('@/api/activityPublic', () => ({
  publicQueryRegistration: vi.fn(),
  publicQueryByToken: vi.fn(),
}))

import { publicQueryByToken, publicQueryRegistration } from '@/api/activityPublic'
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

function setup() {
  const query = usePublicRegistrationQuery({
    refreshAvailability: vi.fn(),
    startPolling: vi.fn(),
  })
  query.queryForm.name = '第一位幼兒'
  query.queryForm.birthday = '2020-05-10'
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
    publicQueryRegistration
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const query = setup()

    const firstRun = query.handleQuery()
    query.queryForm.name = '第二位幼兒'
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
    publicQueryRegistration
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const query = setup()

    const firstRun = query.handleQuery()
    query.queryForm.name = '第二位幼兒'
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
    publicQueryRegistration
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const query = setup()

    const firstRun = query.handleQuery()
    query.queryForm.name = '第二位幼兒'
    const secondRun = query.handleQuery()

    second.resolve(makeResult(2, '第二位幼兒'))
    await secondRun
    first.reject({ response: { data: { detail: '舊查詢失敗' } } })
    await firstRun

    expect(query.queryResult.value?.id).toBe(2)
    expect(query.searchError.value).toBe('')
  })

  it('請求進行中修改成無效條件時，立即作廢舊請求且不回填舊結果', async () => {
    const first = deferred()
    publicQueryRegistration.mockImplementationOnce(() => first.promise)
    const query = setup()

    const firstRun = query.handleQuery()
    expect(query.queryLoading.value).toBe(true)

    query.queryForm.name = ''
    await nextTick()

    expect(query.queryLoading.value).toBe(false)
    first.resolve(makeResult(1, '第一位幼兒'))
    await firstRun
    expect(query.queryResult.value).toBeNull()
  })

  it('成功查詢的身分憑證與可編輯搜尋欄分離', async () => {
    publicQueryByToken.mockResolvedValueOnce(makeResult(1, '第一位幼兒'))
    const query = setup()
    query.queryMode.value = 'token'
    query.queryForm.token = 'token_ORIGINAL'

    await query.handleQuery()

    expect(query.activeQueryCredentials.value).toEqual({
      mode: 'token',
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

  it('20 年前同一天在台北上午仍落在合法查詢邊界', () => {
    const originalTZ = process.env.TZ
    process.env.TZ = 'Asia/Taipei'
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 13, 9, 30))
    try {
      const query = setup()
      query.queryForm.birthday = '2006-07-13'

      expect(query.birthdayValid.value).toBe(true)
      expect(query.birthdayErrorMsg.value).not.toContain('超出')
    } finally {
      vi.useRealTimers()
      process.env.TZ = originalTZ
    }
  })
})
