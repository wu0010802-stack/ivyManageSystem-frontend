import { ref, type Ref } from 'vue'
import type { PagedResult } from '@/api/_pagination'

/**
 * 封裝「靜默載入 pending 清單」的重複模式。
 *
 * 2026-08-11：改吃分頁契約（`PagedResult`）而非 AxiosResponse。除了 items 另回
 * `total` 與 `hasMore`——後端一次最多回 5000 筆，超量時 `hasMore` 為 true，
 * 呼叫端應提示使用者縮小查詢範圍，而不是讓人誤以為看到了全部待簽核項目。
 */
export function useFetchPending<T>(
  apiFn: (params: Record<string, unknown>) => Promise<PagedResult<T>>,
  defaultParams: Record<string, unknown> = { status: 'pending' },
) {
  const items = ref<T[]>([]) as Ref<T[]>
  const total = ref(0)
  const hasMore = ref(false)
  const isLoading = ref(false)

  const fetch = async () => {
    isLoading.value = true
    try {
      const res = await apiFn(defaultParams)
      items.value = Array.isArray(res?.items) ? res.items : []
      total.value = Number(res?.total ?? items.value.length)
      hasMore.value = Boolean(res?.hasMore)
    } catch {
      // 背景靜默刷新，不干擾使用者
    } finally {
      isLoading.value = false
    }
  }

  return { items, total, hasMore, fetch, isLoading }
}
