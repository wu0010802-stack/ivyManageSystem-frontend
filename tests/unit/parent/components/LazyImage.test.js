import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LazyImage from '@/parent/components/LazyImage.vue'

describe('LazyImage', () => {
  let observers = []
  let observeCb

  beforeEach(() => {
    observers = []
    class MockIO {
      constructor(cb) { observeCb = cb; observers.push(this) }
      observe() {}
      unobserve() {}
      disconnect = vi.fn()
    }
    vi.stubGlobal('IntersectionObserver', MockIO)
  })

  afterEach(() => { vi.unstubAllGlobals() })

  it('未進入視窗前 img 不帶 src（或為空）', async () => {
    const wrapper = mount(LazyImage, {
      props: { src: 'https://x/y.jpg', alt: 'photo' },
      attachTo: document.body,
    })
    await flushPromises()
    const img = wrapper.find('img')
    expect(img.attributes('src')).toBeFalsy()
    wrapper.unmount()
  })

  it('進入視窗後 img.src 被設定', async () => {
    const wrapper = mount(LazyImage, {
      props: { src: 'https://x/y.jpg', alt: 'photo' },
      attachTo: document.body,
    })
    await flushPromises()
    observeCb([{ isIntersecting: true, intersectionRatio: 1 }])
    await flushPromises()
    expect(wrapper.find('img').attributes('src')).toBe('https://x/y.jpg')
    wrapper.unmount()
  })

  it('img.onerror 顯示 fallback slot', async () => {
    const wrapper = mount(LazyImage, {
      props: { src: 'https://x/bad.jpg', alt: 'bad' },
      slots: { error: '<span class="err">圖片載入失敗</span>' },
      attachTo: document.body,
    })
    await flushPromises()
    observeCb([{ isIntersecting: true, intersectionRatio: 1 }])
    await flushPromises()
    await wrapper.find('img').trigger('error')
    expect(wrapper.find('.err').exists()).toBe(true)
    wrapper.unmount()
  })

  it('unmount 時 disconnect IntersectionObserver', async () => {
    const wrapper = mount(LazyImage, {
      props: { src: 'https://x/y.jpg' },
      attachTo: document.body,
    })
    await flushPromises()
    const io = observers[0]
    wrapper.unmount()
    expect(io.disconnect).toHaveBeenCalled()
  })

  it('aspectRatio prop 套用到容器 style', async () => {
    const wrapper = mount(LazyImage, {
      props: { src: 'https://x/y.jpg', aspectRatio: '16 / 9' },
      attachTo: document.body,
    })
    await flushPromises()
    expect(wrapper.element.style.aspectRatio).toBe('16 / 9')
    wrapper.unmount()
  })
})
