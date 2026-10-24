/**
 * RecapViewer 的 Tab focus trap 接線。
 *
 * 循環規則本身在 src/parent/composables/__tests__/useFocusTrap.spec.ts 守；
 * 這裡只守「檢視器有沒有把 Tab 接到 trap 上」——把 onKeydown 的 Tab 分支刪掉
 * 這支就要紅。抽成共用 composable 之前這條線沒有任何測試蓋住。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import RecapViewer from '../RecapViewer.vue'
import type { PhotoRecap } from '../../../api/childPhotos'

function makeRecap(count = 3): PhotoRecap {
  return {
    key: '1m',
    label: '1 個月前',
    anchor_date: '2026-08-16',
    range_start: '2026-08-11',
    range_end: '2026-08-21',
    photo_count: count,
    photos: Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      owner_type: 'class_album',
      owner_id: 1,
      url: `/u${i + 1}.jpg`,
      display_url: `/d${i + 1}.jpg`,
      thumb_url: `/t${i + 1}.jpg`,
      original_filename: `${i + 1}.jpg`,
      photo_date: '2026-08-16',
      created_at: null,
      category: 'life' as const,
    })),
  }
}

let wrapper: VueWrapper | null = null

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })))
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.unstubAllGlobals()
})

function pressTab(el: HTMLElement, shiftKey = false): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })
  el.dispatchEvent(ev)
  return ev
}

function focusables(w: VueWrapper): HTMLElement[] {
  const root = w.find('[data-test="recap-viewer"]').element as HTMLElement
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  )
}

describe('RecapViewer Tab focus trap', () => {
  it('Tab 從最後一個可聚焦元素回到第一個', () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap() }, attachTo: document.body })
    wrapper = w
    const nodes = focusables(w)
    expect(nodes.length).toBeGreaterThan(1)

    const last = nodes[nodes.length - 1]
    last.focus()
    const ev = pressTab(last)

    expect(ev.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(nodes[0])
  })

  it('焦點在容器本身時 Shift+Tab 包到最後一個，不掉出檢視器', () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap() }, attachTo: document.body })
    wrapper = w
    const root = w.find('[data-test="recap-viewer"]').element as HTMLElement
    const nodes = focusables(w)

    root.focus()
    const ev = pressTab(root, true)

    expect(ev.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(nodes[nodes.length - 1])
    expect(root.contains(document.activeElement)).toBe(true)
  })

  it('停在第一張時 disabled 的「上一張」被排除在循環外', () => {
    const w = mount(RecapViewer, { props: { recap: makeRecap() }, attachTo: document.body })
    wrapper = w
    const prev = w.find('[data-test="recap-prev"]').element as HTMLButtonElement
    expect(prev.disabled).toBe(true)

    const nodes = focusables(w)
    expect(nodes).not.toContain(prev)

    const last = nodes[nodes.length - 1]
    last.focus()
    pressTab(last)
    expect(document.activeElement).toBe(nodes[0])
    expect(document.activeElement).not.toBe(prev)
  })
})
