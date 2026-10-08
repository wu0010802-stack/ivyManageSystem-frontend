// @vitest-environment jsdom
/** F12：切換生活照／作品時，較晚抵達的舊請求不得覆蓋目前清單。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { ref, type Ref } from 'vue'

const h = vi.hoisted(() => ({ photos: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { studentId: '1' }, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/parent/utils/toast', () => ({ toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/parent/api/childPhotos', () => ({
  fetchChildPhotos: h.photos, fetchChildRecaps: vi.fn().mockResolvedValue({ data: { items: [] } }),
}))
vi.mock('@/parent/composables/useIncrementalRender', () => ({
  useIncrementalRender: (items: Ref<unknown[]>) => ({ visible: items, sentinelRef: ref(null), hasMore: ref(false) }),
}))
import ChildPhotosView from '../ChildPhotosView.vue'

const wrappers: VueWrapper[] = []
afterEach(() => { wrappers.splice(0).forEach((w) => w.unmount()); h.photos.mockReset() })

describe('ChildPhotosView 篩選請求序號（F12）', () => {
  it('先生活照、再作品；生活照晚回不得覆蓋作品清單', async () => {
    let resolveLife!: (value: unknown) => void
    h.photos.mockImplementation((_sid: number, params: { category?: string }) => {
      if (params.category === 'life') return new Promise((resolve) => { resolveLife = resolve })
      return Promise.resolve({ data: { items: [{ id: 71, category: 'work', thumb_url: 'work.jpg' }], total: 1 } })
    })
    const w = mount(ChildPhotosView)
    wrappers.push(w)
    await flushPromises()
    const vm = w.vm as unknown as { onCategoryChange(value: string): void }
    vm.onCategoryChange('life')
    vm.onCategoryChange('work')
    await flushPromises()
    resolveLife({ data: { items: [{ id: 72, category: 'life', thumb_url: 'life.jpg' }], total: 1 } })
    await flushPromises()
    expect(w.find('.photo-badge').exists()).toBe(true)
    expect(w.find('.thumb img').attributes('src')).toBe('work.jpg')
  })
})
