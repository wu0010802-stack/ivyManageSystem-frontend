/**
 * `src/utils/tenant.ts` 的表格驅動測試（frontend-core §2.11 #17）。
 *
 * 最重要的兩組斷言：
 *  - **灰度不變式（DEV-12）**：未設 tenant 環境變數時，`resolveTenant()` 恆為 null、
 *    `tenantHeaders()` 恆為 `{}`、`tenantKey()` 回原字串。這一組紅了就代表
 *    「單租戶部署行為與改造前相同」的承諾破了。
 *  - hostname → slug 的解析表（含 apex / www / 非法 label 的 fail-closed）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_ENV = { ...import.meta.env }

async function loadTenant(env: Record<string, string | undefined>, hostname = 'localhost') {
  vi.resetModules()
  for (const key of ['VITE_TENANT_BASE_DOMAIN', 'VITE_TENANT_DOMAIN_MAP', 'VITE_DEV_TENANT_SLUG']) {
    // vitest 的 import.meta.env 是可寫的普通物件；stubEnv 只吃字串，undefined 要自己刪。
    if (env[key] === undefined) delete (import.meta.env as Record<string, unknown>)[key]
    else (import.meta.env as Record<string, unknown>)[key] = env[key]
  }
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname, search: env.__search ?? '' },
  })
  return import('@/utils/tenant')
}

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

afterEach(() => {
  for (const key of ['VITE_TENANT_BASE_DOMAIN', 'VITE_TENANT_DOMAIN_MAP', 'VITE_DEV_TENANT_SLUG']) {
    if (ORIGINAL_ENV[key] === undefined) delete (import.meta.env as Record<string, unknown>)[key]
    else (import.meta.env as Record<string, unknown>)[key] = ORIGINAL_ENV[key]
  }
  vi.resetModules()
})

describe('灰度不變式：未設定任何 tenant 環境變數 = 單租戶模式', () => {
  it('resolveTenant 回 null、isTenantModeEnabled 為 false', async () => {
    const m = await loadTenant({}, 'admin.example.com')
    expect(m.resolveTenant()).toBeNull()
    expect(m.isTenantModeEnabled()).toBe(false)
    expect(m.tenantSlug()).toBeNull()
  })

  it('tenantHeaders 回空物件（一個 header 都不加）', async () => {
    const m = await loadTenant({}, 'admin.example.com')
    expect(m.tenantHeaders()).toEqual({})
  })

  it('tenantKey / tenantCacheName 回原字串（storage key 與改造前逐字相同）', async () => {
    await loadTenant({}, 'admin.example.com')
    const storage = await import('@/utils/tenantStorage')
    expect(storage.tenantKey('gov-reports.employer')).toBe('gov-reports.employer')
    expect(storage.tenantCacheName('portal-api')).toBe('portal-api')
    expect(storage.tenantCacheKey('dict:grades')).toBe('dict:grades')
  })
})

describe('subdomain 解析', () => {
  const base = 'ivy.tw'
  const cases: [string, string | null][] = [
    ['yihua.ivy.tw', 'yihua'],
    ['hq.ivy.tw', 'hq'],           // 總部就是一個普通 slug（CT-P-01）
    ['branch-2.ivy.tw', 'branch-2'],
    ['YIHUA.IVY.TW', 'yihua'],     // 大小寫正規化
    ['ivy.tw', null],              // apex 不含 slug → fail-closed
    ['www.ivy.tw', null],          // www 為保留 label，須由 domain map 明確對映
    ['other.com', null],           // 非本 base domain
    ['-bad.ivy.tw', null],         // 不合 DNS label 規則
  ]

  for (const [hostname, expected] of cases) {
    it(`${hostname} → ${expected ?? 'null'}`, async () => {
      const m = await loadTenant({ VITE_TENANT_BASE_DOMAIN: base }, hostname)
      expect(m.resolveTenant()?.slug ?? null).toBe(expected)
      expect(m.isTenantModeEnabled()).toBe(true)
    })
  }

  it('解析成功時 tenantHeaders 帶 X-Tenant-Slug', async () => {
    const m = await loadTenant({ VITE_TENANT_BASE_DOMAIN: base }, 'yihua.ivy.tw')
    expect(m.tenantHeaders()).toEqual({ 'X-Tenant-Slug': 'yihua' })
  })

  it('多租戶已啟用但認不出 hostname → null（boot 端據此掛遮罩）', async () => {
    const m = await loadTenant({ VITE_TENANT_BASE_DOMAIN: base }, '10.0.0.5')
    expect(m.resolveTenant()).toBeNull()
    expect(m.isTenantModeEnabled()).toBe(true)   // ← 與單租戶模式的關鍵區別
    expect(() => m.requireTenantSlug()).toThrow(/TENANT_UNRESOLVED/)
  })
})

describe('domain map（承接既有正式 domain）', () => {
  it('完整 domain 對照優先於 subdomain 樣板', async () => {
    const m = await loadTenant(
      {
        VITE_TENANT_BASE_DOMAIN: 'ivy.tw',
        VITE_TENANT_DOMAIN_MAP: '{"ivypreschool.tw":"yihua","www.ivypreschool.tw":"yihua"}',
      },
      'www.ivypreschool.tw',
    )
    expect(m.resolveTenant()).toEqual({ slug: 'yihua', source: 'domain-map' })
  })

  it('壞掉的 JSON 視同未設定（不讓 boot 直接炸）', async () => {
    const m = await loadTenant({ VITE_TENANT_DOMAIN_MAP: '{not json' }, 'yihua.ivy.tw')
    expect(m.resolveTenant()).toBeNull()
    expect(m.isTenantModeEnabled()).toBe(false)
  })
})

describe('DEV override', () => {
  it('VITE_DEV_TENANT_SLUG 生效並啟用多租戶模式', async () => {
    const m = await loadTenant({ VITE_DEV_TENANT_SLUG: 'devschool' }, 'localhost')
    expect(m.resolveTenant()).toEqual({ slug: 'devschool', source: 'dev-override' })
    expect(m.isTenantModeEnabled()).toBe(true)
  })

  it('?tenant= 寫進 sessionStorage 供後續導航沿用', async () => {
    const m = await loadTenant({ __search: '?tenant=branch2' }, 'localhost')
    expect(m.resolveTenant()?.slug).toBe('branch2')
    expect(sessionStorage.getItem('ivy.dev.tenant')).toBe('branch2')
  })
})

describe('buildTenantOrigin：純轉發後端的 public_origin（CT-A-08(3)）', () => {
  it.each([
    [{ public_origin: 'https://yihua.ivy.tw/' }, 'https://yihua.ivy.tw'],
    [{ public_origin: '  http://a.b  ' }, 'http://a.b'],
    [{ public_origin: 'yihua.ivy.tw' }, null],   // 沒有 scheme → 不猜，fail-closed
    [{ public_origin: null }, null],
    [{}, null],
  ])('%o → %s', async (input, expected) => {
    const m = await loadTenant({})
    expect(m.buildTenantOrigin(input)).toBe(expected)
  })
})

describe('tenantErrorCodeOf：三態租戶錯誤', () => {
  it.each([
    [404, { detail: { code: 'TENANT_NOT_FOUND' } }, 'TENANT_NOT_FOUND'],
    [403, { detail: { code: 'TENANT_SUSPENDED' } }, 'TENANT_SUSPENDED'],
    [503, { detail: { code: 'TENANT_PROVISIONING' } }, 'TENANT_PROVISIONING'],
    // 一般業務錯誤不得被誤判成租戶錯誤，否則整站被遮罩擋住
    [404, { detail: { code: 'STUDENT_NOT_FOUND' } }, null],
    [503, { detail: { code: 'MAINTENANCE_MODE' } }, null],
    [500, { detail: { code: 'TENANT_NOT_FOUND' } }, null],
    [404, { detail: '找不到' }, null],
    [404, undefined, null],
  ])('status=%s → %s', async (status, body, expected) => {
    const m = await loadTenant({})
    expect(m.tenantErrorCodeOf(status as number, body)).toBe(expected)
  })
})
