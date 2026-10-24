/**
 * ChildPhotosView × 相簿回顧接線測試。
 *
 * 只驗「頁面有沒有把回顧接對」，互動細節在
 * src/parent/components/recap/__tests__/ 自己的測試裡守。
 *
 * 重點是最後一條：回顧是加值區塊，它掛掉不得把照片牆一起拖進錯誤態。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

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

const recapPhoto = (id: number) => ({
  id,
  owner_type: 'class_album',
  owner_id: 1,
  url: `/u${id}.jpg`,
  display_url: `/d${id}.jpg`,
  thumb_url: `/t${id}.jpg`,
  original_filename: `${id}.jpg`,
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
    photo_count: 2,
    photos: [recapPhoto(1), recapPhoto(2)],
  },
  {
    key: '1y',
    label: '1 年前',
    anchor_date: '2025-09-16',
    range_start: '2025-09-11',
    range_end: '2025-09-21',
    photo_count: 1,
    photos: [recapPhoto(3)],
  },
]

const stubs = {
  EmptyState: true,
  SkeletonBlock: true,
  KawaiiStar: true,
  M3SegmentedButton: true,
  MobileErrorRetry: true,
}

beforeEach(() => {
  // @ts-expect-error test stub
  global.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  fetchChildPhotos.mockReset()
  fetchChildRecaps.mockReset()
  fetchChildPhotos.mockResolvedValue({
    data: { items: [{ id: 9, thumb_url: 't.jpg', category: 'life' }], total: 1 },
  })
  fetchChildRecaps.mockResolvedValue({ data: { items: RECAPS } })
})

async function mountView() {
  const w = mount(ChildPhotosView, { global: { stubs } })
  await flushPromises()
  return w
}

describe('ChildPhotosView 相簿回顧', () => {
  it('掛載時以 studentId 取回顧，並渲染對應張數的卡片', async () => {
    const w = await mountView()
    expect(fetchChildRecaps).toHaveBeenCalledWith(1)
    expect(w.find('[data-test="recap-rail"]').exists()).toBe(true)
    expect(w.findAll('[data-test="recap-card"]')).toHaveLength(2)
  })

  it('回顧列排在 hero 之後、分類切換之前', async () => {
    const w = await mountView()
    const html = w.html()
    expect(html.indexOf('pt-page-hero')).toBeLessThan(html.indexOf('data-test="recap-rail"'))
    expect(html.indexOf('data-test="recap-rail"')).toBeLessThan(html.indexOf('m3-segmented-button-stub'))
  })

  it('點卡片開檢視器，關閉後回到照片牆', async () => {
    const w = await mountView()
    expect(w.find('[data-test="recap-viewer"]').exists()).toBe(false)

    await w.findAll('[data-test="recap-card"]')[0].trigger('click')
    expect(w.find('[data-test="recap-viewer"]').exists()).toBe(true)
    expect(w.find('[data-test="recap-badge"]').text()).toContain('1 個月前')

    await w.find('[data-test="recap-close"]').trigger('click')
    expect(w.find('[data-test="recap-viewer"]').exists()).toBe(false)
  })

  it('lightbox 開著時點回顧卡 → lightbox 先關掉（兩個全螢幕層不並存）', async () => {
    const w = await mountView()
    await w.find('.thumb').trigger('click')
    expect(w.find('.lightbox').exists()).toBe(true)

    await w.findAll('[data-test="recap-card"]')[0].trigger('click')
    expect(w.find('[data-test="recap-viewer"]').exists()).toBe(true)
    expect(w.find('.lightbox').exists()).toBe(false)
  })

  it('回顧檢視器開著時開 lightbox → 回顧先關掉', async () => {
    const w = await mountView()
    await w.findAll('[data-test="recap-card"]')[0].trigger('click')
    expect(w.find('[data-test="recap-viewer"]').exists()).toBe(true)

    await w.find('.thumb').trigger('click')
    expect(w.find('.lightbox').exists()).toBe(true)
    expect(w.find('[data-test="recap-viewer"]').exists()).toBe(false)
  })

  it('後端沒回任何回顧 → 不渲染回顧區塊，照片牆照常', async () => {
    fetchChildRecaps.mockResolvedValue({ data: { items: [] } })
    const w = await mountView()
    expect(w.find('[data-test="recap-rail"]').exists()).toBe(false)
    expect(w.find('.thumb').exists()).toBe(true)
  })

  it('回顧 API 失敗 → 靜默降級，照片牆不進錯誤態', async () => {
    fetchChildRecaps.mockRejectedValue(new Error('boom'))
    const w = await mountView()
    expect(w.find('[data-test="recap-rail"]').exists()).toBe(false)
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)
    expect(w.find('.thumb').exists()).toBe(true)
  })

  it('切換分類不重新取回顧（回顧口徑與分類篩選無關）', async () => {
    const w = await mountView()
    expect(fetchChildRecaps).toHaveBeenCalledTimes(1)
    const vm = w.vm as unknown as { onCategoryChange: (v: string) => void }
    vm.onCategoryChange('work')
    await flushPromises()
    expect(fetchChildRecaps).toHaveBeenCalledTimes(1)
    expect(w.findAll('[data-test="recap-card"]')).toHaveLength(2)
  })
})
