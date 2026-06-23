import { ref } from 'vue'
import { getPublicCoursesAvailability } from '@/api/activityPublic'

export function useActivityAvailability() {
  const availability = ref<Record<string, number>>({})
  const secondsSinceUpdate = ref<number | null>(null)
  const lastUpdate = ref<number | null>(null)
  let availabilityTimer: ReturnType<typeof setInterval> | null = null
  let tickTimer: ReturnType<typeof setInterval> | null = null
  let _visibilityCleanup: (() => void) | null = null

  async function refresh() {
    try {
      const res = await getPublicCoursesAvailability()
      availability.value = res.data
      lastUpdate.value = Date.now()
      if (secondsSinceUpdate.value === null) secondsSinceUpdate.value = 0
    } catch {
      // 靜默失敗
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

  return { availability, secondsSinceUpdate, lastUpdate, refresh, startPolling, stopPolling }
}
