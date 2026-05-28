/**
 * useIntegrationsHealth — 後台首頁外部整合健康徽章資料
 *
 * 對應 backend GET /api/internal/integrations/health（Phase 4 P1 resilience）。
 * 三 breaker state（LINE / Supabase / external_http）+ LINE token healthy +
 * LINE retry pending / final_failed_24h + Supabase pending_uploads count。
 *
 * - 60s TTL；isStale 後元件可選 refresh 按鈕觸發
 * - AUDIT_LOGS 權限 gate（caller 自查；本 composable 不主動 check 避免
 *   route 切換時殘留 cache）
 * - 失敗時 data 保留舊值，error 物件給 UI（不破壞首頁渲染）
 */
import { useCachedAsync } from './useCachedAsync'
import { getIntegrationsHealth } from '@/api/integrationsHealth'
import type { ApiResponse } from '@/api/_generated/typed'

export type IntegrationsHealth = ApiResponse<'/internal/integrations/health', 'get'>

const CACHE_KEY = 'integrations-health'
const TTL_MS = 60_000  // 1 min — breaker state change 慢，無需頻繁 poll

export function useIntegrationsHealth() {
  return useCachedAsync<IntegrationsHealth>(
    CACHE_KEY,
    async () => {
      const resp = await getIntegrationsHealth()
      return resp.data
    },
    { ttl: TTL_MS },
  )
}
