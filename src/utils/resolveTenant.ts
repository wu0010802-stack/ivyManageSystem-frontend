/**
 * 相容別名：實作在 `@/utils/tenant`。
 *
 * 4d 的 workflow prompt 以 `src/utils/resolveTenant.ts` 稱呼本模組，而
 * `03-final/frontend-core.md` §2.11 的變更表寫的是 `src/utils/tenant.ts`。
 * 為避免跨 agent（fb / hq）import 路徑對不上，兩個路徑都可用；**唯一實作**
 * 在 `tenant.ts`，本檔僅 re-export，不得加任何邏輯。
 */
export {
  TENANT_HEADER,
  TENANT_ERROR_CODES,
  isTenantModeEnabled,
  resolveTenant,
  tenantSlug,
  requireTenantSlug,
  tenantSlugOrPlaceholder,
  tenantHeaders,
  buildTenantOrigin,
  tenantErrorCodeOf,
  _resetTenantCacheForTests,
} from '@/utils/tenant'
export type { TenantRef, TenantErrorCode } from '@/utils/tenant'
