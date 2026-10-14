/**
 * ChildProfileView 與「目前選定的孩子」同步（2026-10-14）。
 *
 * 頁內「前往聯絡簿留言」、孩子 hub、聯絡簿分頁都依全域 selectedId 顯示；從「我的」
 * 子女清單或推播深連結直接進 /children/:id 時 selectedId 可能是另一個孩子，按
 * 「前往聯絡簿」會打開別的孩子的聯絡簿。載入成功（後端確認屬於本家長）才切換。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/parent/composables/useChildTimeline', () => ({
  useChildTimeline: () => ({
    items: ref([]),
    loading: ref(false),
    error: ref(null),
    reload: vi.fn(),
    loadMore: vi.fn(),
    nextCursor: ref(null),
  }),
}))
vi.mock('@/parent/api/childPhotos', () => ({
  fetchChildPhotos: vi.fn().mockResolvedValue({ data: { items: [] } }),
}))
const getChildProfileMock = vi.fn()
vi.mock('@/parent/api/profile', () => ({
  getChildProfile: (...args: unknown[]) => getChildProfileMock(...args),
}))
vi.mock('@/parent/utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { studentId: '22' } }),
  useRouter: () => ({ push: vi.fn() }),
}))

import ChildProfileView from '@/parent/views/ChildProfileView.vue'
import { clearChildSelection, useChildSelection } from '@/parent/composables/useChildSelection'

const STUBS = {
  MilestoneCarousel: true,
  TimelineItem: true,
  KawaiiStar: true,
  CrownIcon: true,
  ParentIcon: true,
  SectionHeader: true,
  SkeletonBlock: true,
  MobileErrorRetry: true,
}

beforeEach(() => {
  setActivePinia(createPinia())
  clearChildSelection()
  getChildProfileMock.mockReset()
})

describe('ChildProfileView 同步目前選定的孩子', () => {
  it('載入成功後把選定的孩子切成網址上的這一位', async () => {
    const { selectedId, setSelected } = useChildSelection()
    setSelected(11) // 原本選的是另一個孩子
    getChildProfileMock.mockResolvedValue({ data: { student: { name: '小華' } } })

    mount(ChildProfileView, { global: { stubs: STUBS } })
    await flushPromises()

    expect(selectedId.value).toBe(22)
  })

  it('載入失敗（例如不屬於本家長）時不改動選擇', async () => {
    const { selectedId, setSelected } = useChildSelection()
    setSelected(11)
    getChildProfileMock.mockRejectedValue({ displayMessage: '無權限' })

    mount(ChildProfileView, { global: { stubs: STUBS } })
    await flushPromises()

    expect(selectedId.value).toBe(11)
  })
})
