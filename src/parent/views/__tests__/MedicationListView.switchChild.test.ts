/**
 * 用藥單：與 F14／F19 同型（2026-10-04 家長端深掃獨立審查 FE-R1）。
 * 換孩子後新孩子載入失敗時，前一位的用藥單不得掛在新孩子名下；冷啟動失敗不得
 * 顯示成「沒有用藥紀錄」——錯誤要是可重試的持久錯誤態。所有 API 為合成 mock。
 */
import { describe, it, expect, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import MedicationListView from '../MedicationListView.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'

const state = await vi.hoisted(async () => {
  const { ref } = await import('vue')
  return { selected: ref(1), list: vi.fn() }
})
vi.mock('@/parent/composables/useChildSelection', () => ({ useChildSelection: () => ({ selectedId: state.selected, ensureSelected: vi.fn() }) }))
vi.mock('@/parent/stores/children', () => ({ useChildrenStore: () => ({
  items: [{ student_id: 1, name: '合成甲' }, { student_id: 2, name: '合成乙' }],
  load: vi.fn().mockResolvedValue(undefined),
}) }))
vi.mock('@/parent/api/medications', () => ({ listMedicationOrders: state.list }))
vi.mock('@/parent/utils/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

async function mountView() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  await router.push('/')
  const wrapper = shallowMount(MedicationListView, { global: { plugins: [createPinia(), router] } })
  await flushPromises()
  return wrapper
}

describe('MedicationListView 切換孩子與載入失敗', () => {
  it('乙載入失敗時清掉甲的用藥單並顯示錯誤，不把甲的藥名掛在乙名下', async () => {
    state.selected.value = 1
    state.list.mockImplementation(({ student_id }: { student_id: number }) => student_id === 1
      ? Promise.resolve({ data: { items: [{ id: 11, medication_name: '合成甲的藥', order_date: '2026-10-04', logs: [] }] } })
      : Promise.reject(new Error('synthetic network error')))
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('合成甲的藥')

    state.selected.value = 2
    await flushPromises()

    expect(wrapper.text()).not.toContain('合成甲的藥')
    expect(wrapper.findComponent(MobileErrorRetry).exists()).toBe(true)
    wrapper.unmount()
  })

  it('冷啟動載入失敗顯示可重試錯誤，不是「沒有用藥紀錄」', async () => {
    state.selected.value = 2
    state.list.mockRejectedValue(new Error('synthetic 500'))
    const wrapper = await mountView()

    expect(wrapper.findComponent(EmptyState).exists()).toBe(false)
    expect(wrapper.findComponent(MobileErrorRetry).exists()).toBe(true)
    wrapper.unmount()
  })
})
