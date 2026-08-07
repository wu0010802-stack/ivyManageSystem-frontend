/**
 * `GET /api/public/tenant-meta` 的唯一取得管道（匿名公開端點）。
 *
 * 設計依據：`multitenant-plan/03-final/frontend-brand-build.md` §2.1/§2.2、
 * `contracts.md` CT-X-06（端點唯一性、payload 欄位）、CT-F-05（裸 fetch）、
 * CT-F-08（owner = fb）。
 *
 * ## 為什麼是裸 `fetch` 而不是 `@/api/index`（CT-F-05，**不得改回**）
 *
 * 1. **執行語意**：管理端 axios 的 request interceptor 綁 `adminSession` generation /
 *    AbortSignal，401 會去打管理端 `/auth/refresh`。一支匿名公開端點不該有這些。
 * 2. **打包邊界（會直接擋住 build）**：`vite.config.js` 把 `/src/api/index.ts` 釘進
 *    `admin-core` chunk，而 `scripts/check-entry-chunks.mjs` 對 parent entry 設
 *    `forbidden: [/^admin-core-/]`。本檔被 `parent/services/liff.ts` import，
 *    若改走 axios，`npm run build` 會 exit 1、CI Build check 紅、也出不了 image。
 *    ⇒ **本檔必須維持零 axios 依賴**，才能安全釘進 `shared-common`（三 entry 共載）。
 *
 * ## 其他約定
 * - 路徑固定 `'/api/public/tenant-meta'`，**不吃** `VITE_API_BASE_URL`：同 origin
 *   匿名端點走 nginx `/api/` 反代即可，避免 split-domain 拓撲多一次 preflight。
 * - `credentials: 'omit'`：匿名，不帶 cookie。
 * - 單一 in-flight promise 去重：branding 與 `liff.ts` 共用同一次請求（boot 只打一次）。
 *   **rejection 不快取**（失敗後把 `_p` 清掉），讓使用者重試時能真的重打。
 * - 逾時 10s（`AbortSignal.timeout`）：家長端 `initLiff()` 依賴這支，網路卡住不得讓登入永久轉圈。
 */

import { isTenantModeEnabled, TENANT_HEADER, tenantSlug } from '@/utils/tenant'

/** §2.1 的 payload 契約。所有欄位皆可缺（消費端逐欄 fallback 到 `BRANDING_DEFAULTS`）。 */
export interface TenantMeta {
  tenant?: { slug?: string; kind?: string }
  school_name?: string
  org_name?: string
  /** 機構英文銜（公開頁 footer 用，現行字面 `Ivy Educational Institution`）。 */
  org_name_en?: string
  /** 園所英文名（公開頁 header 第三行，現行字面 `Ivy Kindergarten`）。與 `org_name_en` 是不同字串。 */
  school_name_en?: string
  org_prefix?: string
  short_name?: string
  titles?: Partial<Record<'admin' | 'portal' | 'public' | 'parent' | 'parent_short', string>>
  /** PWA manifest 三組：與 `titles.*` 是**不同字串**（CT-F-02）。 */
  manifest?: Partial<Record<'admin' | 'parent' | 'public', { name?: string; short_name?: string; description?: string }>>
  logo_url?: string
  theme?: { admin_primary?: string; parent_primary?: string }
  contact?: { campus_label?: string; address?: string; phone?: string; phone_display?: string }
  map?: { lat?: number; lng?: number }
  /**
   * ⚠ **不含 `meta_description`**（4d 裁決 #4 + fb 裁決 (a)）：`TB_META_DESC` 是
   * **L1-only** token（`public.html` 的 `<meta name="description">` 由 nginx
   * `sub_filter` 就地替換），值來自 `branding/tenants.json`，**零 JS 消費點**。
   * 後端 `api/public/tenant_meta.py` 的 `_SHARE_FIELDS` 刻意不提供這欄，加進匿名
   * payload 是死重。要改成後台可編輯再一併改 contracts + 後端 + 本型別。
   */
  share?: Partial<
    Record<'site_name' | 'og_title' | 'og_description' | 'poster_alt' | 'share_text', string>
  >
  school_keywords?: string[]
  school_aliases?: string[]
  liff_id?: string
  line_bot_friend_url?: string
  public_site_origin?: string
}
// ⚠ 契約提醒：payload **不含 `tax_id`**（CT-FIX-22(2)：統編維持
// `tenants.contact_json`，只在管理端政府申報流程使用，不匿名揭露）。
// 也**不含** `line_login_channel_id`（CT-X-06 刪除欄位，前端零消費點）。
// 任何一方要加回來，先改 contracts，別在這裡偷加。

export class TenantMetaError extends Error {
  constructor(public readonly status: number, public readonly code?: string) {
    super(code ?? String(status))
    this.name = 'TenantMetaError'
  }
}

const ENDPOINT = '/api/public/tenant-meta'
const TIMEOUT_MS = 10_000

let _p: Promise<TenantMeta> | null = null

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  // 單租戶模式（DEV-12）下 `tenantSlug()` 回 null → 不送 header，請求與改造前逐字相同。
  const slug = tenantSlug()
  if (slug) headers[TENANT_HEADER] = slug
  return headers
}

async function _doFetch(): Promise<TenantMeta> {
  const res = await fetch(ENDPOINT, {
    method: 'GET',
    credentials: 'omit',
    headers: buildHeaders(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) {
    const code = await res
      .json()
      .then((b: unknown) => (b as { detail?: { code?: string } } | undefined)?.detail?.code)
      .catch(() => undefined)
    throw new TenantMetaError(res.status, code)
  }
  return (await res.json()) as TenantMeta
}

/** 灰度關閉時的拒絕碼。status 0 → 落在 CT-F-01 的 fail-soft 分支，不觸發遮罩。 */
export const TENANT_META_DISABLED = 'TENANT_META_DISABLED'

/**
 * 階段 0 灰度開關（fb §7 / CT-FIX-21 S-fb / DEV-12）。
 *
 * **預設值跟著 fc 的 `isTenantModeEnabled()`**（與後端 `is_host_resolution_enabled()`
 * 同口徑）：沒有任何 tenant build 設定 = 單租戶模式，`fetchTenantMeta()` 完全不發網路
 * 請求 → branding 保留 `BRANDING_DEFAULTS`、`initLiff()` 走 `VITE_LIFF_ID` fallback，
 * 畫面與改造前 byte-level 相同（灰度不變式）。這同時避免 CT-F-01 的「404 fail-hard
 * 遮罩」在後端端點尚未上線時誤擋現有單租戶站台。
 *
 * 兩個顯式覆寫（給運維用）：
 *   - `VITE_TENANT_META_ENABLED=1` → 單租戶模式也啟用（想先接品牌 API）
 *   - `VITE_TENANT_META_ENABLED=0` → 多租戶模式也停用（kill switch）
 *
 * ⚠ **落日時點**：後端 `GET /api/public/tenant-meta` 上線並通過煙霧測試後，同一 release 內
 * 把 `VITE_TENANT_META_ENABLED` 這個變數**整個刪掉**（不是設成 1 就算完），只留
 * `isTenantModeEnabled()`。否則它會變成永久的 fail-soft 後門，讓 CT-F-01 的
 * 「404 fail-hard」形同虛設。已列入部署 checklist（contracts P18）。
 */
export function isTenantMetaEnabled(): boolean {
  const raw = String(import.meta.env?.VITE_TENANT_META_ENABLED ?? '').trim()
  if (raw === '1' || raw === 'true') return true
  if (raw === '0' || raw === 'false') return false
  return isTenantModeEnabled()
}

/**
 * 取得當前租戶的公開設定。多次呼叫共用同一次網路請求。
 *
 * 失敗時**不快取 rejection**：呼叫端（`useTenantBranding` 的重試、`initLiff()` 的
 * `manualRetry`）再呼叫會重打。
 */
export function fetchTenantMeta(): Promise<TenantMeta> {
  if (!isTenantMetaEnabled()) {
    return Promise.reject(new TenantMetaError(0, TENANT_META_DISABLED))
  }
  if (!_p) {
    _p = _doFetch().catch((e: unknown) => {
      _p = null
      throw e
    })
  }
  return _p
}

/** 測試專用：清掉 in-flight promise 快取。 */
export function _resetTenantMetaCacheForTests(): void {
  _p = null
}
