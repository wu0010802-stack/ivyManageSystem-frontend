import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

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
    selectedId: { value: 1 },
    ensureSelected: vi.fn(),
  }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import ContactBookView from '@/parent/views/ContactBookView.vue'

describe('ContactBookView today-card a11y', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockContactBookApi.getTodayContactBook.mockResolvedValue({
      data: { entry: { id: 99, log_date: '2026-05-07', mood: 'happy', teacher_note: '表現很棒' } },
    })
    mockContactBookApi.listContactBook.mockResolvedValue({
      data: { entries: [] },
    })
  })

  it('today-card 改用 router-link，card element 為 <a> 且 href 指向 /contact-book/<id>', async () => {
    const wrapper = mount(ContactBookView, {
      global: {
        stubs: {
          ChildSelector: true,
          SkeletonBlock: true,
          ParentIcon: true,
          KawaiiStar: true,
          RouterLink: {
            template: '<a :href="typeof to === \'string\' ? to : to.path"><slot /></a>',
            props: ['to'],
          },
        },
      },
    })
    await flushPromises()

    const card = wrapper.find('.today-card')
    expect(card.exists()).toBe(true)
    // 改 router-link 後 stub 渲染為 <a>，不該是 <div>
    expect(card.element.tagName).toBe('A')
    expect(card.attributes('href')).toBe('/contact-book/99')
  })

  it('history 卡片也改用 router-link，各筆 href 指向 /contact-book/<id>', async () => {
    mockContactBookApi.listContactBook.mockResolvedValue({
      data: {
        entries: [
          { id: 10, log_date: '2026-05-06', mood: 'normal' },
          { id: 11, log_date: '2026-05-05', mood: 'tired' },
        ],
      },
    })

    const wrapper = mount(ContactBookView, {
      global: {
        stubs: {
          ChildSelector: true,
          SkeletonBlock: true,
          ParentIcon: true,
          KawaiiStar: true,
          RouterLink: {
            template: '<a :href="typeof to === \'string\' ? to : to.path"><slot /></a>',
            props: ['to'],
          },
        },
      },
    })
    await flushPromises()

    const historyCards = wrapper.findAll('.history-card')
    expect(historyCards).toHaveLength(2)
    expect(historyCards[0].element.tagName).toBe('A')
    expect(historyCards[0].attributes('href')).toBe('/contact-book/10')
    expect(historyCards[1].attributes('href')).toBe('/contact-book/11')
  })
})
