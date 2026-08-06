import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BRANDING_DEFAULTS,
  getBranding,
  normalizeBranding,
  onBrandingLoaded,
  useTenantBranding,
  __resetBranding,
} from '@/composables/useTenantBranding'
import { _resetTenantMetaCacheForTests } from '@/api/tenantMeta'
import { _resetTenantCacheForTests } from '@/utils/tenant'
import { _resetTenantBlockedForTests, isTenantBlocked } from '@/utils/tenantBlocked'

const ORIGINAL_ENV = { ...import.meta.env }
// ⚠ vitest 的 import.meta.env 是 process.env proxy：指派 undefined 會變成字串
// 'undefined'（truthy）。表示「未設定」一律用空字串。
const setEnv = (patch: Record<string, string>) => Object.assign(import.meta.env, patch)

beforeEach(() => {
  __resetBranding()
  _resetTenantMetaCacheForTests()
  _resetTenantCacheForTests()
  _resetTenantBlockedForTests()
  sessionStorage.clear()
  setEnv({ VITE_TENANT_META_ENABLED: '1' })
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.assign(import.meta.env, ORIGINAL_ENV)
  __resetBranding()
  _resetTenantBlockedForTests()
})

const stub = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })),
    ),
  )

/** `_fetchOnce` 是 fire-and-forget，測試需要讓 microtask queue 跑完。 */
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('灰度不變式', () => {
  it('未開啟時不發請求，branding 恆為 BRANDING_DEFAULTS', async () => {
    setEnv({ VITE_TENANT_META_ENABLED: '', VITE_TENANT_BASE_DOMAIN: '', VITE_TENANT_DOMAIN_MAP: '' })
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)

    const { branding } = useTenantBranding()
    await flush()

    expect(spy).not.toHaveBeenCalled()
    expect(branding.value).toEqual(BRANDING_DEFAULTS)
    expect(isTenantBlocked()).toBe(false)
  })

  it('BRANDING_DEFAULTS 是改造前的字面（抽樣鎖住幾個最容易被順手改掉的）', () => {
    expect(BRANDING_DEFAULTS.titles.admin).toBe('常春藤管理系統')
    expect(BRANDING_DEFAULTS.titles.public).toBe('常春藤才藝報名')
    expect(BRANDING_DEFAULTS.manifest.public.name).toBe('常春藤公開報名')
    expect(BRANDING_DEFAULTS.school_keywords).toEqual(['常春藤'])
  })

  it('BRANDING_DEFAULTS.contact 刻意留空字串，不是義華的真實地址/電話（2026-08 事故回歸測試）', () => {
    // 這組值同時是 normalizeBranding() 的逐欄 fallback：若放另一間真實園所的
    // 真實聯絡資訊，任何忘記在總部填聯絡資訊的新租戶都會借用它的身分。
    expect(BRANDING_DEFAULTS.contact).toEqual({
      campus_label: '',
      address: '',
      phone: '',
      phone_display: '',
    })
  })
})

describe('逐欄 fallback（normalizeBranding）', () => {
  it('空 payload → 完全等於 defaults', () => {
    expect(normalizeBranding({})).toEqual(BRANDING_DEFAULTS)
    expect(normalizeBranding(null)).toEqual(BRANDING_DEFAULTS)
  })

  it('部分欄位 → 只覆蓋有值的，其餘退回 defaults（不會出現 undefined / 空字串）', () => {
    const out = normalizeBranding({ org_name: '陽光教育', titles: { admin: '陽光管理系統' } })
    expect(out.org_name).toBe('陽光教育')
    expect(out.titles.admin).toBe('陽光管理系統')
    expect(out.titles.portal).toBe(BRANDING_DEFAULTS.titles.portal)
    expect(out.manifest.public.name).toBe(BRANDING_DEFAULTS.manifest.public.name)
  })

  it('新租戶未填聯絡資訊時 contact.* 退回空字串，不會借用義華的地址/電話（2026-08 事故回歸測試）', () => {
    // 模擬 renwu 這種「tenant-meta 有回應，但 contact 整組缺欄」的真實情境
    // （後端 response_model_exclude_none=True，未填欄位不會出現在 payload 裡）。
    const out = normalizeBranding({ tenant: { slug: 'renwu' }, school_name: '仁武幼兒園' })
    expect(out.contact).toEqual({ campus_label: '', address: '', phone: '', phone_display: '' })
  })

  it('map 的 0 座標視為有效值（|| 會把 0 當缺值，故用 typeof 判斷）', () => {
    expect(normalizeBranding({ map: { lat: 0, lng: 0 } }).map).toEqual({ lat: 0, lng: 0 })
  })

  it('school_aliases 給空陣列時尊重「這間園所沒有別名」，不退回 defaults', () => {
    expect(normalizeBranding({ school_aliases: [] }).school_aliases).toEqual([])
  })
})

describe('CT-F-01 錯誤分類', () => {
  it.each([
    [404, 'TENANT_NOT_FOUND'],
    [403, 'TENANT_SUSPENDED'],
    [503, 'TENANT_PROVISIONING'],
  ])('%i → fail-hard 掛遮罩，且不套用任何品牌', async (status, code) => {
    stub(status, { detail: { code } })
    const { branding } = useTenantBranding()
    await flush()

    expect(isTenantBlocked()).toBe(true)
    // 最危險的錯誤是「靜默顯示別間園所的品牌」——這裡必須維持 defaults 且畫面被擋住
    expect(branding.value).toEqual(BRANDING_DEFAULTS)
  })

  it('5xx → fail-soft，保留 defaults 且**不**掛遮罩', async () => {
    stub(500, { detail: 'boom' })
    const { branding } = useTenantBranding()
    await flush()

    expect(isTenantBlocked()).toBe(false)
    expect(branding.value).toEqual(BRANDING_DEFAULTS)
  })

  it('網路錯誤 → fail-soft', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('network'))))
    useTenantBranding()
    await flush()
    expect(isTenantBlocked()).toBe(false)
    expect(getBranding()).toEqual(BRANDING_DEFAULTS)
  })
})

describe('成功路徑', () => {
  it('套用品牌、寫 sessionStorage 快照、觸發 onBrandingLoaded', async () => {
    stub(200, { tenant: { slug: 'sunshine' }, org_name: '陽光教育' })
    const seen: string[] = []
    onBrandingLoaded(() => seen.push(getBranding().org_name))

    const { branding } = useTenantBranding()
    await flush()

    expect(branding.value.org_name).toBe('陽光教育')
    expect(seen).toEqual(['陽光教育'])
    expect(JSON.parse(sessionStorage.getItem('tenant_branding_v1') as string).org_name).toBe('陽光教育')
  })

  it('已載入後才註冊的 onBrandingLoaded 立即執行（避免 callback 永遠不觸發）', async () => {
    stub(200, { org_name: '陽光教育' })
    useTenantBranding()
    await flush()

    const cb = vi.fn()
    onBrandingLoaded(cb)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('只 fetch 一次：多個元件各自呼叫 useTenantBranding() 不會打多次', async () => {
    const spy = vi.fn(() =>
      Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })),
    )
    vi.stubGlobal('fetch', spy)
    useTenantBranding()
    useTenantBranding()
    useTenantBranding()
    await flush()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
