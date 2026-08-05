/**
 * 四個 HTTP 注入點的 `X-Tenant-Slug` 斷言（frontend-core §2.2、CT-A-05）＋三態遮罩。
 *
 * 注入點（WebSocket 六處**顯式豁免**，見 `src/utils/tenant.ts` 檔頭守則 3）：
 *   (a) `src/api/index.ts` request interceptor
 *   (b) `src/api/index.ts` `_doRefresh()` 的裸 axios.post
 *   (c) `src/parent/api/index.ts` interceptor 與 `_doRefresh()`
 *   (d) `src/utils/auth.ts` `_notifyServerLogout()` 的裸 fetch
 *
 * 灰度不變式（DEV-12）：單租戶模式下四處都**不得**出現這個 header。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MockAdapter from 'axios-mock-adapter'

const TENANT_ENV_KEYS = ['VITE_TENANT_BASE_DOMAIN', 'VITE_TENANT_DOMAIN_MAP', 'VITE_DEV_TENANT_SLUG']

function setEnv(env: Record<string, string | undefined>, hostname: string) {
  for (const key of TENANT_ENV_KEYS) {
    if (env[key] === undefined) delete (import.meta.env as Record<string, unknown>)[key]
    else (import.meta.env as Record<string, unknown>)[key] = env[key]
  }
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname, search: '', hash: '' },
  })
}

beforeEach(() => {
  vi.resetModules()
  sessionStorage.clear()
  localStorage.clear()
})

afterEach(() => {
  for (const key of TENANT_ENV_KEYS) delete (import.meta.env as Record<string, unknown>)[key]
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('(a) 管理端 axios interceptor', () => {
  it('多租戶模式帶 X-Tenant-Slug', async () => {
    setEnv({ VITE_TENANT_BASE_DOMAIN: 'ivy.tw' }, 'yihua.ivy.tw')
    const api = (await import('@/api/index')).default
    const mock = new MockAdapter(api)
    mock.onGet('/ping').reply(200, {})
    const res = await api.get('/ping')
    expect(res.config.headers['X-Tenant-Slug']).toBe('yihua')
  })

  it('單租戶模式完全不加 header', async () => {
    setEnv({}, 'admin.example.com')
    const api = (await import('@/api/index')).default
    const mock = new MockAdapter(api)
    mock.onGet('/ping').reply(200, {})
    const res = await api.get('/ping')
    expect(res.config.headers['X-Tenant-Slug']).toBeUndefined()
  })
})

describe('(b) 管理端 _doRefresh 的裸 axios.post', () => {
  it('帶 header（不經 interceptor，必須自己帶）', async () => {
    setEnv({ VITE_TENANT_BASE_DOMAIN: 'ivy.tw' }, 'yihua.ivy.tw')
    const axios = (await import('axios')).default
    const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} })
    const api = (await import('@/api/index')).default
    const mock = new MockAdapter(api)
    // 401 觸發 refresh；重試也回 401 才會停，避免無窮迴圈
    mock.onGet('/protected').reply(401, {})
    await api.get('/protected').catch(() => {})
    expect(postSpy).toHaveBeenCalled()
    const cfg = postSpy.mock.calls[0][2] as { headers?: Record<string, string> }
    expect(cfg.headers?.['X-Tenant-Slug']).toBe('yihua')
  })
})

describe('(c) 家長端 axios interceptor', () => {
  it('多租戶模式帶 header、單租戶不帶', async () => {
    setEnv({ VITE_TENANT_BASE_DOMAIN: 'ivy.tw' }, 'yihua.ivy.tw')
    const parentApi = (await import('@/parent/api/index')).default
    const mock = new MockAdapter(parentApi)
    mock.onGet('/parent/ping').reply(200, {})
    const res = await parentApi.get('/parent/ping')
    expect(res.config.headers['X-Tenant-Slug']).toBe('yihua')

    vi.resetModules()
    setEnv({}, 'parent.example.com')
    const parentApi2 = (await import('@/parent/api/index')).default
    const mock2 = new MockAdapter(parentApi2)
    mock2.onGet('/parent/ping').reply(200, {})
    const res2 = await parentApi2.get('/parent/ping')
    expect(res2.config.headers['X-Tenant-Slug']).toBeUndefined()
  })
})

describe('(d) _notifyServerLogout 的裸 fetch', () => {
  it('帶 header', async () => {
    setEnv({ VITE_TENANT_BASE_DOMAIN: 'ivy.tw' }, 'yihua.ivy.tw')
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchSpy)
    const { clearAuth } = await import('@/utils/auth')
    await clearAuth({ notifyServer: true })
    expect(fetchSpy).toHaveBeenCalled()
    const init = fetchSpy.mock.calls[0][1] as { headers?: Record<string, string> }
    expect(init.headers?.['X-Tenant-Slug']).toBe('yihua')
    vi.unstubAllGlobals()
  })

  it('單租戶模式不加 header', async () => {
    setEnv({}, 'admin.example.com')
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchSpy)
    const { clearAuth } = await import('@/utils/auth')
    await clearAuth({ notifyServer: true })
    const init = fetchSpy.mock.calls[0][1] as { headers?: Record<string, string> }
    expect(init.headers).toEqual({})
    vi.unstubAllGlobals()
  })
})

describe('三態租戶錯誤 → 全屏遮罩（CT-A-03 / CT-F-01）', () => {
  it.each([
    [404, 'TENANT_NOT_FOUND'],
    [403, 'TENANT_SUSPENDED'],
    [503, 'TENANT_PROVISIONING'],
  ])('status=%s code=%s 掛遮罩並 reject', async (status, code) => {
    setEnv({ VITE_TENANT_BASE_DOMAIN: 'ivy.tw' }, 'yihua.ivy.tw')
    const blocked = await import('@/utils/tenantBlocked')
    const api = (await import('@/api/index')).default
    const mock = new MockAdapter(api)
    mock.onGet('/x').reply(status as number, { detail: { code } })
    await expect(api.get('/x')).rejects.toBeTruthy()
    expect(blocked.isTenantBlocked()).toBe(true)
    blocked._resetTenantBlockedForTests()
  })

  it('一般 404 不觸發遮罩（否則整站被誤擋）', async () => {
    setEnv({ VITE_TENANT_BASE_DOMAIN: 'ivy.tw' }, 'yihua.ivy.tw')
    const blocked = await import('@/utils/tenantBlocked')
    const api = (await import('@/api/index')).default
    const mock = new MockAdapter(api)
    mock.onGet('/x').reply(404, { detail: { code: 'STUDENT_NOT_FOUND', message: '查無學生' } })
    await expect(api.get('/x')).rejects.toBeTruthy()
    expect(blocked.isTenantBlocked()).toBe(false)
  })
})
