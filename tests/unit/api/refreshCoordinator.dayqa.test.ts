/**
 * 「園方的一天」實機走查 F3（2026-11-02）：老師處理接送時被踢回登入頁。
 *
 * 實測時序（隔離環境）：access token 到期 → 同一分頁同時發出兩支 /auth/refresh——
 * router guard／useIdleTimeout 走 `refreshSession()`（api/auth.ts 自有 inflight），
 * axios 401 攔截器走 `_doRefresh()`（api/index.ts 另一個 inflight）。後到的那支拿到
 * 409（rotation in progress），攔截器把 409 當成功「立刻」重打原請求，但勝出那支的
 * Set-Cookie 還沒回來（3 秒後才 200）→ 帶舊 cookie 再 401 → `_redirectToLogin()`。
 *
 * 修法：兩條路徑共用同一個 in-flight（refreshCoordinator）；真的收到 409（跨分頁）時
 * 先等勝出方落地再重打。
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import axios from 'axios'

import api, { buildRefreshUrl, REFRESH_CONFLICT_SETTLE_MS } from '@/api/index'
import { refreshSession } from '@/api/auth'

describe('staff refresh 單一 in-flight（day-qa F3）', () => {
  let mockApi: MockAdapter
  let mockGlobal: MockAdapter

  beforeEach(() => {
    mockApi = new MockAdapter(api, { delayResponse: 50 })
    mockGlobal = new MockAdapter(axios, { delayResponse: 50 })
  })

  afterEach(() => {
    mockApi.restore()
    mockGlobal.restore()
  })

  it('router guard 的 refreshSession 與 401 攔截器同時刷新時只打一次 /auth/refresh', async () => {
    // refresh 比 401 慢（實測勝出那支 refresh 6–7 秒才回）：401 攔截器啟動時 router guard 的
    // refresh 仍在飛，必須加入而不是另打一支
    const slowRefresh = () =>
      new Promise<[number, unknown]>((resolve) =>
        setTimeout(() => resolve([200, { user: { id: 1, role: 'teacher' } }]), 300),
      )
    mockApi.onPost('/auth/refresh').reply(slowRefresh)
    mockGlobal.onPost(buildRefreshUrl()).reply(slowRefresh)
    mockApi.onGet('/portal/dismissal-calls').replyOnce(401)
    mockApi.onGet('/portal/dismissal-calls').replyOnce(200, { items: [] })

    const [guard, call] = await Promise.all([
      refreshSession(),
      api.get('/portal/dismissal-calls'),
    ])

    expect(guard.data.user).toEqual({ id: 1, role: 'teacher' })
    expect(call.data).toEqual({ items: [] })
    const refreshCalls = mockApi.history.post.filter((r) => r.url?.includes('/auth/refresh')).length
      + mockGlobal.history.post.filter((r) => r.url?.includes('/auth/refresh')).length
    expect(refreshCalls).toBe(1)
  })

  it('refresh 回 409（他分頁勝出）時，等勝出方落地後才重打原請求', async () => {
    mockGlobal.onPost(buildRefreshUrl()).replyOnce(409, { detail: 'rotation in progress' })
    mockApi.onGet('/portal/home/summary').replyOnce(401)
    let retriedAt = 0
    mockApi.onGet('/portal/home/summary').replyOnce(() => {
      retriedAt = Date.now()
      return [200, { ok: true }]
    })

    const started = Date.now()
    const resp = await api.get('/portal/home/summary')

    expect(resp.data).toEqual({ ok: true })
    expect(REFRESH_CONFLICT_SETTLE_MS).toBeGreaterThanOrEqual(800)
    expect(retriedAt - started).toBeGreaterThanOrEqual(REFRESH_CONFLICT_SETTLE_MS)
  })
})
