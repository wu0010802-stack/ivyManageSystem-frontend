/**
 * ChildPhotosView 漸進渲染測試
 *
 * 確認接上 useIncrementalRender 後，初始只渲染 pageSize 張縮圖，
 * 而非一次把全部 50 張都 render 出來。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ===== 先建 mock，vi.mock 會被 vitest 提升到 import 前執行 =====

// 50 張假照片
const photos = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1,
  thumb_url: `t${i}.jpg`,
  filename: `${i}.jpg`,
}))

// ChildPhotosView 從 '../api/childPhotos' import fetchChildPhotos
// 測試檔在 __tests__/ 下，相對路徑為 ../../api/childPhotos
vi.mock('../../api/childPhotos', () => ({
  fetchChildPhotos: vi.fn(() =>
    Promise.resolve({ data: { items: photos, total: photos.length } }),
  ),
}))

// 模擬 vue-router（ChildPhotosView 用 useRoute 拿 params.studentId）
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { studentId: '1' } }),
  useRouter: () => ({ push: vi.fn() }),
}))

// 靜默 toast（避免 console 雜訊）
vi.mock('../utils/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import ChildPhotosView from '../ChildPhotosView.vue'

// happy-dom 可能無 IntersectionObserver，補 stub
beforeEach(() => {
  // @ts-expect-error test stub
  global.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

const stubs = {
  EmptyState: true,
  SkeletonBlock: true,
  KawaiiStar: true,
}

describe('ChildPhotosView 漸進渲染', () => {
  it('初始只渲染 pageSize 張縮圖（非全部 50）', async () => {
    const wrapper = mount(ChildPhotosView, { global: { stubs } })
    await flushPromises()

    const thumbs = wrapper.findAll('.thumb')
    // 漸進：至少渲染 1 張
    expect(thumbs.length).toBeGreaterThan(0)
    // 漸進：不應一次全渲染 50 張
    expect(thumbs.length).toBeLessThan(50)
  })
})
