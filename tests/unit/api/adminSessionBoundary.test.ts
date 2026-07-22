import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'
import api from '@/api/index'
import { clearAuth, getUserInfo, setUserInfo } from '@/utils/auth'

describe('admin API session boundary', () => {
  let mockApi: MockAdapter
  let mockGlobal: MockAdapter

  beforeEach(() => {
    mockApi = new MockAdapter(api)
    mockGlobal = new MockAdapter(axios)
    clearAuth({ notifyServer: false })
    window.location.hash = '#/'
  })

  afterEach(() => {
    mockApi.restore()
    mockGlobal.restore()
  })

  it('舊 session refresh 晚到時不得復活舊 userInfo 或導向登入', async () => {
    setUserInfo({ id: 'A', role: 'admin' })
    let resolveRefresh: ((value: [number, unknown]) => void) | undefined
    mockApi.onGet('/slow-private').replyOnce(401)
    mockGlobal.onPost('/api/auth/refresh').replyOnce(
      () => new Promise((resolve) => { resolveRefresh = resolve }),
    )

    const staleRequest = api.get('/slow-private')
    await vi.waitFor(() => expect(resolveRefresh).toBeTypeOf('function'))

    clearAuth({ notifyServer: false })
    setUserInfo({ id: 'B', role: 'admin' })
    resolveRefresh?.([200, { user: { id: 'A', role: 'admin' } }])

    await expect(staleRequest).rejects.toBeTruthy()
    expect(getUserInfo()).toMatchObject({ id: 'B' })
    expect(window.location.hash).toBe('#/')
  })

  it('切換 session 後同 key 請求不會共用前一位使用者的 inflight promise', async () => {
    const pending: Array<{
      config: Record<string, unknown>
      resolve: (value: [number, unknown]) => void
    }> = []
    mockApi.onGet('/private-summary').reply((config) => new Promise((resolve) => {
      pending.push({ config, resolve })
    }))

    const oldRequest = api.get('/private-summary')
    await vi.waitFor(() => expect(pending).toHaveLength(1))

    clearAuth({ notifyServer: false })
    const currentRequest = api.get('/private-summary')
    await vi.waitFor(() => expect(pending).toHaveLength(2))

    pending[0].resolve([200, { owner: 'A' }])
    await expect(oldRequest).rejects.toBeTruthy()

    pending[1].resolve([200, { owner: 'B' }])
    await expect(currentRequest).resolves.toMatchObject({ data: { owner: 'B' } })
  })
})
