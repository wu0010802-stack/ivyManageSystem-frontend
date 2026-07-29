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
})
