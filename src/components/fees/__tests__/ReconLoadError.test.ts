/**
 * 入帳媒合（代收明細／存摺明細）載入失敗與末四碼篩選（2026-11-02 bug hunt F4）。
 *
 * staging 實測：末四碼輸入 3 碼 → 後端 suffix 是 min_length=max_length=4 →
 * 422 → 清單先被清空、catch 只跳 toast，空狀態照樣畫「沒有待媒合的繳費」——
 * 使用者以為錢都媒合完了。修法：
 *   - 載入失敗另立狀態：空狀態區顯示「載入失敗」＋重試，不再說「沒有待媒合」
 *   - 末四碼只有空值或剛好 4 位數字才送查詢；不足 4 碼顯示行內提示、不打 API
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

const apiMocks = vi.hoisted(() => ({
  // 代收明細
  batchCollectionCandidates: vi.fn(),
  confirmCollectionImport: vi.fn(),
  getCollectionPayments: vi.fn(),
  previewCollectionImport: vi.fn(),
  reconcileCollectionCoverage: vi.fn(),
  reverseCollectionPayment: vi.fn(),
  // 存摺明細
  previewBankImport: vi.fn(),
  confirmBankImport: vi.fn(),
  getBankTransactions: vi.fn(),
  ignoreTransaction: vi.fn(),
  reverseTransaction: vi.fn(),
}))
vi.mock('@/api/fees', () => apiMocks)

vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), prompt: vi.fn() },
}))

vi.mock('@/components/fees/CollectionAllocationDialog.vue', () => ({
  __esModule: true,
  default: { name: 'CollectionAllocationDialog', template: '<div />' },
}))
vi.mock('@/components/fees/CollectionBatchDrawer.vue', () => ({
  __esModule: true,
  default: { name: 'CollectionBatchDrawer', template: '<div />' },
}))

const ElTableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        { 'data-testid': 'table' },
        props.data.length === 0 ? [slots.empty?.()] : [slots.default?.()],
      )
  },
})

const PASS = { template: '<div v-bind="$attrs"><slot /></div>' }
const GLOBAL_STUBS = {
  'el-table': ElTableStub,
  'el-table-column': { template: '<span />' },
  'el-upload': PASS,
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  // 受控：input 回拋 update:model-value，change 回拋 change（模擬按 Enter／失焦；
  // VTU setValue 會依序觸發 input 與 change）
  'el-input': {
    props: ['modelValue'],
    emits: ['update:modelValue', 'change'],
    template:
      '<input v-bind="$attrs" :value="modelValue" '
      + '@input="$emit(\'update:modelValue\', $event.target.value)" '
      + '@change="$emit(\'change\', $event.target.value)" />',
  },
  'el-date-picker': { template: '<input v-bind="$attrs" />' },
  'el-select': PASS,
  'el-option': { template: '<option />' },
  'el-descriptions': PASS,
  'el-descriptions-item': PASS,
  'el-alert': PASS,
  'el-tag': { template: '<span><slot /></span>' },
  'el-tooltip': PASS,
  'el-dialog': { template: '<div />' },
  'el-pagination': { template: '<div />' },
  AllocationDialog: true,
  EmptyState: {
    props: ['title', 'description'],
    template:
      '<div data-testid="empty-state"><p>{{ title }}</p><p>{{ description }}</p><slot name="action" /></div>',
  },
}

const flushAll = async () => {
  for (let i = 0; i < 4; i += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

import BankReconTab from '@/components/fees/BankReconTab.vue'
import CollectionReconTab from '@/components/fees/CollectionReconTab.vue'

const SUFFIX_INPUT = 'input[aria-label="以銷帳末四碼篩選"]'

const CASES = [
  {
    name: '代收明細',
    component: CollectionReconTab,
    api: apiMocks.getCollectionPayments,
    emptyText: '沒有待媒合的繳費',
    retry: '[data-test="collection-load-retry"]',
    hint: '[data-test="collection-suffix-hint"]',
  },
  {
    name: '存摺明細',
    component: BankReconTab,
    api: apiMocks.getBankTransactions,
    emptyText: '沒有待媒合交易',
    retry: '[data-test="recon-load-retry"]',
    hint: '[data-test="recon-suffix-hint"]',
  },
] as const

function mountTab(component: (typeof CASES)[number]['component']) {
  return mount(component, {
    global: { stubs: GLOBAL_STUBS, directives: { loading: () => {} } },
  })
}

function lastParams(api: (typeof CASES)[number]['api']): Record<string, unknown> {
  return api.mock.calls.at(-1)?.[0] as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMocks.getCollectionPayments.mockResolvedValue({ items: [], total: 0 })
  apiMocks.getBankTransactions.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 })
})

describe.each(CASES)('$name：載入失敗不得畫成「沒有待媒合」', (c) => {
  it('API 失敗 → 空狀態顯示載入失敗＋重試，不說沒有待媒合', async () => {
    c.api.mockRejectedValueOnce(Object.assign(new Error('boom'), { response: { status: 500 } }))
    const wrapper = mountTab(c.component)
    await flushAll()
    const empty = wrapper.find('[data-testid="empty-state"]')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('載入失敗')
    expect(empty.text()).not.toContain(c.emptyText)
    expect(wrapper.find(c.retry).exists()).toBe(true)
    wrapper.unmount()
  })

  it('按重試再打一次，成功後回到正常空狀態', async () => {
    c.api.mockRejectedValueOnce(Object.assign(new Error('boom'), { response: { status: 500 } }))
    const wrapper = mountTab(c.component)
    await flushAll()
    const before = c.api.mock.calls.length
    await wrapper.find(c.retry).trigger('click')
    await flushAll()
    expect(c.api).toHaveBeenCalledTimes(before + 1)
    expect(wrapper.find('[data-testid="empty-state"]').text()).not.toContain('載入失敗')
    expect(wrapper.find(c.retry).exists()).toBe(false)
    wrapper.unmount()
  })
})

describe.each(CASES)('$name：末四碼篩選只送空值或 4 位數字', (c) => {
  it('輸入 3 碼送出 → 不打 API、顯示行內提示', async () => {
    const wrapper = mountTab(c.component)
    await flushAll()
    const before = c.api.mock.calls.length
    const input = wrapper.find(SUFFIX_INPUT)
    await input.setValue('123')
    await flushAll()
    expect(c.api).toHaveBeenCalledTimes(before)
    expect(wrapper.find(c.hint).exists()).toBe(true)
    expect(wrapper.find(c.hint).text()).toContain('4 位數字')
    wrapper.unmount()
  })

  it('補滿 4 碼 → 帶 suffix 查詢、提示消失', async () => {
    const wrapper = mountTab(c.component)
    await flushAll()
    const input = wrapper.find(SUFFIX_INPUT)
    await input.setValue('123')
    await flushAll()
    await input.setValue('1234')
    await flushAll()
    expect(lastParams(c.api).suffix).toBe('1234')
    expect(wrapper.find(c.hint).exists()).toBe(false)
    wrapper.unmount()
  })

  it('清空 → 不帶 suffix 重查', async () => {
    const wrapper = mountTab(c.component)
    await flushAll()
    const input = wrapper.find(SUFFIX_INPUT)
    await input.setValue('1234')
    await flushAll()
    const before = c.api.mock.calls.length
    await input.setValue('')
    await flushAll()
    expect(c.api).toHaveBeenCalledTimes(before + 1)
    expect(lastParams(c.api).suffix).toBeUndefined()
    wrapper.unmount()
  })

  it('末四碼停在不足 4 碼時，其他刷新（重新整理）不得把殘缺碼送出', async () => {
    const wrapper = mountTab(c.component)
    await flushAll()
    const input = wrapper.find(SUFFIX_INPUT)
    await input.setValue('12')
    await flushAll()
    const refresh = wrapper
      .findAll('button')
      .find((b) => b.text() === '重新整理')
    expect(refresh).toBeDefined()
    await refresh!.trigger('click')
    await flushAll()
    expect(lastParams(c.api).suffix).toBeUndefined()
    wrapper.unmount()
  })
})
