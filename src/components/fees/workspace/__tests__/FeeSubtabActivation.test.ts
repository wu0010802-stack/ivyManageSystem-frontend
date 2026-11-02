/**
 * 工作區內層 KeepAlive 切換時，子頁要重新載入（不得沿用舊快照）。
 *
 * 結算工作區（交接／月結）與入帳媒合（代收／存摺）各自用內層 KeepAlive 保留
 * 子頁實例。外層只在「整個工作區被切回」時刷新，同工作區內切子頁不會觸發，
 * 原本子頁只有 onMounted 載一次：
 *   - 交接「提交」確認框顯示舊的應交付金額、簽收後回月結仍是紅燈
 *   - 存摺勾稽後切到存摺明細仍列待媒合
 *
 * 修法：四個子頁各自 onActivated 重新載入（跳過與 mount 同輪的第一次）。
 * 子頁的 onActivated 也會在祖先 KeepAlive 啟用時觸發，所以外層工作區不得
 * 再重打同一支 API——本檔用真子元件驗「切回只多打一次」。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'

const apiMocks = vi.hoisted(() => ({
  getCashHandovers: vi.fn(),
  getFeeRecords: vi.fn(),
  createCashReceipt: vi.fn(),
  submitCashHandover: vi.fn(),
  confirmCashHandover: vi.fn(),
  reopenCashHandover: vi.fn(),
  getCloseSummary: vi.fn(),
  getClosePeriods: vi.fn(),
  closePeriod: vi.fn(),
  reopenClosePeriod: vi.fn(),
  getCollectionPayments: vi.fn(),
  batchCollectionCandidates: vi.fn(),
  confirmCollectionImport: vi.fn(),
  previewCollectionImport: vi.fn(),
  reconcileCollectionCoverage: vi.fn(),
  reverseCollectionPayment: vi.fn(),
  getBankTransactions: vi.fn(),
  confirmBankImport: vi.fn(),
  ignoreTransaction: vi.fn(),
  previewBankImport: vi.fn(),
  reverseTransaction: vi.fn(),
}))
vi.mock('@/api/fees', () => apiMocks)

vi.mock('@/utils/auth', () => ({
  hasPermission: () => true,
  getUserInfo: () => ({ id: 1 }),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), prompt: vi.fn() },
}))

// 媒合子頁的對話框／抽屜與本檔無關，且各自另有 API 依賴
vi.mock('@/components/fees/CollectionAllocationDialog.vue', () => ({
  __esModule: true,
  default: { name: 'CollectionAllocationDialog', template: '<div />' },
}))
vi.mock('@/components/fees/CollectionBatchDrawer.vue', () => ({
  __esModule: true,
  default: { name: 'CollectionBatchDrawer', template: '<div />' },
}))
vi.mock('@/components/fees/AllocationDialog.vue', () => ({
  __esModule: true,
  default: { name: 'AllocationDialog', template: '<div />' },
}))

const PASS = { template: '<div><slot /></div>' }
const GLOBAL_STUBS = {
  'el-alert': PASS,
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  'el-date-picker': { template: '<input v-bind="$attrs" />' },
  'el-descriptions': PASS,
  'el-descriptions-item': PASS,
  'el-dialog': { template: '<div />' },
  'el-form': PASS,
  'el-form-item': PASS,
  'el-icon': { template: '<i><slot /></i>' },
  'el-input': { template: '<input v-bind="$attrs" />' },
  'el-input-number': { template: '<input v-bind="$attrs" />' },
  'el-option': { template: '<option />' },
  'el-pagination': { template: '<div />' },
  'el-popover': { template: '<div><slot name="reference" /></div>' },
  'el-select': PASS,
  'el-table': { template: '<div />' },
  'el-table-column': { template: '<span />' },
  'el-tag': PASS,
  'el-tooltip': PASS,
  'el-upload': PASS,
  'el-skeleton': { template: '<div />' },
}

const flushAll = async () => {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

import FeeSettlementWorkspace from '../FeeSettlementWorkspace.vue'
import FeeMatchingPanel from '../FeeMatchingPanel.vue'

/**
 * 模擬 StudentFeeView：外層 KeepAlive 包住工作區（show 切換＝切走／切回工作區），
 * 子頁 view/source 由 props 控制（＝同工作區內切子頁）。
 */
function settlementHost() {
  return defineComponent({
    components: { FeeSettlementWorkspace },
    props: {
      show: { type: Boolean, default: true },
      view: { type: String, default: 'handover' },
    },
    template:
      '<KeepAlive><FeeSettlementWorkspace v-if="show" ref="ws" :view="view" /></KeepAlive>',
  })
}

/** 入帳媒合面板在收款工作區裡非 KeepAlive；外層 KeepAlive 包的是整個收款工作區 */
const BillingShell = defineComponent({
  components: { FeeMatchingPanel },
  props: { source: { type: String, default: 'collection' } },
  template: '<div><FeeMatchingPanel :source="source" /></div>',
})
function matchingHost() {
  return defineComponent({
    components: { BillingShell },
    props: {
      show: { type: Boolean, default: true },
      source: { type: String, default: 'collection' },
    },
    template: '<KeepAlive><BillingShell v-if="show" :source="source" /></KeepAlive>',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMocks.getCashHandovers.mockResolvedValue({ items: [] })
  apiMocks.getCloseSummary.mockRejectedValue(new Error('n/a'))
  apiMocks.getClosePeriods.mockResolvedValue({ total: 0, items: [] })
  apiMocks.getCollectionPayments.mockResolvedValue({ items: [], total: 0 })
  apiMocks.getBankTransactions.mockResolvedValue({ items: [], total: 0 })
})

describe('結算工作區：交接／月結切換重新載入', () => {
  it('首次掛載交接只載一次', async () => {
    const wrapper = mount(settlementHost(), { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    expect(apiMocks.getCashHandovers).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('交接 → 月結 → 交接：切回交接重新取交接批（提交確認框不得用舊的應交付金額）', async () => {
    const wrapper = mount(settlementHost(), { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    await wrapper.setProps({ view: 'close' })
    await flushAll()
    await wrapper.setProps({ view: 'handover' })
    await flushAll()
    expect(apiMocks.getCashHandovers).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('月結 → 交接 → 月結：切回月結重新取關帳摘要與列表，並保留使用者選的月份', async () => {
    const wrapper = mount(settlementHost(), {
      props: { view: 'close' },
      global: { stubs: GLOBAL_STUBS },
    })
    await flushAll()
    const ws = wrapper.findComponent(FeeSettlementWorkspace)
    ;(ws.vm as unknown as { onCloseMonthChange: (v: string) => void }).onCloseMonthChange('2026-09')
    await flushAll()
    const summaryBefore = apiMocks.getCloseSummary.mock.calls.length
    const periodsBefore = apiMocks.getClosePeriods.mock.calls.length

    await wrapper.setProps({ view: 'handover' })
    await flushAll()
    await wrapper.setProps({ view: 'close' })
    await flushAll()

    expect(apiMocks.getCloseSummary).toHaveBeenCalledTimes(summaryBefore + 1)
    expect(apiMocks.getClosePeriods).toHaveBeenCalledTimes(periodsBefore + 1)
    expect(apiMocks.getCloseSummary.mock.calls.at(-1)).toEqual([2026, 9])
    wrapper.unmount()
  })

  it('整個結算工作區切走再切回：交接批只重打一次（外層不得與子頁重複刷新）', async () => {
    const wrapper = mount(settlementHost(), { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    await wrapper.setProps({ show: false })
    await flushAll()
    await wrapper.setProps({ show: true })
    await flushAll()
    expect(apiMocks.getCashHandovers).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('停在月結時整個工作區切走再切回：摘要與列表各只重打一次', async () => {
    const wrapper = mount(settlementHost(), {
      props: { view: 'close' },
      global: { stubs: GLOBAL_STUBS },
    })
    await flushAll()
    await wrapper.setProps({ show: false })
    await flushAll()
    await wrapper.setProps({ show: true })
    await flushAll()
    expect(apiMocks.getCloseSummary).toHaveBeenCalledTimes(2)
    expect(apiMocks.getClosePeriods).toHaveBeenCalledTimes(2)
    // 隱藏中的交接頁（從未掛載）不打
    expect(apiMocks.getCashHandovers).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('入帳媒合：代收／存摺切換重新載入', () => {
  it('首次掛載代收只載一次', async () => {
    const wrapper = mount(matchingHost(), { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    expect(apiMocks.getCollectionPayments).toHaveBeenCalledTimes(1)
    expect(apiMocks.getBankTransactions).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('代收 → 存摺 → 代收：兩邊切回都重新載入（存摺勾稽後存摺明細不得仍列待媒合）', async () => {
    const wrapper = mount(matchingHost(), { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    await wrapper.setProps({ source: 'passbook' })
    await flushAll()
    expect(apiMocks.getBankTransactions).toHaveBeenCalledTimes(1)
    await wrapper.setProps({ source: 'collection' })
    await flushAll()
    expect(apiMocks.getCollectionPayments).toHaveBeenCalledTimes(2)
    await wrapper.setProps({ source: 'passbook' })
    await flushAll()
    expect(apiMocks.getBankTransactions).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('整個收款工作區切走再切回：目前來源只重打一次、隱藏中的來源不打', async () => {
    const wrapper = mount(matchingHost(), { global: { stubs: GLOBAL_STUBS } })
    await flushAll()
    await wrapper.setProps({ source: 'passbook' })
    await flushAll()
    const collectionCalls = apiMocks.getCollectionPayments.mock.calls.length
    await wrapper.setProps({ show: false })
    await flushAll()
    await wrapper.setProps({ show: true })
    await flushAll()
    expect(apiMocks.getBankTransactions).toHaveBeenCalledTimes(2)
    expect(apiMocks.getCollectionPayments).toHaveBeenCalledTimes(collectionCalls)
    wrapper.unmount()
  })
})
