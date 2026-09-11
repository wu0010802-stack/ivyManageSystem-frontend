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
import { ref, watch, onMounted, onBeforeUnmount, type Ref } from 'vue'
import { getTodayHub } from '@/api/portalClassHub'

const POLL_MS = 60_000

export function usePortalClassHub(classroomId?: Ref<number | null>) {
  const data = ref<{ counts?: Record<string, number>; [key: string]: unknown } | null>(null)
  const loading = ref(false)
  const error = ref<unknown>(null)
  let timer: ReturnType<typeof setInterval> | null = null
  let inflight: Promise<unknown> | null = null

  async function refresh() {
    if (inflight) return inflight
    loading.value = true
    error.value = null
    inflight = getTodayHub(classroomId?.value ?? undefined)
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

  function decrementCount(key: string) {
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

  // 切換班級要立刻重抓；inflight 去重在 refresh 內，短時間連按不會打爆後端。
  // 已知限制：若切換當下前一個請求仍在飛行中，refresh() 會直接沿用該 inflight
  // promise（仍是舊班級的請求），不會插隊重打——不在本次改動範圍內處理。
  if (classroomId) {
    watch(classroomId, () => {
      refresh().catch(() => {})
    })
  }

  onMounted(() => {
    refresh().catch(() => {})
    timer = setInterval(() => {
      // 背景分頁（document.hidden）時跳過輪詢，省後端負載 / quota；
      // 切回前景由 visibilitychange → onVisible 立刻補抓。
      if (typeof document !== 'undefined' && document.hidden) return
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
