import { ref } from 'vue'
import { prefersReducedMotion } from '@/utils/reducedMotion'

/** 露出按鈕的固定寬度（px）。與消費端 CSS 的取消按鈕寬度對齊。 */
const DEFAULT_REVEAL_WIDTH = 84
/** 拖曳距離 / revealWidth 達此比例才視為「開啟」（露出按鈕），否則回彈關閉。 */
const DEFAULT_OPEN_THRESHOLD_RATIO = 0.45

/**
 * 純手勢偵測 composable：向左拖曳超過閾值鬆手，卡片彈開固定寬度露出後方按鈕
 * （isOpen=true），不含任何業務語意（不知道、也不在意按鈕實際要做什麼，由呼叫端
 * 決定）。與舊版 useSwipeToCancel 的差異：鬆手不直接觸發業務動作，只切換
 * 開啟／關閉狀態；業務動作由呼叫端在消費端按鈕的 click handler 中自行觸發。
 *
 * 設計重點：
 *  - 用 Pointer Events（pointerdown/move/up）一套涵蓋滑鼠與觸控
 *  - revealWidth 為固定 px（不像舊版用容器寬度比例），因為露出的是固定寬度的按鈕，
 *    不是「卡片整體滑出畫面」
 *  - dragX 全程 clamp 在 [-revealWidth, 0]（只支援向左拖曳露出右側按鈕）
 *  - 鬆手：達閾值 → isOpen=true，dragX 定位在 -revealWidth；未達閾值 → isOpen 維持
 *    原狀（已開啟時再往左拖一點點鬆手不會意外關閉），dragX 回到目前 isOpen 對應的位置
 *  - 已開啟狀態下再次從按鈕位置往右拖可關閉（baseOffset 從目前 restingX 起算）
 *  - close()：供消費端在業務動作完成後主動收合（如取消成功、卡片移除前）
 *
 * 使用方式（在卡片元件內）：
 *   const { dragX, isOpen, reboundInstant, onPointerDown, onPointerMove, onPointerUp, close } =
 *     useSwipeReveal()
 *   // 按鈕 click handler 中：emit('cancel', item); close()
 */
export function useSwipeReveal({
  revealWidth = DEFAULT_REVEAL_WIDTH,
  openThresholdRatio = DEFAULT_OPEN_THRESHOLD_RATIO,
}: {
  revealWidth?: number
  openThresholdRatio?: number
} = {}) {
  const dragX = ref(0)
  const dragging = ref(false)
  const isOpen = ref(false)
  /** true＝回彈應降級為無過場（消費端綁定 CSS transition class 用） */
  const reboundInstant = ref(false)

  let startX = 0
  let baseOffset = 0
  let activePointerId: number | null = null

  function restingX() {
    return isOpen.value ? -revealWidth : 0
  }

  function onPointerDown(e: PointerEvent) {
    // 已有另一根手指在拖曳中：忽略新的 pointerdown，避免劫持進行中的手勢
    if (dragging.value && e.pointerId !== activePointerId) return

    dragging.value = true
    startX = e.clientX
    baseOffset = restingX()
    activePointerId = e.pointerId
    reboundInstant.value = prefersReducedMotion()

    const target = e.currentTarget
    if (target instanceof HTMLElement) {
      target.setPointerCapture?.(e.pointerId)
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging.value || e.pointerId !== activePointerId) return
    const delta = e.clientX - startX
    dragX.value = Math.min(0, Math.max(-revealWidth, baseOffset + delta))
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging.value || e.pointerId !== activePointerId) return

    const target = e.currentTarget
    if (target instanceof HTMLElement) {
      target.releasePointerCapture?.(e.pointerId)
    }

    const ratio = Math.abs(dragX.value) / revealWidth
    isOpen.value = ratio >= openThresholdRatio

    dragging.value = false
    activePointerId = null
    dragX.value = restingX()
  }

  /** pointer 被系統取消（如手勢被瀏覽器接管）時比照鬆手前的開闔狀態定位，不改變 isOpen。 */
  function onPointerCancel(e: PointerEvent) {
    if (!dragging.value || e.pointerId !== activePointerId) return
    dragging.value = false
    activePointerId = null
    dragX.value = restingX()
  }

  /** 供消費端在業務動作完成後（或需要強制收合時）主動關閉。 */
  function close() {
    isOpen.value = false
    dragX.value = 0
  }

  return {
    dragX,
    dragging,
    isOpen,
    reboundInstant,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    close,
  }
}
