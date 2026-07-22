import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import axios from 'axios'

const { clearParentLocalStateMock } = vi.hoisted(() => ({
  clearParentLocalStateMock: vi.fn(),
}))

vi.mock('@/parent/composables/useParentLogout', () => ({
  clearParentLocalState: clearParentLocalStateMock,
}))

// 注意：此 test 攔截 api 模組頂部 axios 實例 + 全域 axios（refresh 用全域）
import api, {
  buildParentRefreshUrl,
  PARENT_API_BASE,
  resetParentApiSessionState,
} from '@/parent/api/index'

describe('parent api refresh interceptor', () => {
  let mockApi
  let mockGlobal

  beforeEach(() => {
    clearParentLocalStateMock.mockReset()
    resetParentApiSessionState()
    window.location.hash = '#/home'
    mockApi = new MockAdapter(api)
    mockGlobal = new MockAdapter(axios)
  })

  it('refresh URL 與 parent api instance 共用 VITE_API_BASE_URL', () => {
    expect(buildParentRefreshUrl()).toBe(`${PARENT_API_BASE}/parent/auth/refresh`)
    expect(buildParentRefreshUrl('/backend-api')).toBe('/backend-api/parent/auth/refresh')
  })

  afterEach(() => {
    mockApi.restore()
    mockGlobal.restore()
  })

  it('retries original request once after refresh succeeds', async () => {
    // 第一次 401 → refresh 200 → 原請求 200
    mockApi.onGet('/some-endpoint').replyOnce(401)
    mockGlobal.onPost('/api/parent/auth/refresh').replyOnce(200, { ok: true })
    mockApi.onGet('/some-endpoint').replyOnce(200, { hello: 'world' })

    const resp = await api.get('/some-endpoint')
    expect(resp.data).toEqual({ hello: 'world' })
  })

  it('retries original request once on 409 RACE response from refresh', async () => {
    // 401 → refresh 409 → 預期原請求被重打一次（cookie 已被 first refresh 寫入）
    mockApi.onGet('/some-endpoint').replyOnce(401)
    mockGlobal.onPost('/api/parent/auth/refresh').replyOnce(409, {
      detail: 'rotation in progress, please retry',
    })
    mockApi.onGet('/some-endpoint').replyOnce(200, { ok: true })

    const resp = await api.get('/some-endpoint')
    expect(resp.data).toEqual({ ok: true })
  })

  it('does not loop refresh when /parent/auth/refresh itself returns 401', async () => {
    // refresh 屬於 isAuthEndpoint 白名單；自己 401 應直接 reject、不再 refresh
    let globalRefreshCalls = 0
    mockGlobal.onPost('/api/parent/auth/refresh').reply(() => {
      globalRefreshCalls += 1
      return [200]
    })
    // 透過 api 實例打到 /parent/auth/refresh（baseURL /api 會合成 /api/parent/auth/refresh）
    mockApi.onPost('/parent/auth/refresh').replyOnce(401)

    await expect(
      api.post('/parent/auth/refresh'),
    ).rejects.toMatchObject({ response: { status: 401 } })

    // global axios 上的 _doRefresh 一次都不應被呼叫
    expect(globalRefreshCalls).toBe(0)
  })

  it('refresh 過期時先走共用本地 session cleanup 再導向登入', async () => {
    mockApi.onGet('/expired').replyOnce(401)
    mockGlobal.onPost('/api/parent/auth/refresh').replyOnce(401)

    await expect(api.get('/expired')).rejects.toMatchObject({ response: { status: 401 } })

    expect(clearParentLocalStateMock).toHaveBeenCalledTimes(1)
    expect(window.location.hash).toBe('#/login')
  })

  it('session reset 後拒絕舊身分晚到的成功回應', async () => {
    let resolveOld
    mockApi.onGet('/slow-private').replyOnce(
      () => new Promise((resolve) => { resolveOld = resolve }),
    )

    const staleRequest = api.get('/slow-private')
    await vi.waitFor(() => expect(resolveOld).toBeTypeOf('function'))

    resetParentApiSessionState()
    resolveOld([200, { owner: '家長甲' }])

    await expect(staleRequest).rejects.toMatchObject({ code: 'ERR_CANCELED' })
  })

  it('登出發生在 refresh 途中時不得以新身分重送舊請求或導向登入', async () => {
    let resolveRefresh
    mockApi.onGet('/refresh-race').replyOnce(401)
    mockGlobal.onPost('/api/parent/auth/refresh').replyOnce(
      () => new Promise((resolve) => { resolveRefresh = resolve }),
    )

    const staleRequest = api.get('/refresh-race')
    await vi.waitFor(() => expect(resolveRefresh).toBeTypeOf('function'))

    resetParentApiSessionState()
    resolveRefresh([200, {}])

    await expect(staleRequest).rejects.toBeTruthy()
    expect(mockApi.history.get.filter((r) => r.url === '/refresh-race')).toHaveLength(1)
    expect(clearParentLocalStateMock).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('#/home')
  })

  it('refresh 過期會等待個人化 CacheStorage 清理完成才導向登入', async () => {
    let releaseCleanup
    clearParentLocalStateMock.mockReturnValueOnce(
      new Promise((resolve) => { releaseCleanup = resolve }),
    )
    mockApi.onGet('/expired-cleanup').replyOnce(401)
    mockGlobal.onPost('/api/parent/auth/refresh').replyOnce(401)

    const request = api.get('/expired-cleanup')
    await vi.waitFor(() => expect(clearParentLocalStateMock).toHaveBeenCalledTimes(1))
    expect(window.location.hash).toBe('#/home')

    releaseCleanup()
    await expect(request).rejects.toBeTruthy()
    expect(window.location.hash).toBe('#/login')
  })
})
