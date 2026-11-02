/**
 * 發單批次抽屜：BillSlipTab 的事件要原樣往收款工作區冒。
 *
 * 2026-11-02 bug hunt F8：匯入／刪除批次後待辦總覽沒刷新，因為抽屜只轉發
 * generated。batches-changed 也要轉發，收款工作區才會 refreshOverview。
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@/components/fees/BillSlipTab.vue', () => ({
  __esModule: true,
  default: {
    name: 'BillSlipTab',
    props: { embedded: { type: Boolean, default: false } },
    emits: ['generated', 'batches-changed'],
    template: '<div data-testid="bill-slip-tab" />',
  },
}))

import FeeBillSlipDrawer from '../FeeBillSlipDrawer.vue'

function mountDrawer() {
  return mount(FeeBillSlipDrawer, {
    props: { modelValue: true },
    global: {
      stubs: {
        'el-drawer': { template: '<div><slot name="header" /><slot /></div>' },
      },
    },
  })
}

describe('FeeBillSlipDrawer 事件轉發', () => {
  it('BillSlipTab 的 batches-changed 轉發給收款工作區', async () => {
    const wrapper = mountDrawer()
    wrapper.findComponent({ name: 'BillSlipTab' }).vm.$emit('batches-changed')
    expect(wrapper.emitted('batches-changed')).toHaveLength(1)
  })

  it('generated 照舊轉發', async () => {
    const wrapper = mountDrawer()
    wrapper.findComponent({ name: 'BillSlipTab' }).vm.$emit('generated')
    expect(wrapper.emitted('generated')).toHaveLength(1)
  })
})
