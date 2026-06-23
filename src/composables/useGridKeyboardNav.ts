// src/composables/useGridKeyboardNav.ts
import { watch, onScopeDispose } from 'vue'
import type { Ref } from 'vue'

/**
 * 密集網格鍵盤導航（容器層）。
 * 每個可輸入格需標 data-grid-row / data-grid-col。
 * Enter / ArrowDown → 下一列同欄；Shift+Enter / ArrowUp → 上一列同欄。
 * 左右不接管，交給瀏覽器原生 Tab 與數字框游標。
 */
export function useGridKeyboardNav(container: Ref<HTMLElement | null>): void {
  function findInput(el: Element | null): HTMLInputElement | null {
    if (!el) return null
    if (el instanceof HTMLInputElement) return el
    return el.querySelector('input')
  }

  function onKeydown(e: KeyboardEvent): void {
    const key = e.key
    const isDown = key === 'Enter' && !e.shiftKey
    const isUp = (key === 'Enter' && e.shiftKey) || key === 'ArrowUp'
    const isArrowDown = key === 'ArrowDown'
    if (!isDown && !isUp && !isArrowDown) return

    const target = e.target as HTMLElement | null
    const cell = target?.closest('[data-grid-row][data-grid-col]') as HTMLElement | null
    if (!cell || !container.value) return

    const row = Number(cell.getAttribute('data-grid-row'))
    const col = Number(cell.getAttribute('data-grid-col'))
    if (Number.isNaN(row) || Number.isNaN(col)) return

    const nextRow = isUp ? row - 1 : row + 1
    const nextCell = container.value.querySelector(
      `[data-grid-row="${nextRow}"][data-grid-col="${col}"]`,
    )
    const input = findInput(nextCell)
    // ArrowUp/Down 在數字框預設會加減值；無論有無目標都要 preventDefault
    if (key === 'ArrowUp' || isArrowDown) e.preventDefault()
    if (!input) return
    e.preventDefault()
    input.focus()
    input.select()
  }

  watch(
    container,
    (el, prev) => {
      prev?.removeEventListener('keydown', onKeydown)
      el?.addEventListener('keydown', onKeydown)
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => container.value?.removeEventListener('keydown', onKeydown))
}
