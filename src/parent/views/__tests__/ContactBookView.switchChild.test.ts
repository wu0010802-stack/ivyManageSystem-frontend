/** F14：切換孩子後前一位的聯絡簿不得殘留；新孩子載入失敗要顯示錯誤。 */
import { describe, it, expect, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ContactBookView from '../ContactBookView.vue'
import ContactBookDayCard from '@/parent/components/contact-book/ContactBookDayCard.vue'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'

const state = await vi.hoisted(async () => {
  const { ref } = await import('vue')
  return { selected: ref(1), today: vi.fn(), history: vi.fn() }
})
vi.mock('@/parent/composables/useChildSelection', () => ({ useChildSelection: () => ({ selectedId: state.selected, ensureSelected: vi.fn() }) }))
vi.mock('@/parent/stores/children', () => ({ useChildrenStore: () => ({
  items: [{ student_id: 1, name: '合成甲', classroom_name: '甲班' }, { student_id: 2, name: '合成乙', classroom_name: '乙班' }],
  load: vi.fn().mockResolvedValue(undefined),
}) }))
vi.mock('@/parent/api/contactBook', () => ({ getTodayContactBook: state.today, listContactBook: state.history }))
vi.mock('@/parent/utils/parentOfflineQueue', () => ({ flushParentQueue: vi.fn().mockResolvedValue({}) }))
vi.mock('@/parent/utils/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

describe('ContactBookView 切換孩子（F14）', () => {
  it('乙載入失敗時清掉甲的資料並顯示錯誤，不把甲的聯絡簿掛在乙名下', async () => {
    state.selected.value = 1
    state.today.mockImplementation((sid: number) => sid === 1
      ? Promise.resolve({ data: { entry: { id: 101, student_id: 1, log_date: '2026-10-04', isRead: false } } })
      : Promise.reject(new Error('synthetic network error')))
    state.history.mockResolvedValue({ data: { entries: [] } })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
    await router.push('/')
    const wrapper = shallowMount(ContactBookView, { global: { plugins: [createPinia(), router], stubs: { RouterLink: { template: '<div><slot /></div>' } } } })
    await flushPromises()
    expect(wrapper.findComponent(ContactBookDayCard).props('entry').student_id).toBe(1)
    state.selected.value = 2
    await flushPromises()
    expect(wrapper.findComponent(ContactBookDayCard).exists()).toBe(false)
    expect(wrapper.findComponent(MobileErrorRetry).exists()).toBe(true)
    wrapper.unmount()
  })
})
