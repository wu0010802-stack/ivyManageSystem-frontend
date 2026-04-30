import { ref } from 'vue'

/**
 * 路由載入狀態：兩種視覺呈現分流
 *  - **冷啟動 / session restore**：全頁 logo + 旋轉框（明確告知「正在初始化」）
 *  - **一般換頁**：僅頂部 2px 細進度條（不蓋住既有資料、不打斷工作流）
 *
 *  `firstNavigationDone` 一旦翻轉為 true 就不再倒回；之後所有路由切換都走細進度條。
 *  Why: 過去每次換頁都全頁遮罩，造成換頁感官疲勞，且遮住標題、篩選與既有資料，讓使用者
 *  誤以為「資料消失了」。把日常導航降級為頂部細條後仍保有 navigating 視覺信號。
 *
 *  flag 而非 counter：vue-router 一次只會有一個進行中的導航，beforeEach 連續觸發
 *  next(redirect) 時 flag 保持冪等（多次 start 不會疊加），最終 afterEach 一次 finish
 *  即可正確關閉。
 */

const routeLoading = ref(false) // 冷啟動 / session restore 用全頁遮罩
const routeProgress = ref(false) // 一般換頁用頂部細條
const firstNavigationDone = ref(false)

const LOADING_DELAY_MS = 120
const MIN_SHOW_MS = 400
const PROGRESS_DELAY_MS = 80
const PROGRESS_MIN_SHOW_MS = 220

let loadingTimer = null
let shownAt = 0
let closeTimer = null

let progressTimer = null
let progressShownAt = 0
let progressCloseTimer = null

function clearTimer(handle) {
  if (handle) window.clearTimeout(handle)
  return null
}

function startFullPage() {
  if (routeLoading.value || loadingTimer) return
  closeTimer = clearTimer(closeTimer)
  loadingTimer = window.setTimeout(() => {
    loadingTimer = null
    routeLoading.value = true
    shownAt = Date.now()
  }, LOADING_DELAY_MS)
}

function finishFullPage() {
  if (loadingTimer && !routeLoading.value) {
    loadingTimer = clearTimer(loadingTimer)
    return
  }
  if (!routeLoading.value) return
  const elapsed = Date.now() - shownAt
  if (elapsed >= MIN_SHOW_MS) {
    routeLoading.value = false
    return
  }
  closeTimer = clearTimer(closeTimer)
  closeTimer = window.setTimeout(() => {
    closeTimer = null
    routeLoading.value = false
  }, MIN_SHOW_MS - elapsed)
}

function startProgress() {
  if (routeProgress.value || progressTimer) return
  progressCloseTimer = clearTimer(progressCloseTimer)
  progressTimer = window.setTimeout(() => {
    progressTimer = null
    routeProgress.value = true
    progressShownAt = Date.now()
  }, PROGRESS_DELAY_MS)
}

function finishProgress() {
  if (progressTimer && !routeProgress.value) {
    progressTimer = clearTimer(progressTimer)
    return
  }
  if (!routeProgress.value) return
  const elapsed = Date.now() - progressShownAt
  if (elapsed >= PROGRESS_MIN_SHOW_MS) {
    routeProgress.value = false
    return
  }
  progressCloseTimer = clearTimer(progressCloseTimer)
  progressCloseTimer = window.setTimeout(() => {
    progressCloseTimer = null
    routeProgress.value = false
  }, PROGRESS_MIN_SHOW_MS - elapsed)
}

export function startRouteLoading() {
  if (firstNavigationDone.value) {
    startProgress()
  } else {
    startFullPage()
  }
}

export function finishRouteLoading() {
  if (firstNavigationDone.value) {
    finishProgress()
  } else {
    finishFullPage()
    firstNavigationDone.value = true
  }
}

export function resetRouteLoading() {
  loadingTimer = clearTimer(loadingTimer)
  closeTimer = clearTimer(closeTimer)
  progressTimer = clearTimer(progressTimer)
  progressCloseTimer = clearTimer(progressCloseTimer)
  routeLoading.value = false
  routeProgress.value = false
  shownAt = 0
  progressShownAt = 0
}

/**
 * 測試用：把首次導航狀態還原到 boot 階段。production code 一旦翻轉就應永遠 true。
 */
export function __resetFirstNavigationForTests() {
  firstNavigationDone.value = false
  resetRouteLoading()
}

export function useRouteLoading() {
  return {
    routeLoading,
    routeProgress,
    firstNavigationDone,
  }
}
