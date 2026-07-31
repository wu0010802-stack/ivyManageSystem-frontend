import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { publicConfirmPromotion, publicDeclinePromotion } from '@/api/activityPublic'
import { normalizeMobile } from '@/utils/phone'
import {
  formatTaipeiDateTimeMinute,
  parseTaipeiDateTime,
} from '@/utils/format'
import type {
  CourseEntry,
  QueryCredentials,
  QueryHydrationGuard,
  QueryResult,
} from './usePublicRegistrationQuery'

/**
 * F4（2026-07-12）：從 ActivityPublicQueryView 抽出的「候補已升正式待確認」動作。
 *
 * 確認/放棄成功後以「當前查詢模式」重新查詢刷新（token 模式用 token 查詢），避免
 * 硬用三欄查詢在多筆跨學期 active 報名時跳到別的學期報名。刷新失敗（公開查詢限流
 * / 網路抖動）不可回落到外層 catch 誤報「確認/放棄失敗」——mutation 已成功
 * （audit C-2，2026-07-02）。
 */
export function usePromotionActions({
  queryResult,
  activeQueryCredentials,
  activeQueryToken,
  refetchCurrent,
  createHydrationGuard,
  hydrateResult,
  showToast,
}: {
  queryResult: Ref<QueryResult | null>
  activeQueryCredentials: Ref<QueryCredentials | null>
  activeQueryToken: ComputedRef<string | null>
  refetchCurrent: (
    phoneOverride?: string,
    credentialsOverride?: QueryCredentials,
  ) => Promise<QueryResult>
  createHydrationGuard: () => QueryHydrationGuard | null
  hydrateResult: (
    data: QueryResult,
    credentials?: QueryCredentials,
    guard?: QueryHydrationGuard,
  ) => boolean
  showToast: (message: string, type?: string, duration?: number) => void
}) {
  // 候補已升正式待確認清單（供獨立確認區塊使用）
  const pendingPromotions = computed(() => {
    if (!queryResult.value) return []
    return (queryResult.value.courses || []).filter(
      (c) => c.status === 'promoted_pending' && c.confirm_deadline,
    )
  })

  function formatDeadline(iso: string | null | undefined): string {
    return formatTaipeiDateTimeMinute(iso)
  }

  function formatCountdown(iso: string | null | undefined): string {
    if (!iso) return ''
    const deadline = parseTaipeiDateTime(iso)
    if (!deadline) return ''
    const diffMs = deadline.getTime() - Date.now()
    if (diffMs <= 0) return '已逾期'
    const hours = Math.floor(diffMs / 3600000)
    const mins = Math.floor((diffMs % 3600000) / 60000)
    return hours >= 1 ? `剩 ${hours} 小時` : `剩 ${mins} 分鐘`
  }

  const promotionSubmitting = ref<number | null>(null)

  async function handleConfirmPromotion(item: CourseEntry) {
    // 同一筆報名的候補操作會改容量與後續遞補；任何一門處理中時，全區只允許
    // 一個 mutation，避免 A 課與 B 課並發後刷新順序互蓋。
    if (promotionSubmitting.value !== null) return
    if (item.course_id == null) {
      showToast('課程資料不完整，請重新查詢', 'error')
      return
    }
    const credentials = activeQueryCredentials.value
    if (!credentials) {
      showToast('查詢憑證已失效，請重新查詢', 'error')
      return
    }
    const guard = createHydrationGuard()
    if (!guard) {
      showToast('查詢結果已變更，請重新操作', 'error')
      return
    }
    promotionSubmitting.value = item.course_id
    try {
      const phonePayload = normalizeMobile(credentials.parent_phone)
      const res = await publicConfirmPromotion(queryResult.value!.id, item.course_id!, {
        name: queryResult.value!.name,
        birthday: queryResult.value!.birthday || credentials.birthday,
        parent_phone: phonePayload,
        // 資安 #5：token-bearing 報名確認候補需帶 query_token（舊報名為 null）
        query_token: activeQueryToken.value ?? undefined,
      })
      showToast((res as { data?: { message?: string } })?.data?.message || '已確認升為正式', 'success')
      // 重新查詢以更新狀態：沿用當前查詢模式（token 模式用 token 查詢），避免硬用
      // 三欄查詢在多筆跨學期 active 報名時跳到別的學期報名。
      // 內層 try：mutation 已成功，刷新失敗（公開查詢限流 / 網路抖動）不可落到
      // 外層 catch 誤報「確認失敗」——家長會重按吃 409（audit C-2，2026-07-02）
      try {
        hydrateResult(
          await refetchCurrent(phonePayload, guard.credentials),
          undefined,
          guard,
        )
      } catch {
        showToast('已確認成功，但頁面刷新失敗，請稍後重新查詢查看最新狀態', 'warning', 6000)
      }
    } catch (err) {
      showToast((err as { response?: { data?: { detail?: string } } }).response?.data?.detail || '確認失敗', 'error')
    } finally {
      promotionSubmitting.value = null
    }
  }

  async function handleDeclinePromotion(item: CourseEntry) {
    // 2026-07-31 稽核：原本直接 return，家長在另一門候補處理中時按「放棄」完全沒反應
    // （連確認框都不會出現），無從判斷名額到底釋出了沒。
    if (promotionSubmitting.value !== null) {
      showToast('另一筆候補正在處理中，請稍候再試', 'warning')
      return
    }
    if (item.course_id == null) {
      showToast('課程資料不完整，請重新查詢', 'error')
      return
    }
    if (!window.confirm(`確定要放棄「${item.name}」的正式名額？\n放棄後將遞補給下一位候補，無法復原。`)) {
      return
    }
    const credentials = activeQueryCredentials.value
    if (!credentials) {
      showToast('查詢憑證已失效，請重新查詢', 'error')
      return
    }
    const guard = createHydrationGuard()
    if (!guard) {
      showToast('查詢結果已變更，請重新操作', 'error')
      return
    }
    promotionSubmitting.value = item.course_id
    try {
      const phonePayload = normalizeMobile(credentials.parent_phone)
      const res = await publicDeclinePromotion(queryResult.value!.id, item.course_id!, {
        name: queryResult.value!.name,
        birthday: queryResult.value!.birthday || credentials.birthday,
        parent_phone: phonePayload,
        // 資安 #5：token-bearing 報名放棄候補需帶 query_token（舊報名為 null）
        query_token: activeQueryToken.value ?? undefined,
      })
      showToast((res as { data?: { message?: string } })?.data?.message || '已放棄該名額', 'warning')
      // 沿用當前查詢模式刷新（同 handleConfirmPromotion），避免三欄查詢跳學期。
      // 內層 try：同 confirm——mutation 已成功，刷新失敗不可誤報「放棄失敗」
      try {
        hydrateResult(
          await refetchCurrent(phonePayload, guard.credentials),
          undefined,
          guard,
        )
      } catch {
        showToast('已放棄成功，但頁面刷新失敗，請稍後重新查詢查看最新狀態', 'warning', 6000)
      }
    } catch (err) {
      showToast((err as { response?: { data?: { detail?: string } } }).response?.data?.detail || '放棄失敗', 'error')
    } finally {
      promotionSubmitting.value = null
    }
  }

  return {
    pendingPromotions,
    promotionSubmitting,
    formatDeadline,
    formatCountdown,
    handleConfirmPromotion,
    handleDeclinePromotion,
  }
}
