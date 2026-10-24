import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AllocationDialog from '../AllocationDialog.vue'

const api = vi.hoisted(() => ({ getTransactionCandidates: vi.fn(), allocateTransaction: vi.fn() }))
vi.mock('@/api/fees', () => api)
vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn(), success: vi.fn() } }))
const txn = { id: 1, posting_date: '2026-09-01', amount: 100, unallocated: 100, collection_suffix: null }
const candidates = (label: string) => ({ level: 'needs_review', reasons: [label], candidates: [] })
function mountDialog() {
  return mount(AllocationDialog, { props: { visible: true, txn }, global: { stubs: {
    'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
    'el-button': { template: '<button><slot /></button>' },
    'el-card': true, 'el-option': true, 'el-select': true, 'el-input-number': true, 'el-input': true,
    'el-tag': { template: '<span><slot /></span>' },
  } } })
}

describe('存摺分配候選競態', () => {
  it('切換交易後不顯示較晚回來的舊候選', async () => {
    let resolveOld!: (value: ReturnType<typeof candidates>) => void
    api.getTransactionCandidates.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
    const wrapper = mountDialog()
    api.getTransactionCandidates.mockResolvedValueOnce(candidates('新交易'))
    await wrapper.setProps({ txn: { ...txn, id: 2 } })
    await flushPromises()
    resolveOld(candidates('舊交易'))
    await flushPromises()
    expect(wrapper.get('[data-test="alloc-candidates"]').text()).toContain('新交易')
    wrapper.unmount()
  })

  it('關閉後不重新顯示尚未完成的候選', async () => {
    let resolveOld!: (value: ReturnType<typeof candidates>) => void
    api.getTransactionCandidates.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
    const wrapper = mountDialog()
    await wrapper.setProps({ visible: false })
    resolveOld(candidates('舊交易'))
    await flushPromises()
    expect(wrapper.find('[data-test="alloc-candidates"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
