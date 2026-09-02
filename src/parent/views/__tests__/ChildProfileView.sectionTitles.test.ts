/**
 * 孩子頁區塊標題不放圖示（2026-09-02 A 案，對齊首頁「常用功能／待辦／今日動態」）。
 *
 * 舊版標題帶 <ParentIcon name="trophy" / "ruler">，對到的 emoji_events / straighten
 * 不在子集字型內，prod 直接 render 成被裁切的英文；順勢把四個標題圖示全拿掉。
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
vi.mock('@/parent/api/profile', () => ({
  getChildProfile: vi.fn().mockResolvedValue({
    data: {
      student: { name: '小明', student_no: 'S001' },
      teachers: [],
      guardians: [],
      allergies: [],
      classroom: { name: '向日葵班' },
    },
  }),
  getMyChildren: vi.fn().mockResolvedValue({ data: { items: [] } }),
}))
vi.mock('@/parent/utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { studentId: '1' } }),
  useRouter: () => ({ push: vi.fn() }),
}))

import ChildProfileView from '@/parent/views/ChildProfileView.vue'

const STUBS = {
  MilestoneCarousel: true,
  TimelineItem: true,
  LaurelWreath: true,
  KawaiiStar: true,
  CrownIcon: true,
  ParentIcon: true,
  SectionHeader: { template: '<div class="section-header-stub"><slot name="action" /></div>' },
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('ChildProfileView — 區塊標題', () => {
  it('四個成長區塊標題只有文字，不帶圖示', async () => {
    const w = mount(ChildProfileView, { global: { stubs: STUBS } })
    await flushPromises()

    const titles = w.findAll('.section-title')
    const texts = titles.map((t) => t.text())
    expect(texts).toEqual(expect.arrayContaining(['成長里程碑', '最新動態', '成長量測', '歷次報告']))
    expect(w.findAll('.section-title parent-icon-stub')).toHaveLength(0)
    w.unmount()
  })
})
