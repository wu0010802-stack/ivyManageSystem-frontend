import { ref } from 'vue'
import { getPublicCoursesAvailability } from '@/api/activityPublic'

export function useActivityAvailability() {
  const availability = ref({})
  const secondsSinceUpdate = ref(null)
  const lastUpdate = ref(null)
  let availabilityTimer = null
  let tickTimer = null
  let _visibilityCleanup = null

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

  function startPolling(intervalMs = 30000) {
    availabilityTimer = setInterval(refresh, intervalMs)
    tickTimer = setInterval(() => {
      if (lastUpdate.value !== null) {
        secondsSinceUpdate.value = Math.floor((Date.now() - lastUpdate.value) / 1000)
      }
    }, 1000)

    function handleVisibilityChange() {
      if (document.hidden) {
        if (availabilityTimer) { clearInterval(availabilityTimer); availabilityTimer = null }
      } else {
        refresh()
        availabilityTimer = setInterval(refresh, intervalMs)
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
