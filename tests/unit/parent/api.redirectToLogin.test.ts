/**
 * 家長端 axios 攔截器 — refresh 失敗導回登入頁時保存原始目的地（深連結保存）。
 *
 * 沿用 api.killswitch.test.ts 的 mock 手法：`@/parent/router` 整支 mock 成
 * 可控的 `currentRoute` + `replace` spy。`_redirectToLogin()` 走的是
 * `window.location.hash` 而非 `router.replace()`（見 api/index.ts 註解：
 * 這裡要的是「回登入頁」而非單純 SPA 導覽），所以斷言對象是 location.hash。
 *
 * `_doRefresh()` 內部用的是全域 `axios`（非 `api` instance），因此除了
 * `MockAdapter(api)` 攔原始請求，還需要 `MockAdapter(axios)` 攔 refresh
 * 這支 POST，兩者缺一都無法讓 401 → refresh 失敗 → _redirectToLogin 這條
 * 路徑真的被走到。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'
import { createPinia, setActivePinia } from 'pinia'

const { currentRoute } = vi.hoisted(() => ({
  currentRoute: { value: { path: '/home', fullPath: '/home' } },
}))

vi.mock('@/parent/router', () => ({
  default: {
    replace: vi.fn(),
    currentRoute,
  },
}))

import api, { buildParentRefreshUrl } from '@/parent/api/index'

describe('parent axios interceptor — refresh 失敗導回 /login 時保存原始目的地', () => {
  let apiMock: MockAdapter
  let globalMock: MockAdapter

  beforeEach(() => {
    setActivePinia(createPinia())
    apiMock = new MockAdapter(api)
    globalMock = new MockAdapter(axios)
    window.location.hash = ''
    currentRoute.value = { path: '/home', fullPath: '/home' }
  })

  afterEach(() => {
    apiMock.restore()
    globalMock.restore()
  })

  it('在 /fees 頁遇到 401 且 refresh 失敗 → hash 帶上 redirect=/fees', async () => {
    currentRoute.value = { path: '/fees', fullPath: '/fees' }
    apiMock.onGet('/parent/fees/summary').reply(401)
    globalMock.onPost(buildParentRefreshUrl()).reply(401)

    await api.get('/parent/fees/summary').catch(() => {})

    expect(window.location.hash).toBe('#/login?redirect=%2Ffees')
  })

  it('已經在 /login 頁時不需帶 redirect（避免自我循環）', async () => {
    currentRoute.value = { path: '/login', fullPath: '/login' }
    apiMock.onGet('/parent/me/consents').reply(401)
    globalMock.onPost(buildParentRefreshUrl()).reply(401)

    await api.get('/parent/me/consents').catch(() => {})

    expect(window.location.hash).toBe('#/login')
  })
})
