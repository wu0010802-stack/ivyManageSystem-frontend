import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import axios from 'axios'

// 注意：此 test 攔截 api 模組頂部 axios 實例 + 全域 axios（refresh 用全域）
import api from '@/parent/api/index'

describe('parent api refresh interceptor', () => {
  let mockApi
  let mockGlobal

  beforeEach(() => {
    mockApi = new MockAdapter(api)
    mockGlobal = new MockAdapter(axios)
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
})
