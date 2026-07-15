import { computed, ref } from 'vue'
import { getPublicCoursesAvailability } from '@/api/activityPublic'
import type { PublicActivityTermParams } from '@/api/activityPublic'

export function useActivityAvailability() {
  const availability = ref<Record<string, number>>({})
  const secondsSinceUpdate = ref<number | null>(null)
  const lastUpdate = ref<number | null>(null)
  const loading = ref(false)
  const error = ref<unknown>(null)
  const requestedTermKey = ref('')
  const loadedTermKey = ref<string | null>(null)
  let availabilityTimer: ReturnType<typeof setInterval> | null = null
  let tickTimer: ReturnType<typeof setInterval> | null = null
  let _visibilityCleanup: (() => void) | null = null
  let termParams: PublicActivityTermParams | undefined
  let refreshSeq = 0

  const ready = computed(
    () => error.value === null && loadedTermKey.value === requestedTermKey.value,
  )

  function setTerm(params?: PublicActivityTermParams) {
    const previous = termParams
      ? `${termParams.school_year}-${termParams.semester}`
      : ''
    const next = params ? `${params.school_year}-${params.semester}` : ''
    if (previous === next) return
    termParams = params ? { ...params } : undefined
    requestedTermKey.value = next
    refreshSeq += 1 // 讓前一學期尚未完成的 refresh 失效
    availability.value = {}
    loadedTermKey.value = null
    error.value = null
    loading.value = false
    lastUpdate.value = null
    secondsSinceUpdate.value = null
  }

  async function refresh() {
    const seq = ++refreshSeq
    const params = termParams ? { ...termParams } : undefined
    const termKey = requestedTermKey.value
    loading.value = true
    error.value = null
    try {
      const res = params
        ? await getPublicCoursesAvailability(params)
        : await getPublicCoursesAvailability()
      if (seq !== refreshSeq) return
      availability.value = res.data
      loadedTermKey.value = termKey
      lastUpdate.value = Date.now()
      if (secondsSinceUpdate.value === null) secondsSinceUpdate.value = 0
    } catch (err) {
      if (seq !== refreshSeq) return
      // UI 不彈全域錯誤，但保留明確失敗狀態並清掉舊名額；編輯頁據此 fail closed，
      // 避免把「尚未取得／已失效」誤當成「有名額」。
      availability.value = {}
      loadedTermKey.value = null
      error.value = err
    } finally {
      if (seq === refreshSeq) loading.value = false
    }
  }

  // trackAge：是否每秒更新 secondsSinceUpdate（給「N 秒前更新」UI 用）。
  // 兩個公開頁都沒消費 secondsSinceUpdate → 預設 false，不建每秒 tickTimer（省一個 interval）。
  function startPolling(intervalMs = 30000, { trackAge = false }: { trackAge?: boolean } = {}) {
    availabilityTimer = setInterval(refresh, intervalMs)

    function startTick() {
      if (!trackAge || tickTimer) return
      tickTimer = setInterval(() => {
        if (lastUpdate.value !== null) {
          secondsSinceUpdate.value = Math.floor((Date.now() - lastUpdate.value) / 1000)
        }
      }, 1000)
    }
    startTick()

    function handleVisibilityChange() {
      if (document.hidden) {
        if (availabilityTimer) { clearInterval(availabilityTimer); availabilityTimer = null }
        // 隱藏時一併清除 tickTimer（背景頁不需每秒更新秒數）
        if (tickTimer) { clearInterval(tickTimer); tickTimer = null }
      } else {
        refresh()
        availabilityTimer = setInterval(refresh, intervalMs)
        startTick()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    _visibilityCleanup = () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }

  function stopPolling() {
    if (availabilityTimer) { clearInterval(availabilityTimer); availabilityTimer = null }
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null }
    if (_visibilityCleanup) { _visibilityCleanup(); _visibilityCleanup = null }
  }

  return {
    availability,
    loading,
    error,
    ready,
    requestedTermKey,
    loadedTermKey,
    secondsSinceUpdate,
    lastUpdate,
    setTerm,
    refresh,
    startPolling,
    stopPolling,
  }
}
