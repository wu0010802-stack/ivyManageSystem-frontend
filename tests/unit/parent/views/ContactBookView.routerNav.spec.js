import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'

const mockContactBookApi = vi.hoisted(() => ({
  getTodayContactBook: vi.fn(),
  listContactBook: vi.fn(),
}))
vi.mock('@/parent/api/contactBook', () => mockContactBookApi)

vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1, name: '小明' }],
    load: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({
    selectedId: ref(1),
    ensureSelected: vi.fn(),
  }),
}))

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
  useRoute: () => ({}),
}))

import ContactBookView from '@/parent/views/ContactBookView.vue'

// 命名 stub component 以便 findComponent({ name: 'MonthDateStripStub' }) 取得
const MonthDateStripStub = {
  name: 'MonthDateStripStub',
  template: '<div class="strip-stub"></div>',
  emits: ['select'],
}

describe('ContactBookView — MonthDateStrip select 走 vue-router 不再用 location.hash（P1-17）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    pushMock.mockReset()
    mockContactBookApi.getTodayContactBook.mockResolvedValue({
      data: { entry: { id: 99, log_date: '2026-05-07', mood: 'happy' } },
    })
    mockContactBookApi.listContactBook.mockResolvedValue({
      data: {
        entries: [
          { id: 88, log_date: '2026-05-06', mood: 'normal' },
        ],
      },
    })
  })

  it('選 strip 上某日期 → router.push 帶 name=parent-contact-book-detail + entryId param', async () => {
    const wrapper = mount(ContactBookView, {
      global: {
        stubs: {
          ChildContextHeader: true,
          SkeletonBlock: true,
          ParentIcon: true,
          KawaiiStar: true,
          ContactBookDayCard: true,
          ContactBookListItem: true,
          MonthDateStrip: MonthDateStripStub,
          RouterLink: {
            template: '<a><slot /></a>',
            props: ['to'],
          },
        },
      },
    })
    await flushPromises()

    // 觸發 MonthDateStrip emit('select', '2026-05-06')
    await wrapper.findComponent({ name: 'MonthDateStripStub' }).vm.$emit('select', '2026-05-06')
    await flushPromises()

    expect(pushMock).toHaveBeenCalledTimes(1)
    const arg = pushMock.mock.calls[0][0]
    // 必須是物件式 router-push，且帶 entryId（router.js 路徑為 :entryId）
    expect(arg).toMatchObject({
      name: 'parent-contact-book-detail',
      params: { entryId: 88 },
    })
  })

  it('選到的日期沒有對應 entry → 不導頁', async () => {
    const wrapper = mount(ContactBookView, {
      global: {
        stubs: {
          ChildContextHeader: true,
          SkeletonBlock: true,
          ParentIcon: true,
          KawaiiStar: true,
          ContactBookDayCard: true,
          ContactBookListItem: true,
          MonthDateStrip: MonthDateStripStub,
          RouterLink: { template: '<a><slot /></a>', props: ['to'] },
        },
      },
    })
    await flushPromises()

    await wrapper.findComponent({ name: 'MonthDateStripStub' }).vm.$emit('select', '1999-01-01')
    await flushPromises()
    expect(pushMock).not.toHaveBeenCalled()
  })
})
