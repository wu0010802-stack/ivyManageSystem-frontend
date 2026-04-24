import { ref } from 'vue'

const routeLoading = ref(false)
const LOADING_DELAY_MS = 120
const MIN_SHOW_MS = 400

let pendingNavigations = 0
let loadingTimer = null
let shownAt = 0
let closeTimer = null

function clearLoadingTimer() {
  if (!loadingTimer) return
  window.clearTimeout(loadingTimer)
  loadingTimer = null
}

function clearCloseTimer() {
  if (!closeTimer) return
  window.clearTimeout(closeTimer)
  closeTimer = null
}

export function startRouteLoading() {
  pendingNavigations += 1

  if (routeLoading.value || loadingTimer) return

  clearCloseTimer()
  loadingTimer = window.setTimeout(() => {
    loadingTimer = null
    if (pendingNavigations > 0) {
      routeLoading.value = true
      shownAt = Date.now()
    }
  }, LOADING_DELAY_MS)
}

export function finishRouteLoading() {
  pendingNavigations = Math.max(0, pendingNavigations - 1)

  if (pendingNavigations > 0) return

  if (!routeLoading.value) {
    clearLoadingTimer()
    return
  }

  const elapsed = Date.now() - shownAt
  if (elapsed >= MIN_SHOW_MS) {
    routeLoading.value = false
    return
  }

  clearCloseTimer()
  closeTimer = window.setTimeout(() => {
    closeTimer = null
    if (pendingNavigations === 0) {
      routeLoading.value = false
    }
  }, MIN_SHOW_MS - elapsed)
}

export function resetRouteLoading() {
  pendingNavigations = 0
  clearLoadingTimer()
  clearCloseTimer()
  routeLoading.value = false
  shownAt = 0
}

export function useRouteLoading() {
  return {
    routeLoading,
  }
}
