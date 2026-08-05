/**
 * 多租戶：由 `location.hostname` 同步解析當前園所（tenant）。
 *
 * 設計依據：`multitenant-plan/03-final/frontend-core.md` §2.1、`contracts.md`
 * CT-A-05 / CT-F-08。實作偏離記錄見 contracts.md §16 **DEV-12**（灰度不變式）。
 *
 * ## 三條必須記住的守則
 *
 * 1. **Host 才是租戶識別的唯一權威**。本檔解出的 slug 只用於
 *    (a) 瀏覽器儲存 key 的第二道隔離、(b) 送 `X-Tenant-Slug` 給後端做**一致性檢查**。
 *    後端 `middleware/tenant_context.py` 一律以 Host 解析，header 不符只會被拒，
 *    **不會**被當成租戶來源。因此前端絕不能「靠 header 切租戶」。
 * 2. **module top-level 不得呼叫 `requireTenantSlug()`**（會 throw）。ES module 的
 *    依賴圖求值早於 entry body（`main.ts` → `api/index.ts` → `adminSession.ts`），
 *    在那裡 throw 會得到「空白頁 + 一行 console error」而非設計承諾的遮罩，且
 *    Sentry 可能尚未 init。早於 boot 的路徑一律用 `tenantSlug()`（回 `null`）。
 * 3. **WebSocket 顯式豁免**：瀏覽器 WebSocket API 無法設自訂 header，以下 6 個連線點
 *    **不帶** `X-Tenant-Slug`，靠 Host（nginx `/api/ws/` 區塊的 `proxy_set_header
 *    Host $host`）+ JWT `tenant_id` claim 兩通道保證正確性：
 *    `useBusMonitor.ts`、`usePortalDismissalAlerts.ts`、`useInboxNotifications.ts`、
 *    `api/dismissalCalls.ts`、`views/DismissalQueueView.vue`、
 *    `parent/composables/useBusTracking.ts`。
 *    ⚠ 部署依賴：`/api/ws/` location 的 `Host $host` 是 WS 租戶正確性的唯一保證。
 *
 * ## 灰度不變式（DEV-12，本檔最重要的性質）
 *
 * **未設定任何 tenant build 變數時 = 單租戶模式**：`resolveTenant()` 回 `null`、
 * `isTenantModeEnabled()` 回 `false`，於是
 *   - storage key **完全不加前綴**（`tenantKey('x') === 'x'`）
 *   - API **不送** `X-Tenant-Slug`
 *   - boot **不顯示**任何遮罩
 * 也就是全前端行為與改造前逐字相同。這與後端 DEV-04 的
 * `is_host_resolution_enabled()` 閘門（`TENANT_BASE_DOMAIN` 未設即不 enforce）同口徑。
 *
 * ## ACTING_TENANT_HEADER 已依 CT-A-06 刪除
 * 總部（platform）的 acting tenant 走 `/api/platform/*` 的 `tenant_id` 參數，
 * **不得**在本檔重新引入 `X-Acting-Tenant-Slug`。
 */

/** 送給後端做一致性檢查的 header 名（斷言通道，非識別通道，CT-A-05）。 */
export const TENANT_HEADER = 'X-Tenant-Slug'

/** DEV `?tenant=` override 的 sessionStorage 落點（跨導航沿用）。 */
const DEV_TENANT_SESSION_KEY = 'ivy.dev.tenant'

/** slug 字元集，與後端 `tenants.slug` 的 DNS label CHECK 一致（CT-D-03）。 */
const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * 不視為租戶 slug 的保留 label。`www.<base>` 應由 `VITE_TENANT_DOMAIN_MAP` 明確
 * 對映到某個租戶，而不是被當成一個叫 "www" 的園所（fail-closed）。
 */
const RESERVED_LABELS = new Set(['www'])

export interface TenantRef {
  slug: string
  source: 'dev-override' | 'domain-map' | 'subdomain'
}

interface TenantEnv {
  baseDomain: string
  domainMap: Record<string, string>
  devSlug: string
}

let _envCache: TenantEnv | undefined
let _cached: TenantRef | null | undefined // undefined = 尚未解析；null = 單租戶或解析失敗

function readEnv(): TenantEnv {
  if (_envCache) return _envCache
  const env = (import.meta.env ?? {}) as Record<string, string | undefined>
  let domainMap: Record<string, string> = {}
  const rawMap = env.VITE_TENANT_DOMAIN_MAP
  if (rawMap) {
    try {
      const parsed: unknown = JSON.parse(rawMap)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [host, slug] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof slug === 'string' && slug) domainMap[host.toLowerCase()] = slug.toLowerCase()
        }
      }
    } catch {
      // 壞 JSON 視同未設定：寧可退回單租戶（行為等同現況），也不要讓 boot 直接炸。
      domainMap = {}
    }
  }
  _envCache = {
    baseDomain: (env.VITE_TENANT_BASE_DOMAIN || '').trim().toLowerCase().replace(/^\.+|\.+$/g, ''),
    domainMap,
    devSlug: (env.VITE_DEV_TENANT_SLUG || '').trim().toLowerCase(),
  }
  return _envCache
}

/** DEV 專用：`?tenant=<slug>`（hash 前的 search）→ sessionStorage 供後續導航沿用。 */
function readDevOverride(): string {
  if (!import.meta.env?.DEV || typeof window === 'undefined') return ''
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('tenant')?.trim().toLowerCase()
    if (fromQuery && SLUG_RE.test(fromQuery)) {
      sessionStorage.setItem(DEV_TENANT_SESSION_KEY, fromQuery)
      return fromQuery
    }
    const stored = sessionStorage.getItem(DEV_TENANT_SESSION_KEY)?.trim().toLowerCase()
    if (stored && SLUG_RE.test(stored)) return stored
  } catch {
    /* 無痕模式 / storage 被停用：退回其他解析來源 */
  }
  return readEnv().devSlug && SLUG_RE.test(readEnv().devSlug) ? readEnv().devSlug : ''
}

/**
 * 是否已啟用多租戶識別（有任何一項 tenant build 設定 / DEV override）。
 *
 * `false` = 單租戶模式，全前端維持改造前行為（灰度不變式，DEV-12）。
 * 三個 entry 只在 `true` 且解析失敗時才顯示 `TenantBlockedScreen`。
 */
export function isTenantModeEnabled(): boolean {
  const env = readEnv()
  if (env.baseDomain || Object.keys(env.domainMap).length > 0) return true
  return readDevOverride() !== ''
}

function resolveFromHostname(hostname: string): TenantRef | null {
  const env = readEnv()
  const host = hostname.trim().toLowerCase().replace(/\.$/, '')

  // 1. 完整 domain 對照（承接既有正式 domain；對應後端 tenants.custom_domain）
  const mapped = env.domainMap[host]
  if (mapped) return { slug: mapped, source: 'domain-map' }

  // 2. subdomain 樣板：`<slug>.<VITE_TENANT_BASE_DOMAIN>`
  if (!env.baseDomain) return null
  if (host === env.baseDomain) return null // apex 不含 slug → fail-closed
  const suffix = `.${env.baseDomain}`
  if (!host.endsWith(suffix)) return null
  const label = host.slice(0, -suffix.length).split('.')[0]
  if (!label || RESERVED_LABELS.has(label) || !SLUG_RE.test(label)) return null
  return { slug: label, source: 'subdomain' }
}

/**
 * 解析當前租戶。同步、純字串運算、**不打 API**（storage prefix 在 module init 就要用）。
 *
 * 回 `null` 的兩種語意（由 `isTenantModeEnabled()` 區分，呼叫端請務必分辨）：
 *   - 單租戶模式（沒有任何 tenant build 設定）→ 正常，維持現況行為
 *   - 多租戶已啟用但 hostname 認不出來（誤配 DNS / 直連 IP）→ boot 必須 fail-loud
 */
export function resolveTenant(): TenantRef | null {
  if (_cached !== undefined) return _cached
  if (typeof window === 'undefined') {
    // 測試 / SSR：無 location 可解析，一律視為單租戶（不隔離、不擋）。
    _cached = null
    return _cached
  }
  const dev = readDevOverride()
  _cached = dev ? { slug: dev, source: 'dev-override' } : resolveFromHostname(window.location.hostname)
  return _cached
}

/** 當前租戶 slug；單租戶模式或解析失敗回 `null`。**早於 boot 的路徑一律用這支。** */
export function tenantSlug(): string | null {
  return resolveTenant()?.slug ?? null
}

/**
 * fail-loud 版：僅供「已在 boot 之後、且呼叫端有錯誤處理」的路徑使用。
 * ⚠ **禁止在 module top-level / IndexedDB upgrade / 任何早於 boot 的路徑呼叫**（GAP-07）。
 */
export function requireTenantSlug(): string {
  const slug = tenantSlug()
  if (!slug) throw new Error('TENANT_UNRESOLVED: 無法從 hostname 識別園所')
  return slug
}

/**
 * 契約相容別名（frontend-core §4.2 對 fb / hq 的提供物）。
 * ⚠ fc 自己的 storage helper **不用**這支——placeholder 會在單租戶模式下污染 key，
 * 破壞灰度不變式。需要 key 前綴請用 `tenantStorage.ts` 的 `tenantKey()`。
 */
export function tenantSlugOrPlaceholder(): string {
  return tenantSlug() ?? '__unresolved'
}

/**
 * 目標租戶的對外 origin。**只轉發後端提供的 `public_origin`，前端不得自行以
 * slug + BASE_DOMAIN 組**（自訂網域租戶會組錯；host 產生規則的權威在後端，CT-A-08(3)）。
 * 回 `null` 時 UI 應**隱藏連結**（fail-closed），不顯示可能錯誤的網址。
 */
export function buildTenantOrigin(t: { public_origin?: string | null }): string | null {
  const o = t.public_origin?.trim()
  return o && /^https?:\/\//.test(o) ? o.replace(/\/+$/, '') : null
}

/**
 * 要附加到 HTTP 請求上的 tenant 一致性 header（CT-A-05 斷言通道）。
 *
 * 單租戶模式 / 解析失敗時回 `{}`——**灰度不變式：不新增任何 header**
 * （空字串 header 會讓後端 `TENANT_HEADER_MODE=enforce` 誤判為 mismatch）。
 * ⚠ **WebSocket 不適用**（見檔頭守則 3）。四個 HTTP 注入點與 fb 的
 * `tenantMeta.ts` 裸 fetch 一律經此函式，不要各自組 header。
 */
export function tenantHeaders(): Record<string, string> {
  const slug = tenantSlug()
  return slug ? { [TENANT_HEADER]: slug } : {}
}

/** 後端 `TenantContextMiddleware` 的三態租戶錯誤碼（CT-A-03 / CT-F-01）。 */
export const TENANT_ERROR_CODES = ['TENANT_NOT_FOUND', 'TENANT_SUSPENDED', 'TENANT_PROVISIONING'] as const
export type TenantErrorCode = typeof TENANT_ERROR_CODES[number]

/**
 * 從 axios/fetch 的錯誤 body 取出租戶三態碼；不是租戶錯誤回 `null`。
 * envelope 為 `{"detail": {"code": ...}}`（404 / 403 / 503）。
 */
export function tenantErrorCodeOf(status: number | undefined, body: unknown): TenantErrorCode | null {
  if (status !== 404 && status !== 403 && status !== 503) return null
  const detail = (body as { detail?: unknown } | undefined)?.detail
  if (!detail || typeof detail !== 'object') return null
  const code = (detail as { code?: unknown }).code
  return typeof code === 'string' && (TENANT_ERROR_CODES as readonly string[]).includes(code)
    ? (code as TenantErrorCode)
    : null
}

/** 測試專用：清掉 module-level cache（含 env 快取）。 */
export function _resetTenantCacheForTests(): void {
  _cached = undefined
  _envCache = undefined
}
