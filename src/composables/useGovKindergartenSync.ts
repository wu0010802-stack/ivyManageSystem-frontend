/**
 * useGovKindergartenSync — 教育部幼兒園公開資料同步狀態 + 5 秒輪詢
 *
 * 拆分自 RecruitmentAddressHeatmap.vue（2026-07-12 元件邊界拆分），行為零改動：
 * - handleGovSync() 觸發後端背景同步，每 5 秒輪詢 sync-status 直到完成
 * - 完成時透過 options.onSyncComplete 回呼（原元件用來串接「自動補全座標」）
 * - 90 天視為過期（isGovSyncStale），供 caller 在 onMounted 決定是否自動觸發
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { getGovKindergartensSyncStatus, syncGovKindergartens } from '@/api/recruitment'

const GOV_SYNC_STALE_DAYS = 90

export function useGovKindergartenSync(options: { onSyncComplete?: () => void } = {}) {
  const govSyncing = ref<boolean>(false)
  const govSyncedAt = ref<string | null>(null)
  const govSyncMessage = ref<string>('')

  const fetchGovSyncStatus = async () => {
    try {
      const res = await getGovKindergartensSyncStatus()
      govSyncedAt.value = res.data?.last_synced_at ?? null
      govSyncing.value = res.data?.sync_in_progress ?? false
      if (res.data?.last_sync_status === 'error') {
        govSyncMessage.value = res.data?.last_sync_message ?? '同步失敗'
      } else {
        govSyncMessage.value = ''
      }
    } catch {
      // 靜默失敗，不影響主功能
    }
  }

  let govSyncPoll: ReturnType<typeof setInterval> | null = null

  const handleGovSync = async () => {
    if (govSyncing.value) return
    try {
      govSyncing.value = true
      govSyncMessage.value = ''
      await syncGovKindergartens(true)
      // 背景作業已啟動，每 5 秒輪詢一次直到完成
      govSyncPoll = setInterval(async () => {
        await fetchGovSyncStatus()
        if (!govSyncing.value) {
          if (govSyncPoll !== null) clearInterval(govSyncPoll)
          govSyncPoll = null
          // 教育部同步完成後，通知 caller 檢查是否需要補全座標
          options.onSyncComplete?.()
        }
      }, 5000)
    } catch (e) {
      govSyncing.value = false
      govSyncMessage.value = '觸發失敗，請稍後再試'
    }
  }

  const isGovSyncStale = () => {
    if (!govSyncedAt.value) return true // 從未同步過
    const lastSync = new Date(govSyncedAt.value)
    const daysSince = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60 * 24)
    return daysSince >= GOV_SYNC_STALE_DAYS
  }

  const govSyncedAtLabel = computed(() => {
    if (!govSyncedAt.value) return null
    const d = new Date(govSyncedAt.value)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })

  onBeforeUnmount(() => {
    if (govSyncPoll) {
      clearInterval(govSyncPoll)
      govSyncPoll = null
    }
  })

  return {
    govSyncing,
    govSyncedAt,
    govSyncMessage,
    govSyncedAtLabel,
    fetchGovSyncStatus,
    handleGovSync,
    isGovSyncStale,
  }
}
