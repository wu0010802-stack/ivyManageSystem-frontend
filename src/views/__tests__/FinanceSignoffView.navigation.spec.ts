import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import ElementPlus, { ElMessageBox } from 'element-plus'
import FinanceSignoffView from '../FinanceSignoffView.vue'

vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('element-plus', async original => ({
  ...await original<typeof import('element-plus')>(),
  ElMessageBox: { confirm: vi.fn() },
}))
vi.mock('@/components/signoff/SignoffPanel.vue', () => ({ default: { template: '<div>簽收面板</div>' } }))
vi.mock('@/views/reports/MonthlyFixedCostPanel.vue', async () => {
  const { defineComponent, ref } = await import('vue')
  return { default: defineComponent({
    props: ['year'], emits: ['update:dirty'],
    setup() { return { dirty: ref(false) } },
    template: '<button data-test="draft" :data-year="year" :data-dirty="dirty" @click="dirty = true; $emit(\'update:dirty\', true)">修改草稿</button>',
  }) }
})

async function setup() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/finance-signoffs', component: FinanceSignoffView }] })
  await router.push('/finance-signoffs?tab=fixed-cost&year=2025')
  const wrapper = mount(RouterView, { global: { plugins: [router, ElementPlus] } })
  await flushPromises()
  await wrapper.find('[data-test="draft"]').trigger('click')
  return { wrapper, router }
}

describe('固定支出導覽整合', () => {
  it('真 router 更換年度：取消保留草稿，確認才重掛新年度', async () => {
    const { wrapper, router } = await setup()
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel')
    await router.push('/finance-signoffs?tab=fixed-cost&year=2026')
    await flushPromises()
    expect(router.currentRoute.value.query.year).toBe('2025')
    expect(wrapper.find('[data-test="draft"]').attributes('data-dirty')).toBe('true')
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm')
    await router.push('/finance-signoffs?tab=fixed-cost&year=2026')
    await flushPromises()
    expect(wrapper.find('[data-test="draft"]').attributes('data-year')).toBe('2026')
    expect(wrapper.find('[data-test="draft"]').attributes('data-dirty')).toBe('false')
    wrapper.unmount()
  })

  it('真 Element Plus 頁籤：取消切換保留草稿，確認才進廠商付款', async () => {
    const { wrapper, router } = await setup()
    const vendorTab = wrapper.findAll('[role="tab"]').find(tab => tab.text() === '廠商付款')!
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel')
    await vendorTab.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.tab).toBe('fixed-cost')
    expect(wrapper.find('[data-test="draft"]').attributes('data-dirty')).toBe('true')
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce('confirm')
    await vendorTab.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.tab).toBe('vendor')
    expect(wrapper.find('[data-test="draft"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
