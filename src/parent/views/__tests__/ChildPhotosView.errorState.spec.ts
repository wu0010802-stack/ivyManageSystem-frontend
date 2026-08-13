/**
 * ChildPhotosView 載入失敗錯誤態測試（2026-08-13 家長端 QA 巡檢）。
 *
 * defect class：API 失敗只 toast 一下，items 停留空陣列 → 渲染成
 * 「尚無照片」空狀態——500 被誤讀成沒資料（QA 巡檢時 /parent/photos 500，
 * 頁面卻顯示尚無照片）。失敗必須進持久錯誤態＋重試（比照 PickupView 的
 * MobileErrorRetry pattern），不得與空資料同形。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const fetchChildPhotos = vi.fn()
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
  global.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  fetchChildPhotos.mockReset()
})

const stubs = {
  EmptyState: true,
  SkeletonBlock: true,
  KawaiiStar: true,
  M3SegmentedButton: true,
  MobileErrorRetry: true,
}

describe('ChildPhotosView 載入失敗錯誤態', () => {
  it('API 失敗 → 顯示錯誤重試態，而非「尚無照片」空狀態', async () => {
    fetchChildPhotos.mockRejectedValueOnce(new Error('boom'))
    const w = mount(ChildPhotosView, { global: { stubs } })
    await flushPromises()
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(true)
    expect(w.findComponent({ name: 'EmptyState' }).exists()).toBe(false)
  })

  it('重試成功後清除錯誤態並渲染資料', async () => {
    fetchChildPhotos.mockRejectedValueOnce(new Error('boom'))
    const w = mount(ChildPhotosView, { global: { stubs } })
    await flushPromises()

    fetchChildPhotos.mockResolvedValueOnce({
      data: { items: [{ id: 1, thumb_url: 't.jpg', category: 'work' }], total: 1 },
    })
    w.findComponent({ name: 'MobileErrorRetry' }).vm.$emit('retry')
    await flushPromises()

    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)
    expect(w.find('.thumb').exists()).toBe(true)
  })

  it('API 成功但零筆 → 仍是「尚無照片」空狀態（錯誤態不誤觸發）', async () => {
    fetchChildPhotos.mockResolvedValueOnce({ data: { items: [], total: 0 } })
    const w = mount(ChildPhotosView, { global: { stubs } })
    await flushPromises()
    expect(w.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)
  })
})
