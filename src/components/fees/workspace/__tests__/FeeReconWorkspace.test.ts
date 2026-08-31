/**
 * SPEC-016 對帳工作區：代收明細為預設、存摺明細為勾稽層；
 * 切換發出 change-view，同值不重複發。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@/components/fees/CollectionReconTab.vue', () => ({
  default: { name: 'CollectionReconTab', template: '<div data-testid="collection-tab" />' },
}))
vi.mock('@/components/fees/BankReconTab.vue', () => ({
  default: { name: 'BankReconTab', template: '<div data-testid="passbook-tab" />' },
}))
vi.mock('@/components/fees/BillSlipTab.vue', () => ({
  default: { name: 'BillSlipTab', template: '<div data-testid="billslip-tab" />' },
}))

const STUBS = {
  'el-segmented': {
    props: ['modelValue', 'options'],
    emits: ['change'],
    template:
      '<div v-bind="$attrs"><button v-for="o in options" :key="o.value" :data-test="`view-${o.value}`" @click="$emit(\'change\', o.value)">{{ o.label }}</button></div>',
  },
}

async function mountWorkspace(view?: string) {
  const FeeReconWorkspace = (await import('../FeeReconWorkspace.vue')).default
  return mount(FeeReconWorkspace, {
    props: view ? { view } : {},
    global: { stubs: STUBS },
  })
}

beforeEach(() => vi.clearAllMocks())

describe('FeeReconWorkspace', () => {
  it('預設顯示代收明細（對帳主來源）', async () => {
    const wrapper = await mountWorkspace()
    expect(wrapper.find('[data-testid="collection-tab"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="passbook-tab"]').exists()).toBe(false)
  })

  it('view=passbook 顯示存摺明細並提示為勾稽層', async () => {
    const wrapper = await mountWorkspace('passbook')
    expect(wrapper.find('[data-testid="passbook-tab"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('勾稽層')
  })

  it('切換檢視發出 change-view', async () => {
    const wrapper = await mountWorkspace('collection')
    await wrapper.find('[data-test="view-passbook"]').trigger('click')
    expect(wrapper.emitted('change-view')).toEqual([['passbook']])
  })

  it('view=billslips 顯示發單快照並提示為應收母體', async () => {
    const wrapper = await mountWorkspace('billslips')
    expect(wrapper.find('[data-testid="billslip-tab"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('應收母體')
  })

  it('點目前檢視不重複發事件', async () => {
    const wrapper = await mountWorkspace('collection')
    await wrapper.find('[data-test="view-collection"]').trigger('click')
    expect(wrapper.emitted('change-view')).toBeUndefined()
  })
})
