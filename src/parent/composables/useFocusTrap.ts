import type { Ref } from 'vue'

/**
 * 全螢幕覆蓋層的 Tab 焦點循環（focus trap）。
 *
 * 家長端的 lightbox／回顧檢視器都只是一層 `position: fixed` 的覆蓋層，底下的
 * 照片牆縮圖、回顧卡全部還留在 tab order 裡。不鎖 Tab 的話焦點會跑到黑幕後面
 * 看不見的按鈕上：畫面毫無變化、Enter 下去等於操作一個看不見的畫面，螢幕閱讀器
 * 更會開始念被遮住的內容。
 *
 * 只處理循環，不處理「開啟時把焦點移進來／關閉時還原」——那牽涉各自的
 * 開關時機（v-if 掛載 vs. 狀態切換），由 caller 自己在生命週期裡做。
 *
 * 用法：在 keydown handler 裡把 Tab 轉給 `trapTab`，容器本身需要
 * `tabindex="-1"` 才能在沒有任何可聚焦子元素時接住焦點。
 *
 *   const { trapTab } = useFocusTrap(rootRef)
 *   if (e.key === 'Tab') trapTab(e)
 */

/** 可聚焦元素選擇器。`:not([disabled])` 讓停用的上／下一張自動退出循環。 */
const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(rootRef: Ref<HTMLElement | null>): {
  trapTab: (e: KeyboardEvent) => void
} {
  function trapTab(e: KeyboardEvent): void {
    const root = rootRef.value
    if (!root) return
    const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
    // 全部都 disabled（例如只有一張照片、上下張都停用又沒有其他按鈕）時無處可去，
    // 擋掉 Tab 讓焦點留在容器上，總比跳到黑幕後面好
    if (nodes.length === 0) {
      e.preventDefault()
      return
    }
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    const active = typeof document !== 'undefined' ? document.activeElement : null
    // 只剩一顆時 first === last，兩個分支都是聚焦回自己，不會死迴圈
    if (e.shiftKey && (active === first || active === root)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return { trapTab }
}
