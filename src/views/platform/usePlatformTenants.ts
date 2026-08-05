/**
 * 總部 console 共用的租戶清單載入器。
 *
 * 三個頁面（總覽 / 分校管理 / 角色同步 / 報表篩選）都要同一份清單，走
 * `useCachedAsync` 共用 in-memory 條目：切頁不重打，切身分（含 acting tenant 變更）
 * 由 `advanceAdminSession()` → `invalidateCachedAsync()` 全清。
 *
 * key 走 `platformCacheKey()`（Host 租戶 + acting tenant 兩層前綴，見
 * `@/composables/useActingTenant`）。清單本身與 acting tenant 無關，故顯式傳
 * `null` 讓所有頁共用同一條目——**不要**用當下 acting id，否則每切一次分校就多一份
 * 相同內容的快取。
 */
import { computed } from 'vue'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { platformCacheKey } from '@/composables/useActingTenant'
import { listTenants, type TenantSummary } from '@/api/platform'

export interface UsePlatformTenantsOptions {
  /** 只要分校（排除 hq 自己）。報表/角色同步一律 true。 */
  schoolsOnly?: boolean
  ttl?: number
}

export function usePlatformTenants(options: UsePlatformTenantsOptions = {}) {
  const { schoolsOnly = false, ttl = 60_000 } = options

  const cacheKey = platformCacheKey(`tenants:list:${schoolsOnly ? 'school' : 'all'}`, null)

  const { data, error, pending, refresh } = useCachedAsync<TenantSummary[]>(
    cacheKey,
    async () => {
      const res = await listTenants(schoolsOnly ? { kind: 'school' } : undefined)
      return res.data?.items ?? []
    },
    { ttl },
  )

  const tenants = computed<TenantSummary[]>(() => data.value ?? [])
  /** 報表/角色同步的可選目標：排除總部，且封存的分校不再列入操作對象。 */
  const selectableSchools = computed(() =>
    tenants.value.filter((t) => t.kind === 'school' && t.status !== 'archived'),
  )

  return { tenants, selectableSchools, error, pending, refresh }
}
