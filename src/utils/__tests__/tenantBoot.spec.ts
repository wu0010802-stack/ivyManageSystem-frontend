/**
 * `initTenantBoot()`：三個 entry 共用的 boot 檢查（frontend-core §2.1 / CT-F-07(3)）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const KEYS = ['VITE_TENANT_BASE_DOMAIN', 'VITE_TENANT_DOMAIN_MAP', 'VITE_DEV_TENANT_SLUG']

async function load(env: Record<string, string | undefined>, hostname: string) {
  vi.resetModules()
  for (const k of KEYS) {
    if (env[k] === undefined) delete (import.meta.env as Record<string, unknown>)[k]
    else (import.meta.env as Record<string, unknown>)[k] = env[k]
  }
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname, search: '', hash: '' },
  })
  return {
    boot: await import('@/utils/tenantBoot'),
    blocked: await import('@/utils/tenantBlocked'),
  }
}

beforeEach(() => {
  sessionStorage.clear()
  document.body.innerHTML = ''
})

afterEach(() => {
  for (const k of KEYS) delete (import.meta.env as Record<string, unknown>)[k]
  vi.resetModules()
})

describe('單租戶模式（灰度不變式）', () => {
  it('proceed=true、slug=null、不掛遮罩', async () => {
    const { boot, blocked } = await load({}, 'admin.example.com')
    const r = boot.initTenantBoot()
    expect(r.proceed).toBe(true)
    expect(r.slug).toBeNull()
    expect(blocked.isTenantBlocked()).toBe(false)
  })

  it('sessionStorage 有他租戶的 userInfo 也不動它（改造前沒有這個概念）', async () => {
    sessionStorage.setItem('userInfo', JSON.stringify({ name: 'A', tenant_slug: 'other' }))
    const { boot } = await load({}, 'admin.example.com')
    boot.initTenantBoot()
    expect(sessionStorage.getItem('userInfo')).not.toBeNull()
  })
})

describe('多租戶已啟用', () => {
  const env = { VITE_TENANT_BASE_DOMAIN: 'ivy.tw' }

  it('hostname 認不出園所 → proceed=false 且掛遮罩', async () => {
    const { boot, blocked } = await load(env, '10.0.0.5')
    const r = boot.initTenantBoot()
    expect(r.proceed).toBe(false)
    expect(blocked.isTenantBlocked()).toBe(true)
    blocked._resetTenantBlockedForTests()
  })

  it('解析成功 → proceed=true 且回 slug（供 Sentry tag）', async () => {
    const { boot } = await load(env, 'yihua.ivy.tw')
    const r = boot.initTenantBoot()
    expect(r).toMatchObject({ proceed: true, slug: 'yihua' })
  })

  it('sessionStorage 身分屬別的園所 → 清掉（router guard 會送回登入頁）', async () => {
    sessionStorage.setItem('userInfo', JSON.stringify({ name: 'A', tenant_slug: 'branch2' }))
    sessionStorage.setItem('auth_session_validated_at', '123')
    const { boot } = await load(env, 'yihua.ivy.tw')
    expect(boot.initTenantBoot().proceed).toBe(true)
    expect(sessionStorage.getItem('userInfo')).toBeNull()
    expect(sessionStorage.getItem('auth_session_validated_at')).toBeNull()
  })

  it('同園所的 userInfo 保留', async () => {
    sessionStorage.setItem('userInfo', JSON.stringify({ name: 'A', tenant_slug: 'yihua' }))
    const { boot } = await load(env, 'yihua.ivy.tw')
    boot.initTenantBoot()
    expect(sessionStorage.getItem('userInfo')).not.toBeNull()
  })

  it('灰度期舊 session（無 tenant_slug）不被誤清', async () => {
    sessionStorage.setItem('userInfo', JSON.stringify({ name: 'A' }))
    const { boot } = await load(env, 'yihua.ivy.tw')
    boot.initTenantBoot()
    expect(sessionStorage.getItem('userInfo')).not.toBeNull()
  })
})
