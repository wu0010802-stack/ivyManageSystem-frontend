/**
 * useFocusTrap — 全螢幕覆蓋層的 Tab 循環。
 *
 * 這裡守的是 DOM 形狀的邊角，不綁任何一個畫面：
 *  - disabled 的元素要退出循環（含「排在最後一個」的那種，覆蓋層裡的
 *    上／下一張按鈕會隨著翻到頭／尾動態停用）
 *  - 全部停用／沒有任何可聚焦元素時擋掉 Tab，不能丟錯也不能讓焦點溜出去
 *
 * 各自畫面的接線測試在 ChildPhotosView.focusTrap.spec.ts 與 RecapViewer 那邊。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { ref } from 'vue'
import { useFocusTrap } from '../useFocusTrap'

let root: HTMLElement | null = null

afterEach(() => {
  root?.remove()
  root = null
})

/** 造一個覆蓋層：html 直接給按鈕，容器本身 tabindex="-1"（比照實際用法）。 */
function makeRoot(html: string): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('tabindex', '-1')
  el.innerHTML = html
  document.body.appendChild(el)
  root = el
  return el
}

function pressTab(el: HTMLElement, shiftKey = false): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })
  el.dispatchEvent(ev)
  return ev
}

describe('useFocusTrap', () => {
  it('Tab 在頭尾循環', () => {
    const el = makeRoot('<button id="a"></button><button id="b"></button><button id="c"></button>')
    const { trapTab } = useFocusTrap(ref(el))
    el.addEventListener('keydown', (e) => trapTab(e as KeyboardEvent))

    const c = el.querySelector<HTMLElement>('#c')!
    c.focus()
    pressTab(c)
    expect(document.activeElement).toBe(el.querySelector('#a'))

    const a = el.querySelector<HTMLElement>('#a')!
    a.focus()
    pressTab(a, true)
    expect(document.activeElement).toBe(c)
  })

  it('排在最後一個的 disabled 按鈕退出循環，往前循環時落在它前面那顆', () => {
    const el = makeRoot('<button id="a"></button><button id="b"></button><button id="c" disabled></button>')
    const { trapTab } = useFocusTrap(ref(el))
    el.addEventListener('keydown', (e) => trapTab(e as KeyboardEvent))

    // b 才是循環的尾，Tab 要回到 a
    const b = el.querySelector<HTMLElement>('#b')!
    b.focus()
    const fwd = pressTab(b)
    expect(fwd.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(el.querySelector('#a'))

    // Shift+Tab 從頭往回要落在 b，不是被停用的 c
    const a = el.querySelector<HTMLElement>('#a')!
    a.focus()
    pressTab(a, true)
    expect(document.activeElement).toBe(b)
  })

  it('排在最前面的 disabled 按鈕退出循環', () => {
    const el = makeRoot('<button id="a" disabled></button><button id="b"></button><button id="c"></button>')
    const { trapTab } = useFocusTrap(ref(el))
    el.addEventListener('keydown', (e) => trapTab(e as KeyboardEvent))

    const c = el.querySelector<HTMLElement>('#c')!
    c.focus()
    pressTab(c)
    expect(document.activeElement).toBe(el.querySelector('#b'))
  })

  it('只剩一顆可聚焦元素時聚焦回自己，不會死迴圈', () => {
    const el = makeRoot('<button id="a" disabled></button><button id="b"></button>')
    const { trapTab } = useFocusTrap(ref(el))
    el.addEventListener('keydown', (e) => trapTab(e as KeyboardEvent))

    const b = el.querySelector<HTMLElement>('#b')!
    b.focus()
    expect(pressTab(b).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(b)
    expect(pressTab(b, true).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(b)
  })

  it('全部 disabled（無處可去）時擋掉 Tab，不丟錯', () => {
    const el = makeRoot('<button id="a" disabled></button><button id="b" disabled></button>')
    const { trapTab } = useFocusTrap(ref(el))
    el.addEventListener('keydown', (e) => trapTab(e as KeyboardEvent))

    el.focus()
    expect(() => pressTab(el)).not.toThrow()
    expect(pressTab(el).defaultPrevented).toBe(true)
    // 焦點留在容器上，總比跳到黑幕後面好
    expect(document.activeElement).toBe(el)
  })

  it('焦點在容器本身時 Shift+Tab 要往回包到最後一顆（不是掉出覆蓋層）', () => {
    const el = makeRoot('<button id="a"></button><button id="b"></button>')
    const { trapTab } = useFocusTrap(ref(el))
    el.addEventListener('keydown', (e) => trapTab(e as KeyboardEvent))

    el.focus()
    const ev = pressTab(el, true)
    expect(ev.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(el.querySelector('#b'))
  })

  it('ref 還沒掛上（null）時不動作也不丟錯', () => {
    const el = makeRoot('<button id="a"></button>')
    const { trapTab } = useFocusTrap(ref<HTMLElement | null>(null))
    const a = el.querySelector<HTMLElement>('#a')!
    a.focus()
    const ev = pressTab(a)
    el.dispatchEvent(ev)
    expect(() => trapTab(ev)).not.toThrow()
    expect(ev.defaultPrevented).toBe(false)
  })
})
