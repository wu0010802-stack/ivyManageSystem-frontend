// src/composables/__tests__/useGridKeyboardNav.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref, h } from 'vue'
import { useGridKeyboardNav } from '@/composables/useGridKeyboardNav'

// 測試宿主：2 列 × 2 欄原生 input 網格
const Host = defineComponent({
  setup() {
    const container = ref<HTMLElement | null>(null)
    useGridKeyboardNav(container)
    return () =>
      h('div', { ref: container }, [
        h('input', { 'data-grid-row': 0, 'data-grid-col': 0, id: 'r0c0' }),
        h('input', { 'data-grid-row': 0, 'data-grid-col': 1, id: 'r0c1' }),
        h('input', { 'data-grid-row': 1, 'data-grid-col': 0, id: 'r1c0' }),
        h('input', { 'data-grid-row': 1, 'data-grid-col': 1, id: 'r1c1' }),
      ])
  },
})

function fire(el: Element, init: KeyboardEventInit) {
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }))
}

describe('useGridKeyboardNav', () => {
  it('Enter 從 r0c0 移焦點到 r1c0（下一列同欄）', () => {
    const w = mount(Host, { attachTo: document.body })
    const r0c0 = w.find('#r0c0').element as HTMLInputElement
    r0c0.focus()
    fire(r0c0, { key: 'Enter' })
    expect(document.activeElement?.id).toBe('r1c0')
    w.unmount()
  })

  it('Shift+Enter 從 r1c1 移到 r0c1（上一列同欄）', () => {
    const w = mount(Host, { attachTo: document.body })
    const r1c1 = w.find('#r1c1').element as HTMLInputElement
    r1c1.focus()
    fire(r1c1, { key: 'Enter', shiftKey: true })
    expect(document.activeElement?.id).toBe('r0c1')
    w.unmount()
  })

  it('底列 Enter 不動（邊界，無下一列）', () => {
    const w = mount(Host, { attachTo: document.body })
    const r1c0 = w.find('#r1c0').element as HTMLInputElement
    r1c0.focus()
    fire(r1c0, { key: 'Enter' })
    expect(document.activeElement?.id).toBe('r1c0')
    w.unmount()
  })

  it('ArrowDown 等同 Enter 且 preventDefault（避免 number step）', () => {
    const w = mount(Host, { attachTo: document.body })
    const r0c1 = w.find('#r0c1').element as HTMLInputElement
    r0c1.focus()
    const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    r0c1.dispatchEvent(ev)
    expect(document.activeElement?.id).toBe('r1c1')
    expect(ev.defaultPrevented).toBe(true)
    w.unmount()
  })
})
