import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import FeeUnresolvedDialog from '../FeeUnresolvedDialog.vue'

const mocks = vi.hoisted(() => ({
  getBillSlipBatches: vi.fn(),
  getOutstandingReport: vi.fn(),
  reset: undefined as (() => void) | undefined,
  unsubscribe: vi.fn(),
}))
vi.mock('@/api/fees', () => mocks)
vi.mock('@/utils/adminSession', () => ({
  onAdminSessionReset: (fn: () => void) => {
    mocks.reset = fn
    return mocks.unsubscribe
  },
}))
const batch = (id: number, unresolved = 1) => ({
  id,
  unresolved_count: unresolved,
  bill_year: 2026,
  bill_month: id,
  title: `測試批次${id}`,
  records_generated_count: id === 2 ? 0 : 1,
})
const item = (id: number, name: string, amount = 100, studentId: number | null = null) => ({
  item_id: id,
  student_name: name,
  net_amount: amount,
  student_id: studentId,
  classroom_name: '測試班',
})
function mountDialog() {
  return mount(FeeUnresolvedDialog, {
    props: { modelValue: true },
    global: {
      stubs: {
        'el-dialog': {
          props: ['modelValue'],
          template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>',
        },
        'el-button': { template: '<button><slot /></button>' },
      },
    },
  })
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.getBillSlipBatches.mockResolvedValue([batch(1), batch(2), batch(3, 0)])
  mocks.getOutstandingReport.mockImplementation(async (id: number) => ({
    items:
      id === 1
        ? [item(1, '測試甲'), item(2, '零元排除', 0), item(3, '已匹配排除', 200, 9)]
        : [item(1, '測試乙', -20)],
  }))
})
describe('未匹配費用單名單', () => {
  it('跨批次列出未匹配非零元資料，包含負額並排除已匹配和零元', async () => {
    const wrapper = mountDialog()
    expect(wrapper.text()).toContain('正在載入')
    await flushPromises()
    expect(wrapper.text()).toContain('測試甲')
    expect(wrapper.text()).toContain('測試乙')
    expect(wrapper.text()).toContain('共 2 筆，合計 NT$80')
    expect(wrapper.text()).toContain('測試批次1')
    expect(wrapper.text()).toContain('2026/02')
    expect(wrapper.text()).not.toContain('零元排除')
    expect(wrapper.text()).not.toContain('已匹配排除')
    expect(mocks.getOutstandingReport.mock.calls).toEqual([[1], [2]])
    await wrapper.findAll('button').at(-1)!.trigger('click')
    expect(wrapper.emitted('imports')).toHaveLength(1)
    wrapper.unmount()
  })
  it('任一批次失敗不顯示部分名單，重試成功才顯示', async () => {
    mocks.getOutstandingReport
      .mockResolvedValueOnce({ items: [item(1, '部分資料')] })
      .mockRejectedValueOnce(new Error('失敗'))
    const wrapper = mountDialog()
    await flushPromises()
    expect(wrapper.text()).toContain('無法載入完整名單')
    expect(wrapper.text()).not.toContain('部分資料')
    await wrapper.findAll('button')[0]!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('測試甲')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })
  it('沒有未匹配資料時顯示空狀態', async () => {
    mocks.getBillSlipBatches.mockResolvedValue([])
    const wrapper = mountDialog()
    await flushPromises()
    expect(wrapper.text()).toContain('目前沒有未匹配')
    expect(mocks.getOutstandingReport).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('關閉再開啟時不回填舊請求，且不繼續查舊批次', async () => {
    const old = deferred<{ items: ReturnType<typeof item>[] }>()
    mocks.getOutstandingReport.mockReturnValueOnce(old.promise)
    const wrapper = mountDialog()
    await flushPromises()
    await wrapper.setProps({ modelValue: false })
    mocks.getBillSlipBatches.mockResolvedValue([batch(2)])
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    old.resolve({ items: [item(1, '過期名單')] })
    await flushPromises()
    expect(wrapper.text()).toContain('測試乙')
    expect(wrapper.text()).not.toContain('過期名單')
    expect(mocks.getOutstandingReport.mock.calls).toEqual([[1], [2]])
    wrapper.unmount()
  })
  it('切換身分立即清空並關閉，舊回應不能回填', async () => {
    const old = deferred<{ items: ReturnType<typeof item>[] }>()
    mocks.getOutstandingReport.mockReturnValueOnce(old.promise)
    const wrapper = mountDialog()
    await flushPromises()
    mocks.reset!()
    old.resolve({ items: [item(1, '舊帳號姓名')] })
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(wrapper.text()).not.toContain('舊帳號姓名')
    expect(mocks.getOutstandingReport).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1)
  })
})
