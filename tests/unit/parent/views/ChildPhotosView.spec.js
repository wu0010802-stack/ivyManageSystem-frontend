import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mockChildPhotosApi = vi.hoisted(() => ({
  fetchChildPhotos: vi.fn().mockResolvedValue({
    data: {
      total: 3,
      items: [
        { id: 1, thumb_url: '/t1.jpg', display_url: '/d1.jpg', url: '/u1.jpg', filename: 'a.jpg' },
        { id: 2, thumb_url: '/t2.jpg', display_url: '/d2.jpg', url: '/u2.jpg', filename: 'b.jpg' },
        { id: 3, thumb_url: '/t3.jpg', display_url: '/d3.jpg', url: '/u3.jpg', filename: 'c.jpg' },
      ],
    },
  }),
}))
vi.mock('@/parent/api/childPhotos', () => mockChildPhotosApi)

vi.mock('@/parent/utils/toast', () => ({
  toast: { error: vi.fn() },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { studentId: 1 } }),
  useRouter: () => ({ push: vi.fn() }),
}))

import ChildPhotosView from '@/parent/views/ChildPhotosView.vue'

async function mountAndOpenFirst() {
  const wrapper = mount(ChildPhotosView, {
    attachTo: document.body,
    global: {
      stubs: {
        SkeletonBlock: true,
        EmptyState: true,
        KawaiiStar: true,
      },
    },
  })
  await flushPromises()
  // 模擬使用者點第一張縮圖
  const thumbs = wrapper.findAll('.thumb')
  await thumbs[0].trigger('click')
  await flushPromises()
  return wrapper
}

describe('ChildPhotosView lightbox — 鍵盤導覽 + focus trap（P1-20）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('開啟 lightbox 後 → 焦點落入 lightbox 容器（focus trap 入口）', async () => {
    const wrapper = await mountAndOpenFirst()
    expect(wrapper.find('.lightbox').exists()).toBe(true)
    // lightbox 必須有 tabindex 以便 focus
    const lb = wrapper.find('.lightbox').element
    expect(lb.getAttribute('tabindex')).toBe('-1')
    // a11y：aria-modal 與 aria-labelledby（既有 aria-modal 已存在）
    expect(lb.getAttribute('aria-modal')).toBe('true')
    // 開啟瞬間焦點應該在 lightbox 內（容器或第一個可 focus 元素）
    expect(lb.contains(document.activeElement)).toBe(true)
  })

  it('Escape → 關閉 lightbox', async () => {
    const wrapper = await mountAndOpenFirst()
    expect(wrapper.find('.lightbox').exists()).toBe(true)

    await wrapper.find('.lightbox').trigger('keydown', { key: 'Escape' })
    await flushPromises()

    expect(wrapper.find('.lightbox').exists()).toBe(false)
  })

  it('ArrowRight → 下一張；ArrowLeft → 上一張', async () => {
    const wrapper = await mountAndOpenFirst()
    expect(wrapper.find('.lightbox img').attributes('src')).toBe('/d1.jpg')

    await wrapper.find('.lightbox').trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()
    expect(wrapper.find('.lightbox img').attributes('src')).toBe('/d2.jpg')

    await wrapper.find('.lightbox').trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()
    expect(wrapper.find('.lightbox img').attributes('src')).toBe('/d3.jpg')

    // 已到底端：再按右不會越界
    await wrapper.find('.lightbox').trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()
    expect(wrapper.find('.lightbox img').attributes('src')).toBe('/d3.jpg')

    await wrapper.find('.lightbox').trigger('keydown', { key: 'ArrowLeft' })
    await flushPromises()
    expect(wrapper.find('.lightbox img').attributes('src')).toBe('/d2.jpg')
  })

  it('關閉 lightbox → 焦點還原回觸發開啟的縮圖', async () => {
    const wrapper = mount(ChildPhotosView, {
      attachTo: document.body,
      global: {
        stubs: {
          SkeletonBlock: true,
          EmptyState: true,
          KawaiiStar: true,
        },
      },
    })
    await flushPromises()

    const thumbs = wrapper.findAll('.thumb')
    // 先把焦點放到第二張縮圖再點擊
    thumbs[1].element.focus()
    expect(document.activeElement).toBe(thumbs[1].element)
    await thumbs[1].trigger('click')
    await flushPromises()

    // 關閉
    await wrapper.find('.lightbox').trigger('keydown', { key: 'Escape' })
    await flushPromises()

    expect(wrapper.find('.lightbox').exists()).toBe(false)
    // 焦點還原
    expect(document.activeElement).toBe(thumbs[1].element)
  })
})
