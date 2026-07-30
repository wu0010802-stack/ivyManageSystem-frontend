/**
 * ChildPhotosView 類別篩選測試
 *
 * 頂部 M3SegmentedButton 切換 all/life/work，重新以 category query param 取資料。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const fetchChildPhotos = vi.fn(() =>
  Promise.resolve({ data: { items: [{ id: 1, thumb_url: 't.jpg', category: 'work' }], total: 1 } }))
vi.mock('../../api/childPhotos', () => ({
  fetchChildPhotos: (...a: unknown[]) => fetchChildPhotos(...a),
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { studentId: '1' } }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('../../utils/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import ChildPhotosView from '../ChildPhotosView.vue'

beforeEach(() => {
  // @ts-expect-error test stub
  global.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
  fetchChildPhotos.mockClear()
})

const stubs = { EmptyState: true, SkeletonBlock: true, KawaiiStar: true, M3SegmentedButton: true }

describe('ChildPhotosView 類別篩選', () => {
  it('切到「作品」重新以 category=work 取資料', async () => {
    const w = mount(ChildPhotosView, { global: { stubs } })
    await flushPromises()
    const vm = w.vm as unknown as { category: string; onCategoryChange: (v: string) => void }
    vm.onCategoryChange('work')
    await flushPromises()
    expect(fetchChildPhotos).toHaveBeenLastCalledWith(1, expect.objectContaining({ category: 'work' }))
  })

  it('預設「全部」不帶 category 參數', async () => {
    const w = mount(ChildPhotosView, { global: { stubs } })
    await flushPromises()
    expect(fetchChildPhotos).toHaveBeenLastCalledWith(1, expect.objectContaining({ limit: 200 }))
    const lastCall = fetchChildPhotos.mock.calls[fetchChildPhotos.mock.calls.length - 1]
    expect(lastCall[1]).not.toHaveProperty('category')
  })

  it('作品縮圖顯示「作品」角標', async () => {
    const w = mount(ChildPhotosView, { global: { stubs } })
    await flushPromises()
    expect(w.find('.photo-badge').exists()).toBe(true)
    expect(w.find('.photo-badge').text()).toContain('作品')
  })

  it('lightbox 開啟時切換類別 → 不拋錯且 lightbox 自動關閉（避免 items 變短後 previewIdx 越界）', async () => {
    fetchChildPhotos.mockResolvedValueOnce({
      data: {
        items: [
          { id: 1, thumb_url: 't1.jpg', display_url: 'd1.jpg', category: 'life' },
          { id: 2, thumb_url: 't2.jpg', display_url: 'd2.jpg', category: 'life' },
          { id: 3, thumb_url: 't3.jpg', display_url: 'd3.jpg', category: 'work' },
        ],
        total: 3,
      },
    })
    const w = mount(ChildPhotosView, { global: { stubs } })
    await flushPromises()

    // 開啟第 3 張（idx=2）的 lightbox
    const thumbs = w.findAll('.thumb')
    await thumbs[2].trigger('click')
    await flushPromises()
    expect(w.find('.lightbox').exists()).toBe(true)

    // 切到「作品」，重新 fetch 只回一張 → previewIdx(2) 若沒被 clamp/關閉會越界炸掉
    fetchChildPhotos.mockResolvedValueOnce({
      data: { items: [{ id: 3, thumb_url: 't3.jpg', category: 'work' }], total: 1 },
    })
    const vm = w.vm as unknown as { onCategoryChange: (v: string) => void }
    expect(() => vm.onCategoryChange('work')).not.toThrow()
    await flushPromises()
    expect(w.find('.lightbox').exists()).toBe(false)
  })
})
