/**
 * 總部（platform / hq）console 的 typed client——`/api/platform/*` 全套。
 *
 * ## 三條守則（改本檔前必讀）
 *
 * 1. **acting tenant 一律走 `tenant_id` 參數（path 或 query 或 body），不得新增任何
 *    acting header**（CT-A-06 已刪除 `X-Acting-Tenant-Slug`；`@/utils/tenant` 的
 *    `tenantHeaders()` 只送 `X-Tenant-Slug`＝「本分頁在哪個 Host」的一致性斷言）。
 * 2. **dispatch path 不帶 `/api`**：後端 `scripts/dump_openapi.py` 剝除 `/api` 前綴，
 *    schema 內是 `/platform/*`（hq-reporting §2.5 紀律 3）。
 * 3. 走既有 `./index` 的 axios instance——interceptor / refresh / dedupe / session
 *    generation 全部繼承；**不要**在總部頁裡直接 axios/fetch。
 *
 * 後端未開 `PLATFORM_ENABLED` 時 router 不註冊 ⇒ 這些端點一律 404（CT-P-01(6)），
 * 呼叫端要能接受「404 = 總部功能未開通」。
 */
import api from './index'
import type { ApiBody, ApiQuery, AxiosResp, Schema } from './_generated/typed'

export type TenantSummary = Schema<'PlatformTenantSummary'>
export type TenantDetail = Schema<'PlatformTenantDetailOut'>
export type TenantStatusResult = Schema<'PlatformTenantStatusOut'>
export type TenantCreateResult = Schema<'PlatformTenantCreateOut'>
export type BrandConfig = Schema<'PlatformBrandOut'>
export type PlatformLineConfig = Schema<'PlatformLineConfigOut'>
export type PlatformEmailConfig = Schema<'PlatformEmailConfigOut'>
export type PlatformReport = Schema<'PlatformReportOut'>
export type PlatformReportTenantRow = Schema<'PlatformReportTenantRow'>
export type RoleSyncReport = Schema<'PlatformRoleSyncOut'>
export type RoleSyncTargetResult = Schema<'PlatformRoleSyncTargetOut'>
export type PlatformAuditPage = Schema<'PlatformAuditOut'>
export type PlatformAuditRow = Schema<'PlatformAuditRow'>

// ── 租戶 ──

export function listTenants(
  params?: ApiQuery<'/platform/tenants', 'get'>,
): AxiosResp<'/platform/tenants', 'get'> {
  return api.get('/platform/tenants', { params })
}

export function getTenant(tenantId: number): AxiosResp<'/platform/tenants/{tenant_id}', 'get'> {
  return api.get(`/platform/tenants/${tenantId}`)
}

/**
 * 建立分校。`dry_run: true` 只驗 CT-X-12 的三條件閘門並回 `blockers`，**不寫任何列**；
 * onboarding UI 一律先 dry-run 再實建（見 `PlatformTenantsView.vue`）。
 */
export function createTenant(
  body: ApiBody<'/platform/tenants', 'post'>,
): AxiosResp<'/platform/tenants', 'post'> {
  return api.post('/platform/tenants', body)
}

export function updateTenant(
  tenantId: number,
  body: ApiBody<'/platform/tenants/{tenant_id}', 'patch'>,
): AxiosResp<'/platform/tenants/{tenant_id}', 'patch'> {
  return api.patch(`/platform/tenants/${tenantId}`, body)
}

export function suspendTenant(
  tenantId: number,
): AxiosResp<'/platform/tenants/{tenant_id}/suspend', 'post'> {
  return api.post(`/platform/tenants/${tenantId}/suspend`)
}

export function resumeTenant(
  tenantId: number,
): AxiosResp<'/platform/tenants/{tenant_id}/resume', 'post'> {
  return api.post(`/platform/tenants/${tenantId}/resume`)
}

export function archiveTenant(
  tenantId: number,
): AxiosResp<'/platform/tenants/{tenant_id}/archive', 'post'> {
  return api.post(`/platform/tenants/${tenantId}/archive`)
}

// ── 品牌（onboarding 的 `brand.*` 表單）──

export function getTenantBrand(
  tenantId: number,
): AxiosResp<'/platform/tenants/{tenant_id}/brand', 'get'> {
  return api.get(`/platform/tenants/${tenantId}/brand`)
}

/**
 * `values` 只接受後端 `utils/brand_catalog.py::BRAND_CONFIG_KEYS` 內的 key（DEV-18）；
 * 值傳 `null` = 刪除該 key（回退前端 `BRANDING_DEFAULTS`），傳空字串會寫入空值。
 */
export function updateTenantBrand(
  tenantId: number,
  body: ApiBody<'/platform/tenants/{tenant_id}/brand', 'put'>,
): AxiosResp<'/platform/tenants/{tenant_id}/brand', 'put'> {
  return api.put(`/platform/tenants/${tenantId}/brand`, body)
}

// ── LINE 憑證（讀一律遮罩、寫只寫不回讀）──

export function getTenantLineConfig(
  tenantId: number,
): AxiosResp<'/platform/tenants/{tenant_id}/line-config', 'get'> {
  return api.get(`/platform/tenants/${tenantId}/line-config`)
}

export function updateTenantLineConfig(
  tenantId: number,
  body: ApiBody<'/platform/tenants/{tenant_id}/line-config', 'put'>,
): AxiosResp<'/platform/tenants/{tenant_id}/line-config', 'put'> {
  return api.put(`/platform/tenants/${tenantId}/line-config`, body)
}

// ── Email 寄件設定（讀一律遮罩、寫只寫不回讀）──

export function getTenantEmailConfig(
  tenantId: number,
): AxiosResp<'/platform/tenants/{tenant_id}/email-config', 'get'> {
  return api.get(`/platform/tenants/${tenantId}/email-config`)
}

export function updateTenantEmailConfig(
  tenantId: number,
  body: ApiBody<'/platform/tenants/{tenant_id}/email-config', 'put'>,
): AxiosResp<'/platform/tenants/{tenant_id}/email-config', 'put'> {
  return api.put(`/platform/tenants/${tenantId}/email-config`, body)
}

/** logo 上傳（multipart，欄位名 `file`）。SVG 後端不放行（DEV-17 安全決定 2）。 */
export function uploadTenantLogo(
  tenantId: number,
  file: File,
): AxiosResp<'/platform/tenants/{tenant_id}/logo', 'post'> {
  const form = new FormData()
  form.append('file', file)
  // 沿用 repo 既有上傳慣例（announcements / activity 等）：**必須**顯式覆寫成
  // multipart/form-data——instance 預設是 application/json，axios 的 transformRequest
  // 看到 JSON content-type 會把 FormData 轉成 JSON 送出（檔案就沒了）。boundary 由
  // 瀏覽器在 xhr adapter 補上。
  return api.post(`/platform/tenants/${tenantId}/logo`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

// ── 跨分校報表（全部唯讀）──

export type PlatformReportCategory =
  | 'overview'
  | 'finance'
  | 'attendance'
  | 'salary-cost'
  | 'recruitment'
  | 'students'
  | 'hr'
  | 'activities'
  | 'health'

export interface PlatformReportQuery {
  year?: number
  month?: number | null
  school_year?: number | null
  semester?: number
  tenant_ids?: number[] | null
  force_refresh?: boolean
}

/**
 * 五支報表共用一支 client：後端 query 參數各異（overview/finance 吃 year+month、
 * attendance/salary-cost 吃 year、recruitment 吃 school_year），故 params 在呼叫端
 * 組好再傳。`tenant_ids` 省略 = 全部 active 分校（後端預設）。
 */
export function getPlatformReport(
  category: PlatformReportCategory,
  params: PlatformReportQuery,
): AxiosResp<'/platform/reports/overview', 'get'> {
  return api.get(`/platform/reports/${category}`, { params })
}

// ── 角色同步 ──

/**
 * `dry_run` 預設 **true**（CT-P-05）：UI 一律先預覽 `results` 再實跑。
 * 回應為單一聚合物件 `RoleSyncReport`，逐 target 資料在 `results`（CT-FIX-07）。
 */
export function syncRoles(
  body: ApiBody<'/platform/roles/sync', 'post'>,
): AxiosResp<'/platform/roles/sync', 'post'> {
  return api.post('/platform/roles/sync', body)
}

// ── 跨租戶稽核 ──

/**
 * `tenant_id` **必填**：`<id>` 走 pin（不告警），`'all'` 走 bypass 且
 * **刻意進高風險告警通道**（CT-P-07）——UI 必須有二次確認。
 */
export function getPlatformAudit(
  params: ApiQuery<'/platform/audit', 'get'>,
): AxiosResp<'/platform/audit', 'get'> {
  return api.get('/platform/audit', { params })
}
