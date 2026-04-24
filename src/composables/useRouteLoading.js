import { ref } from 'vue'

const routeLoading = ref(false)
const LOADING_DELAY_MS = 120

let pendingNavigations = 0
let loadingTimer = null

function clearLoadingTimer() {
  if (!loadingTimer) return
  window.clearTimeout(loadingTimer)
  loadingTimer = null
}

export function startRouteLoading() {
  pendingNavigations += 1

  if (routeLoading.value || loadingTimer) return

  loadingTimer = window.setTimeout(() => {
    loadingTimer = null
    if (pendingNavigations > 0) {
      routeLoading.value = true
    }
  }, LOADING_DELAY_MS)
}

export function finishRouteLoading() {
  pendingNavigations = Math.max(0, pendingNavigations - 1)

  if (pendingNavigations > 0) return

  clearLoadingTimer()
  routeLoading.value = false
}

export function resetRouteLoading() {
  pendingNavigations = 0
  clearLoadingTimer()
  routeLoading.value = false
}

export function useRouteLoading() {
  return {
    routeLoading,
  }
}
