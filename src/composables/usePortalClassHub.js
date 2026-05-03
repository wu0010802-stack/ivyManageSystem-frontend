/**
 * 教師工作台 composable：60s 輪詢、visibilityChange 重新拉、inflight 去重、
 * 提交動作後 decrement 對應 count（避免立刻重打 API）。
 *
 * 對外提供：
 * - data: ref({...ClassHubTodayResponse} | null)
 * - loading: ref<boolean>
 * - error: ref<Error|null>
 * - refresh(): Promise — 強制重抓
 * - decrementCount(key: string): void — sheet 提交成功後呼叫，
 *   key ∈ ClassHubCounts field（如 'medications_pending', 'attendance_pending'）
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { getTodayHub } from '@/api/portalClassHub'

const POLL_MS = 60_000

export function usePortalClassHub() {
  const data = ref(null)
  const loading = ref(false)
  const error = ref(null)
  let timer = null
  let inflight = null

  async function refresh() {
    if (inflight) return inflight
    loading.value = true
    error.value = null
    inflight = getTodayHub()
      .then((d) => {
        data.value = d
        return d
      })
      .catch((e) => {
        error.value = e
        throw e
      })
      .finally(() => {
        loading.value = false
        inflight = null
      })
    return inflight
  }

  function decrementCount(key) {
    if (!data.value) return
    const counts = data.value.counts
    if (!counts) return
    if (typeof counts[key] === 'number' && counts[key] > 0) {
      counts[key] -= 1
    }
  }

  function onVisible() {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      refresh().catch(() => {})
    }
  }

  onMounted(() => {
    refresh().catch(() => {})
    timer = setInterval(() => {
      refresh().catch(() => {})
    }, POLL_MS)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible)
    }
  })

  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisible)
    }
  })

  return { data, loading, error, refresh, decrementCount }
}
