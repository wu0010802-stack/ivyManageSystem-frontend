import { ref, onMounted, onUnmounted, type Ref } from 'vue'

/**
 * 鍵盤彈出補償：監聽 visualViewport resize，回傳鍵盤佔用高度（px）。
 *
 * 行動裝置鍵盤彈出時 layout viewport 不變但 visualViewport.height 縮小；
 * 縮小逾門檻（80px）視為鍵盤開啟，回傳縮小量；否則 0。供全頁視圖（如對話頁）
 * 讓輸入框浮在鍵盤上方。萃取自 ParentBottomSheet 的 visualViewport 邏輯。
 */
const KEYBOARD_THRESHOLD = 80

export function useKeyboardInset(): { keyboardInset: Ref<number> } {
  const keyboardInset = ref(0)
  let initialHeight = 0

  function onResize(): void {
    if (typeof window === 'undefined' || !window.visualViewport) return
    const delta = initialHeight - window.visualViewport.height
    keyboardInset.value = delta > KEYBOARD_THRESHOLD ? delta : 0
  }

  onMounted(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return
    initialHeight = window.visualViewport.height
    window.visualViewport.addEventListener('resize', onResize)
  })

  onUnmounted(() => {
    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.removeEventListener('resize', onResize)
    }
  })

  return { keyboardInset }
}
