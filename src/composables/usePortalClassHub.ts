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
  // inflight 去重要帶上 classroomId：否則切班當下若前一輪請求仍在飛，
  // watch 觸發的 refresh() 會沿用舊班級的 promise，resolve 後把舊班資料塞回
  // data（下拉選單看起來「自己彈回去」）。key 用 undefined 代表未指定班級。
  let inflightKey: number | null | undefined = undefined
  // data.value 目前對應的 key，用來判斷「同班重試失敗」（保留舊資料，避免
  // 網路抖動就閃爍清空）還是「切班後失敗」（清空，見下方 .catch）。
  let currentDataKey: number | null | undefined = undefined
  // 遞增序號：只有序號等於「當前最新一次呼叫」的回應才能寫入 data/error/
  // loading。防止舊班的回應在新班之後才 resolve，把畫面蓋回舊班
  // （2026-09-14 審查 P1：inflightKey 去重只防止重複發出同 key 請求，
  // 不防止舊請求的回應在新請求之後落地時覆寫狀態）。
  let requestSeq = 0

  async function refresh() {
    const key = classroomId?.value ?? undefined
    if (inflight && inflightKey === key) return inflight
    const seq = ++requestSeq
    loading.value = true
    error.value = null
    inflightKey = key
    const p = getTodayHub(key)
      .then((d) => {
        if (seq === requestSeq) {
          data.value = d
          currentDataKey = key
        }
        return d
      })
      .catch((e) => {
        if (seq === requestSeq) {
          error.value = e
          // 切班後失敗：舊資料屬於別的班級，繼續顯示會讓標題／功能格深連結
          // 錯配到舊班。同班重試失敗則保留舊資料（避免每次抖動就閃爍清空）。
          if (key !== currentDataKey) {
            data.value = null
            currentDataKey = key
          }
        }
        throw e
      })
      .finally(() => {
        if (seq === requestSeq) {
          loading.value = false
          inflight = null
        }
      })
    inflight = p
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

  // 切換班級要立刻重抓；inflight 去重在 refresh 內按 classroomId 分key，
  // 短時間連按同一班不會打爆後端，切班當下也不會誤用舊班的 inflight promise。
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
