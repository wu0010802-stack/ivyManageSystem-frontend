/**
 * 首頁「待你處理」與待辦 tab 共用的讀取層。
 *
 * - 待辦清單本身來自 home/summary（useHomeSummary，同 key 共用快取）
 * - 入學文件待簽數、進行中的臨時接送授權數，summary 都沒有聚合，各打一支輕量
 *   API；改用 useCachedAsync 後首頁與待辦頁共用同一份快取並 dedupe in-flight，
 *   不再兩頁各打一次（原本 TodayView / AdminListView 各自 onMounted fetch）。
 *
 * 兩支輔助請求失敗一律視為 0，不擋清單其他項目（與改版前行為一致）；快取鍵掛在
 * `parent/` 前綴下，登出時 useParentLogout 的 invalidateCachedAsync('parent/')
 * 會一併清掉。
 */
import { computed } from 'vue'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { listMySignRequests } from '../api/signDocuments'
import { listPickupAuthorizations } from '../api/pickup'
import { buildPendingItems } from '../utils/pendingItems'
import { useHomeSummary } from './useHomeSummary'

export const ENROLL_DOCS_CACHE_KEY = 'parent/pending/enroll-docs'
export const PICKUP_ACTIVE_CACHE_KEY = 'parent/pending/pickup-active'

export function usePendingItems() {
  const home = useHomeSummary()

  const { data: enrollDocCount, refresh: refreshEnrollDocs } = useCachedAsync<number>(
    ENROLL_DOCS_CACHE_KEY,
    async () => {
      try {
        const { data } = await listMySignRequests()
        return data.pending.length
      } catch {
        return 0
      }
    },
    { ttl: 60_000 },
  )

  const { data: pickupActiveCount, refresh: refreshPickupActive } = useCachedAsync<number>(
    PICKUP_ACTIVE_CACHE_KEY,
    async () => {
      try {
        const res = await listPickupAuthorizations({ status: 'active' })
        return ((res.data as { items?: unknown[] })?.items || []).length
      } catch {
        return 0
      }
    },
    { ttl: 60_000 },
  )

  const items = computed(() =>
    buildPendingItems({
      summary: home.summary.value,
      enrollDocCount: enrollDocCount.value ?? 0,
    }),
  )

  async function refreshAll(force = true): Promise<void> {
    await Promise.all([
      home.refresh(force),
      refreshEnrollDocs(force),
      refreshPickupActive(force),
    ])
  }

  return {
    ...home,
    items,
    enrollDocCount: computed(() => enrollDocCount.value ?? 0),
    pickupActiveCount: computed(() => pickupActiveCount.value ?? 0),
    refreshAll,
  }
}
