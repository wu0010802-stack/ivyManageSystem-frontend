import { ref } from 'vue'
import { prefersReducedMotion } from '@/utils/reducedMotion'

/** 預設觸發閾值：拖曳距離 / 容器寬度 達此比例才視為完成手勢。 */
const DEFAULT_THRESHOLD_RATIO = 0.4

/**
 * 純手勢偵測 composable：左右拖曳超過閾值鬆手才觸發 onCommit，不含任何
 * 業務語意（不知道、也不在意鬆手後實際要做什麼，由呼叫端決定）。
 *
 * 設計重點：
 *  - 用 Pointer Events（pointerdown/move/up）一套涵蓋滑鼠與觸控，符合平板操作，
 *    不需要另外分岔 touch 事件
 *  - 閾值以「拖曳距離 / 綁定元素寬度」的比例計算（預設 40%），卡片寬度不同也適用
 *  - 未達閾值鬆手＝回彈：dragX 直接歸零，回彈的「動畫」由消費端 CSS transition
 *    負責，此 composable 只負責邏輯正確（會不會觸發 onCommit 不受動畫降級影響）
 *  - 達閾值鬆手＝觸發：onCommit() 執行當下 dragX 仍保留最後拖曳位置（供消費端
 *    判斷滑出方向做退場動畫），呼叫完才歸零
 *  - reboundInstant：掛載時偵測 prefers-reduced-motion，供消費端據此拿掉回彈的
 *    transition class（降級為無過場），純視覺開關，不影響上述判斷邏輯
 *
 * 使用方式（在卡片元件內）：
 *   const { dragX, reboundInstant, onPointerDown, onPointerMove, onPointerUp } =
 *     useSwipeToCancel({ onCommit: () => emit('cancel') })
 */
export function useSwipeToCancel({
  thresholdRatio = DEFAULT_THRESHOLD_RATIO,
  onCommit,
}: {
  thresholdRatio?: number
  onCommit: () => void
}) {
  const dragX = ref(0)
  const dragging = ref(false)
  /** true＝回彈應降級為無過場（消費端綁定 CSS transition class 用） */
  const reboundInstant = ref(false)

  let startX = 0
  let elWidth = 0
  let activePointerId: number | null = null

  function reset() {
    dragging.value = false
    dragX.value = 0
    activePointerId = null
  }

  function onPointerDown(e: PointerEvent) {
    // 已有另一根手指在拖曳中：忽略新的 pointerdown，避免劫持進行中的手勢
    // （劫持後原 pointer 的 pointerup 會因 pointerId 不符被 onPointerUp 忽略，卡死在 dragging 狀態）
    if (dragging.value && e.pointerId !== activePointerId) return

    dragging.value = true
    startX = e.clientX
    activePointerId = e.pointerId
    reboundInstant.value = prefersReducedMotion()

    const target = e.currentTarget
    if (target instanceof HTMLElement) {
      elWidth = target.offsetWidth
      target.setPointerCapture?.(e.pointerId)
    } else {
      elWidth = 0
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging.value || e.pointerId !== activePointerId) return
    dragX.value = e.clientX - startX
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging.value || e.pointerId !== activePointerId) return

    const target = e.currentTarget
    if (target instanceof HTMLElement) {
      target.releasePointerCapture?.(e.pointerId)
    }

    // 沒量到寬度（如測試環境 jsdom 無 layout）時保守視為未達閾值，避免誤觸發
    const ratio = elWidth > 0 ? Math.abs(dragX.value) / elWidth : 0
    const committed = ratio >= thresholdRatio

    dragging.value = false
    activePointerId = null

    if (committed) {
      // 觸發當下先保留 dragX（外露最終拖曳位置/方向，供消費端做「滑出畫面」動畫），呼叫完才歸零
      onCommit()
    }
    dragX.value = 0
  }

  /** pointer 被系統取消（如手勢被瀏覽器接管）時比照未達閾值回彈，不觸發 onCommit。 */
  function onPointerCancel(e: PointerEvent) {
    if (!dragging.value || e.pointerId !== activePointerId) return
    reset()
  }

  return {
    dragX,
    dragging,
    reboundInstant,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  }
}
