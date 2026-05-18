/**
 * 家長 App 下拉刷新（Pull-to-Refresh）composable。
 *
 * 設計重點：
 *  - 只在「scroll container 已在最頂端」才允許開始下拉，避免吃掉中段滾動
 *  - 阻尼曲線：dy * (0.55 - dy / 2400)，讓拉得越遠越慢，給 iOS bounce 觀感
 *  - 觸發門檻 64px，鬆手後若已過 → 停在 56px loading；未過 → snap 回 0
 *  - 阻止瀏覽器原生 overscroll-bounce 造成「下拉時整頁跟著彈」：
 *      * touchmove 必須 `{ passive: false }` 才能 e.preventDefault()
 *      * 但只在「真正進入下拉狀態（armed && dy > 0）」才 prevent，
 *        否則正常往上滑會被卡住
 *  - reduced-motion：不做動畫，直接觸發 refresh（也不顯示 transform）
 *
 * 使用方式（建議透過 <PullToRefresh> 元件包裝，不直接呼叫 composable）：
 *   const { rootRef, pullDistance, refreshing, armed } = usePullToRefresh({
 *     onRefresh: async () => { await fetchData() },
 *     threshold: 64,
 *   })
 *
 * 不接管的事：
 *  - indicator 渲染由 component 處理（保持邏輯純粹）
 *  - 如果頁面有自己的滾動容器（不是 window），需傳 `scrollEl: () => myEl`
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

const DEFAULT_THRESHOLD = 64
const SNAP_HEIGHT = 56
const MAX_PULL = 140

function dampen(dy) {
  if (dy <= 0) return 0
  // 阻尼：起始 0.55，超過 200px 後逐漸接近 0
  const factor = Math.max(0.15, 0.55 - dy / 2400)
  return Math.min(MAX_PULL, dy * factor)
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function usePullToRefresh({
  onRefresh,
  threshold = DEFAULT_THRESHOLD,
  scrollEl = null,
  enabled = () => true,
} = {}) {
  const rootRef = ref(null)
  const pullDistance = ref(0)
  const refreshing = ref(false)
  // armed = touchstart 時 scroll 在最頂、且尚未取消，才允許進入 pulling
  const armed = ref(false)

  let startY = 0
  let lastY = 0
  let pulling = false

  function getScrollTop() {
    const el = typeof scrollEl === 'function' ? scrollEl() : scrollEl
    if (el && typeof el.scrollTop === 'number') return el.scrollTop
    if (typeof window === 'undefined') return 0
    return window.scrollY || document.documentElement.scrollTop || 0
  }

  function onTouchStart(e) {
    if (refreshing.value || !enabled()) {
      armed.value = false
      return
    }
    if (getScrollTop() > 0) {
      armed.value = false
      return
    }
    if (!e.touches || e.touches.length === 0) return
    armed.value = true
    pulling = false
    startY = e.touches[0].clientY
    lastY = startY
  }

  function onTouchMove(e) {
    if (!armed.value || refreshing.value) return
    if (!e.touches || e.touches.length === 0) return
    const y = e.touches[0].clientY
    const dy = y - startY

    // 往上滑：清除狀態（避免吃掉正常滾動）
    if (dy <= 0) {
      if (pulling) {
        pulling = false
        pullDistance.value = 0
      }
      return
    }

    // 期間頁面被 user scroll 走了（不太常見但要防）：取消
    if (getScrollTop() > 0) {
      armed.value = false
      pulling = false
      pullDistance.value = 0
      return
    }

    pulling = true
    lastY = y

    // 阻止預設下拉（iOS overscroll bounce / Android Chrome refresh）
    if (e.cancelable) e.preventDefault()

    pullDistance.value = dampen(dy)
  }

  function onTouchEnd() {
    if (!armed.value) return
    armed.value = false
    if (!pulling) {
      pullDistance.value = 0
      return
    }
    pulling = false

    if (pullDistance.value >= threshold) {
      triggerRefresh()
    } else {
      pullDistance.value = 0
    }
  }

  function onTouchCancel() {
    armed.value = false
    pulling = false
    pullDistance.value = 0
  }

  async function triggerRefresh() {
    if (refreshing.value) return
    refreshing.value = true
    pullDistance.value = SNAP_HEIGHT

    if (prefersReducedMotion()) {
      // reduced-motion：直接執行，UI 不停留
      pullDistance.value = 0
    }

    try {
      if (typeof onRefresh === 'function') {
        await onRefresh()
      }
    } catch (err) {
      // 不吞錯：讓父層 toast / log，這裡只負責收尾 UI
      // eslint-disable-next-line no-console
      console.warn('[PullToRefresh] refresh failed:', err)
    } finally {
      refreshing.value = false
      pullDistance.value = 0
    }
  }

  function bind() {
    const el = rootRef.value
    if (!el) return
    // touchstart/touchend 用 passive: true（不需 prevent）；touchmove 必須 false
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchCancel, { passive: true })
  }

  function unbind() {
    const el = rootRef.value
    if (!el) return
    el.removeEventListener('touchstart', onTouchStart)
    el.removeEventListener('touchmove', onTouchMove)
    el.removeEventListener('touchend', onTouchEnd)
    el.removeEventListener('touchcancel', onTouchCancel)
  }

  onMounted(bind)
  onBeforeUnmount(unbind)

  return {
    rootRef,
    pullDistance,
    refreshing,
    armed,
    threshold,
    /** 測試用：直接觸發 refresh */
    _triggerRefresh: triggerRefresh,
  }
}
