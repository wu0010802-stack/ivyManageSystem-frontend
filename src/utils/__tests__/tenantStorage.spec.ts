/**
 * `src/utils/tenantStorage.ts`：legacy 一次性遷移 + shadow 語意 + DEV 只讀不搬。
 *
 * 這裡刻意把 **shadow 語意**（CT-F-07(1)）寫成明確斷言：`tenantGetItem` 命中 legacy
 * 後會搬移並刪除 legacy，因此「第一次讀之後，legacy key 永久不再生效」。既有測試
 * `tests/unit/composables/useSalarySettlement.test.ts` 那種「連續兩次寫 legacy」的
 * 形狀會通過，但**是因為第二次寫入被新 key 遮蔽**，不是因為「讀得到 legacy」。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function load(env: Record<string, string | undefined>, hostname = 'localhost', search = '') {
  vi.resetModules()
  for (const key of ['VITE_TENANT_BASE_DOMAIN', 'VITE_TENANT_DOMAIN_MAP', 'VITE_DEV_TENANT_SLUG']) {
    if (env[key] === undefined) delete (import.meta.env as Record<string, unknown>)[key]
    else (import.meta.env as Record<string, unknown>)[key] = env[key]
  }
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname, search },
  })
  return import('@/utils/tenantStorage')
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  for (const key of ['VITE_TENANT_BASE_DOMAIN', 'VITE_TENANT_DOMAIN_MAP', 'VITE_DEV_TENANT_SLUG']) {
    delete (import.meta.env as Record<string, unknown>)[key]
  }
  vi.resetModules()
})

describe('單租戶模式（灰度不變式）', () => {
  it('key 不變，讀寫等同裸 localStorage', async () => {
    const s = await load({})
    s.tenantSetItem('foo', 'bar')
    expect(localStorage.getItem('foo')).toBe('bar')
    expect(s.tenantGetItem('foo')).toBe('bar')
    s.tenantRemoveItem('foo')
    expect(localStorage.getItem('foo')).toBeNull()
  })

  it('不會誤把既存的 legacy 值搬到別的 key', async () => {
    localStorage.setItem('gov-reports.employer', '{"name":"A"}')
    const s = await load({})
    expect(s.tenantGetItem('gov-reports.employer')).toBe('{"name":"A"}')
    expect(localStorage.length).toBe(1)
    expect(localStorage.key(0)).toBe('gov-reports.employer')
  })
})

describe('多租戶模式：key 前綴與 legacy 一次性遷移', () => {
  const env = { VITE_TENANT_BASE_DOMAIN: 'ivy.tw' }

  it('寫入落在 t/<slug>/<base>', async () => {
    const s = await load(env, 'yihua.ivy.tw')
    s.tenantSetItem('ivy_salary_anomaly_thresholds', '{"pct":0.2}')
    expect(localStorage.getItem('t/yihua/ivy_salary_anomaly_thresholds')).toBe('{"pct":0.2}')
    expect(localStorage.getItem('ivy_salary_anomaly_thresholds')).toBeNull()
  })

  it('legacy 命中 → 回值、搬到新 key、刪 legacy', async () => {
    localStorage.setItem('gov-reports.employer', '{"name":"義華"}')
    const s = await load(env, 'yihua.ivy.tw')
    expect(s.tenantGetItem('gov-reports.employer')).toBe('{"name":"義華"}')
    expect(localStorage.getItem('t/yihua/gov-reports.employer')).toBe('{"name":"義華"}')
    expect(localStorage.getItem('gov-reports.employer')).toBeNull()
  })

  it('shadow 語意：搬移後再寫 legacy 會被新 key 遮蔽（CT-F-07(1)）', async () => {
    localStorage.setItem('k', 'v1')
    const s = await load(env, 'yihua.ivy.tw')
    expect(s.tenantGetItem('k')).toBe('v1')          // 第一次讀 → 搬移
    localStorage.setItem('k', 'v2')                  // 回滾的舊 bundle / 舊分頁再寫 legacy
    expect(s.tenantGetItem('k')).toBe('v1')          // ← 讀到的仍是新 key，v2 永遠看不到
  })

  it('A 校搬移不影響 B 校的 key', async () => {
    localStorage.setItem('t/branch2/k', 'B')
    localStorage.setItem('k', 'legacy')
    const s = await load(env, 'yihua.ivy.tw')
    expect(s.tenantGetItem('k')).toBe('legacy')
    expect(localStorage.getItem('t/branch2/k')).toBe('B')
  })

  it('tenantRemoveItem 兼清 legacy 殘留', async () => {
    localStorage.setItem('k', 'legacy')
    const s = await load(env, 'yihua.ivy.tw')
    s.tenantSetItem('k', 'new')
    s.tenantRemoveItem('k')
    expect(localStorage.getItem('t/yihua/k')).toBeNull()
    expect(localStorage.getItem('k')).toBeNull()
  })

  it('tenantCacheName / tenantCacheKey 帶 slug', async () => {
    const s = await load(env, 'yihua.ivy.tw')
    expect(s.tenantCacheName('portal-api')).toBe('portal-api--t-yihua')
    expect(s.tenantCacheKey('hq:reports')).toBe('t/yihua/hq:reports')
  })
})

describe('DEV `?tenant=` override：只讀不搬（CT-F-07(2)）', () => {
  it('讀得到 legacy，但不刪、不搬', async () => {
    localStorage.setItem('k', 'legacy')
    const s = await load({}, 'localhost', '?tenant=branch2')
    expect(s.tenantGetItem('k')).toBe('legacy')
    expect(localStorage.getItem('k')).toBe('legacy')            // legacy 保留
    expect(localStorage.getItem('t/branch2/k')).toBeNull()      // 沒有搬進錯的 slug
  })
})
