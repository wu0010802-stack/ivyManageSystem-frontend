import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchTenantMeta,
  isTenantMetaEnabled,
  TENANT_META_DISABLED,
  TenantMetaError,
  _resetTenantMetaCacheForTests,
} from '@/api/tenantMeta'
import { _resetTenantCacheForTests } from '@/utils/tenant'

/**
 * `tenantMeta.ts` 的三個不可退讓性質（CT-F-05 / CT-F-01 / fb §2.2）：
 *   1. 裸 fetch、匿名（`credentials: 'omit'`）、路徑固定不吃 VITE_API_BASE_URL
 *   2. 單一 in-flight promise 去重，但 **rejection 不快取**（否則 LIFF 重試永遠失敗）
 *   3. 灰度未開時完全不發網路請求（灰度不變式）
 */
const ORIGINAL_ENV = { ...import.meta.env }

/**
 * ⚠ vitest 的 `import.meta.env` 是 `process.env` 的 proxy：指派 `undefined` 會被
 * 字串化成 `'undefined'`（truthy！）。表示「未設定」一律用空字串。
 */
function setEnv(patch: Record<string, string>) {
  Object.assign(import.meta.env, patch)
}

beforeEach(() => {
  _resetTenantMetaCacheForTests()
  _resetTenantCacheForTests()
  setEnv({ VITE_TENANT_META_ENABLED: '1', VITE_TENANT_BASE_DOMAIN: '', VITE_TENANT_DOMAIN_MAP: '' })
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.assign(import.meta.env, ORIGINAL_ENV)
  _resetTenantMetaCacheForTests()
  _resetTenantCacheForTests()
})

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response> | Response) {
  const spy = vi.fn(impl)
  vi.stubGlobal('fetch', spy)
  return spy
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('灰度閘門 isTenantMetaEnabled()', () => {
  it('未設定任何 tenant 變數 → 關閉，且 fetchTenantMeta 不發網路請求', async () => {
    setEnv({ VITE_TENANT_META_ENABLED: '' })
    const spy = stubFetch(() => jsonResponse({}))
    expect(isTenantMetaEnabled()).toBe(false)

    await expect(fetchTenantMeta()).rejects.toMatchObject({ code: TENANT_META_DISABLED })
    // 灰度不變式：一個請求都不能發出去
    expect(spy).not.toHaveBeenCalled()
  })

  it('VITE_TENANT_BASE_DOMAIN 設定即自動啟用（與 fc 的 isTenantModeEnabled 同口徑）', () => {
    setEnv({ VITE_TENANT_META_ENABLED: '', VITE_TENANT_BASE_DOMAIN: 'ivy.tw' })
    expect(isTenantMetaEnabled()).toBe(true)
  })

  it('VITE_TENANT_META_ENABLED=0 是 kill switch，多租戶模式下也關閉', () => {
    setEnv({ VITE_TENANT_META_ENABLED: '0', VITE_TENANT_BASE_DOMAIN: 'ivy.tw' })
    expect(isTenantMetaEnabled()).toBe(false)
  })
})

describe('請求形狀', () => {
  it('打固定路徑、匿名、不帶 cookie', async () => {
    const spy = stubFetch(() => jsonResponse({ org_name: 'X' }))
    await fetchTenantMeta()

    const [url, init] = spy.mock.calls[0]
    expect(url).toBe('/api/public/tenant-meta')
    expect(init.method).toBe('GET')
    expect(init.credentials).toBe('omit')
  })

  it('單租戶模式（slug 解析不到）不帶 X-Tenant-Slug', async () => {
    const spy = stubFetch(() => jsonResponse({}))
    await fetchTenantMeta()
    const headers = spy.mock.calls[0][1].headers as Record<string, string>
    expect(headers['X-Tenant-Slug']).toBeUndefined()
  })

  it('解析得到 slug 時帶 X-Tenant-Slug（後端一致性檢查通道）', async () => {
    setEnv({ VITE_TENANT_BASE_DOMAIN: 'ivy.tw' })
    _resetTenantCacheForTests()
    const original = window.location.hostname
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'sunshine.ivy.tw', search: '' },
      writable: true,
      configurable: true,
    })
    try {
      const spy = stubFetch(() => jsonResponse({}))
      await fetchTenantMeta()
      const headers = spy.mock.calls[0][1].headers as Record<string, string>
      expect(headers['X-Tenant-Slug']).toBe('sunshine')
    } finally {
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hostname: original },
        writable: true,
        configurable: true,
      })
    }
  })
})

describe('錯誤分類與去重（CT-F-01）', () => {
  it.each([
    [404, 'TENANT_NOT_FOUND'],
    [403, 'TENANT_SUSPENDED'],
    [503, 'TENANT_PROVISIONING'],
  ])('%i 帶出 detail.code=%s', async (status, code) => {
    stubFetch(() => jsonResponse({ detail: { code } }, status))
    await expect(fetchTenantMeta()).rejects.toMatchObject({ status, code })
  })

  it('非 JSON 的錯誤 body 不會讓錯誤處理自己炸掉', async () => {
    stubFetch(() => new Response('<html>502</html>', { status: 502 }))
    const err = await fetchTenantMeta().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TenantMetaError)
    expect((err as TenantMetaError).status).toBe(502)
  })

  it('成功時多次呼叫共用同一次請求（branding 與 liff.ts 各叫一次只打一次）', async () => {
    const spy = stubFetch(() => jsonResponse({ org_name: 'X' }))
    const [a, b] = await Promise.all([fetchTenantMeta(), fetchTenantMeta()])
    expect(spy).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })

  it('失敗**不**快取 rejection：再呼叫會真的重打（LoginView 的 manualRetry 依賴這個）', async () => {
    let n = 0
    const spy = stubFetch(() => {
      n += 1
      return n === 1 ? jsonResponse({ detail: { code: 'x' } }, 500) : jsonResponse({ org_name: 'X' })
    })
    await expect(fetchTenantMeta()).rejects.toBeInstanceOf(TenantMetaError)
    await expect(fetchTenantMeta()).resolves.toMatchObject({ org_name: 'X' })
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
