/**
 * ChildPhotosView lightbox 的 Tab focus trap。
 *
 * lightbox 只是一層 position: fixed 的覆蓋層，底下的照片牆縮圖與回顧卡全部還在
 * tab order 裡。沒有 trap 的話家長用鍵盤按 Tab 焦點會跑到黑幕後面看不見的按鈕上，
 * 畫面毫無變化、Enter 下去等於操作一個看不見的畫面。
 *
 * 所有斷言都靠 document.activeElement，所以一律 attachTo: document.body。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

const fetchChildPhotos = vi.fn()
const fetchChildRecaps = vi.fn()
vi.mock('../../api/childPhotos', () => ({
  fetchChildPhotos: (...a: unknown[]) => fetchChildPhotos(...a),
  fetchChildRecaps: (...a: unknown[]) => fetchChildRecaps(...a),
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { studentId: '1' } }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('../../utils/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import ChildPhotosView from '../ChildPhotosView.vue'

const photo = (id: number) => ({
  id,
  thumb_url: `/t${id}.jpg`,
  display_url: `/d${id}.jpg`,
  url: `/u${id}.jpg`,
  filename: `${id}.jpg`,
  category: 'life',
})

const recapPhoto = (id: number) => ({
  id,
  owner_type: 'class_album',
  owner_id: 1,
  url: `/ru${id}.jpg`,
  display_url: `/rd${id}.jpg`,
  thumb_url: `/rt${id}.jpg`,
  original_filename: `r${id}.jpg`,
  photo_date: '2026-08-16',
  created_at: null,
  category: 'life',
})

const RECAPS = [
  {
    key: '1m',
    label: '1 個月前',
    anchor_date: '2026-08-16',
    range_start: '2026-08-11',
    range_end: '2026-08-21',
    photo_count: 1,
    photos: [recapPhoto(1)],
  },
]

const stubs = {
  EmptyState: true,
  SkeletonBlock: true,
  KawaiiStar: true,
  M3SegmentedButton: true,
  MobileErrorRetry: true,
}

let wrapper: VueWrapper | null = null

beforeEach(() => {
  // @ts-expect-error test stub
  global.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  fetchChildPhotos.mockReset()
  fetchChildRecaps.mockReset()
  fetchChildRecaps.mockResolvedValue({ data: { items: RECAPS } })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

/** 掛 count 張照片的相簿，並開啟第 idx 張的 lightbox。 */
async function openLightbox(idx: number, count = 3) {
  const items = Array.from({ length: count }, (_, i) => photo(i + 1))
  fetchChildPhotos.mockResolvedValue({ data: { items, total: count } })
  const w = mount(ChildPhotosView, { global: { stubs }, attachTo: document.body })
  wrapper = w
  await flushPromises()
  await w.findAll('.thumb')[idx].trigger('click')
  await flushPromises()
  expect(w.find('.lightbox').exists()).toBe(true)
  return w
}

/** lightbox 內目前實際參與 tab 循環的元素（disabled 的上／下一張不算）。 */
function focusables(w: VueWrapper): HTMLElement[] {
  const root = w.find('.lightbox').element as HTMLElement
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  )
}

/**
 * 在 el 上發一顆會冒泡的 Tab。回傳事件本身，好斷言 trap 有沒有把瀏覽器的
 * 預設移動擋下來——沒擋下來的話焦點就會離開覆蓋層。
 */
function pressTab(el: HTMLElement, shiftKey = false): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })
  el.dispatchEvent(ev)
  return ev
}

/**
 * 按 Tab，**並且補上 jsdom 沒有實作的瀏覽器預設行為**：事件沒被 preventDefault
 * 的話，焦點就照整份文件的 tab order 往前／往後挪一格。
 *
 * 少了這段補償，「trap 壞掉」在 jsdom 裡會表現成「焦點原地不動」，而原地不動
 * 剛好還留在覆蓋層內——測試就會在實作被刪掉之後照樣是綠的。
 */
function tabAsBrowser(shiftKey = false): void {
  const ev = pressTab(document.activeElement as HTMLElement, shiftKey)
  if (ev.defaultPrevented) return
  const all = Array.from(
    document.body.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  )
  const i = all.indexOf(document.activeElement as HTMLElement)
  const nextIndex = (i + (shiftKey ? -1 : 1) + all.length) % all.length
  all[nextIndex]?.focus()
}

describe('ChildPhotosView lightbox focus trap', () => {
  it('Tab 從最後一個可聚焦元素回到第一個', async () => {
    const w = await openLightbox(1)
    const nodes = focusables(w)
    expect(nodes.length).toBeGreaterThan(1)

    const last = nodes[nodes.length - 1]
    last.focus()
    const ev = pressTab(last)

    expect(ev.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(nodes[0])
  })

  it('Shift+Tab 從第一個回到最後一個', async () => {
    const w = await openLightbox(1)
    const nodes = focusables(w)

    const first = nodes[0]
    first.focus()
    const ev = pressTab(first, true)

    expect(ev.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(nodes[nodes.length - 1])
  })

  it('停在第一張時 disabled 的「上一張」被排除在循環外', async () => {
    const w = await openLightbox(0)
    const prev = w.find('.nav.prev').element as HTMLButtonElement
    const next = w.find('.nav.next').element as HTMLButtonElement
    expect(prev.disabled).toBe(true)

    const nodes = focusables(w)
    expect(nodes).not.toContain(prev)
    // 循環的頭是「下一張」而不是被停用的「上一張」
    expect(nodes[0]).toBe(next)

    const last = nodes[nodes.length - 1]
    last.focus()
    pressTab(last)
    expect(document.activeElement).toBe(next)
  })

  it('停在最後一張時 disabled 的「下一張」被排除在循環外', async () => {
    const w = await openLightbox(2)
    const next = w.find('.nav.next').element as HTMLButtonElement
    expect(next.disabled).toBe(true)

    const nodes = focusables(w)
    expect(nodes).not.toContain(next)

    // Shift+Tab 從頭往回，要落在 close 而不是被停用的「下一張」
    const first = nodes[0]
    first.focus()
    pressTab(first, true)
    expect(document.activeElement).toBe(nodes[nodes.length - 1])
    expect(document.activeElement).not.toBe(next)
  })

  it('焦點不會跑到 lightbox 外的縮圖或回顧卡', async () => {
    const w = await openLightbox(1)
    const lightbox = w.find('.lightbox').element as HTMLElement
    expect(w.find('.thumb').exists()).toBe(true)
    expect(w.find('[data-test="recap-card"]').exists()).toBe(true)

    const nodes = focusables(w)
    // 正著繞一整圈、再反著繞一整圈，每一步都必須還在覆蓋層裡面
    nodes[nodes.length - 1].focus()
    for (let i = 0; i < nodes.length + 1; i++) {
      tabAsBrowser()
      expect(lightbox.contains(document.activeElement)).toBe(true)
    }
    nodes[0].focus()
    for (let i = 0; i < nodes.length + 1; i++) {
      tabAsBrowser(true)
      expect(lightbox.contains(document.activeElement)).toBe(true)
    }

    // 具體點名：焦點沒有落在黑幕後面那些還在 tab order 裡的東西上
    expect((document.activeElement as HTMLElement).closest('.thumb')).toBeNull()
    expect((document.activeElement as HTMLElement).closest('[data-test="recap-card"]')).toBeNull()
  })

  it('只有一張照片（上下張都 disabled、只剩關閉鈕）時不會丟錯或跳出去', async () => {
    const w = await openLightbox(0, 1)
    const nodes = focusables(w)
    expect(nodes).toHaveLength(1)
    const only = nodes[0]

    only.focus()
    const ev = pressTab(only)
    expect(ev.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(only)

    const back = pressTab(only, true)
    expect(back.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(only)
  })
})
