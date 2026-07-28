/**
 * Token 併發刷新的 409 被當成登入失效，老師使用中被踢回登入頁（bug-hunt 2026-07-27）。
 *
 * 後端 services/staff_refresh.py 在 5 秒 race 視窗內對同一個 refresh token 的第二次
 * 請求回 409「rotation in progress, please retry」——這表示另一條路徑已經刷新成功、
 * session 仍有效，前端應該重打原請求。
 *
 * 但 src/api/index.ts 的 _doRefresh() 沒有 409 特判，任何 rejection 都落進攔截器的
 * catch → clearAuth + 導向 /portal/login。老師（尤其平板／手機 PWA 切回前景時，
 * router guard / useIdleTimeout / axios 攔截器三條路會同時發 refresh）就會突然被
 * 丟回登入頁，重新登入後一切正常，未存的表單內容則已遺失。
 *
 * 同一個 409 在 src/router/index.ts:738-753 與 src/parent/api/index.ts:100-104 都已
 * 正確處理成「session 仍有效」——這次重構只修了一半。本檔比照家長端
 * tests/unit/parent/api.refresh.test.js 的既有案例。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import axios from 'axios'

import api, { buildRefreshUrl } from '@/api/index'

describe('staff api refresh interceptor — 併發刷新的 409', () => {
  let mockApi: MockAdapter
  let mockGlobal: MockAdapter

  beforeEach(() => {
    mockApi = new MockAdapter(api)
    // refresh 走全域 axios，不是 api 實例
    mockGlobal = new MockAdapter(axios)
  })

  afterEach(() => {
    mockApi.restore()
    mockGlobal.restore()
    vi.restoreAllMocks()
  })

  it('refresh 回 409（rotation in progress）時重打原請求，不得登出', async () => {
    mockApi.onGet('/portal/home/summary').replyOnce(401)
    mockGlobal.onPost(buildRefreshUrl()).replyOnce(409, {
      detail: 'rotation in progress, please retry',
    })
    mockApi.onGet('/portal/home/summary').replyOnce(200, { ok: true })

    const resp = await api.get('/portal/home/summary')

    expect(resp.data).toEqual({ ok: true })
  })

  it('refresh 真的失效（401）時仍應往外拋，不可誤判為仍有效', async () => {
    mockApi.onGet('/portal/home/summary').replyOnce(401)
    mockGlobal.onPost(buildRefreshUrl()).replyOnce(401, { detail: 'refresh token 已過期' })

    await expect(api.get('/portal/home/summary')).rejects.toBeTruthy()
  })
})
