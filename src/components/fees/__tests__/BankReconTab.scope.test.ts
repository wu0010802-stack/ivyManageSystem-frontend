/**
 * 對帳工作區（BankReconTab）IA 改版行為：
 * - 預設優先顯示需人工處理的交易（status=imported 待媒合）
 * - 已完成/非學費為歷史檢視 chips；「全部」不帶 status
 * - 流程列與主要控制項 accessible name
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

const apiMocks = vi.hoisted(() => ({
  previewBankImport: vi.fn(),
  confirmBankImport: vi.fn(),
  getBankTransactions: vi.fn(),
  ignoreTransaction: vi.fn(),
  reverseTransaction: vi.fn(),
}))
vi.mock('@/api/fees', () => apiMocks)

const authMocks = vi.hoisted(() => ({ perms: new Set<string>() }))
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => authMocks.perms.has(name),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), prompt: vi.fn() },
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

const GLOBAL_STUBS = {
  'el-table': ElTableStub,
  'el-table-column': { template: '<span />' },
  'el-upload': { template: '<div><slot /></div>' },
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  'el-input': { template: '<input v-bind="$attrs" />' },
  'el-date-picker': { template: '<input v-bind="$attrs" />' },
  'el-descriptions': { template: '<div v-bind="$attrs"><slot /></div>' },
  'el-descriptions-item': { template: '<div><slot /></div>' },
  'el-alert': { template: '<div v-bind="$attrs" />' },
  'el-tag': { template: '<span><slot /></span>' },
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

function mountTab() {
  return mount(BankReconTab, {
    global: { stubs: GLOBAL_STUBS, directives: { loading: () => {} } },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  authMocks.perms = new Set(['FEES_READ', 'FEES_WRITE'])
  apiMocks.getBankTransactions.mockResolvedValue({ total: 0, page: 1, page_size: 50, items: [] })
})

describe('BankReconTab 待處理優先檢視', () => {
  it('預設以 status=imported（待媒合）載入交易', async () => {
    mountTab()
    await flushAll()
    expect(apiMocks.getBankTransactions).toHaveBeenCalledTimes(1)
    expect(apiMocks.getBankTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'imported', page: 1 }),
    )
  })

  it('待媒合 chip 預設啟用；切「全部」後不帶 status 重新查詢', async () => {
    const wrapper = mountTab()
    await flushAll()
    expect(
      wrapper.find('[data-test="recon-scope-imported"]').attributes('aria-pressed'),
    ).toBe('true')
    apiMocks.getBankTransactions.mockClear()
    await wrapper.find('[data-test="recon-scope-all"]').trigger('click')
    await flushAll()
    const params = apiMocks.getBankTransactions.mock.calls[0][0] as Record<string, unknown>
    expect(params.status).toBeUndefined()
  })

  it('提供已分配/非學費歷史檢視 chips（已完成交易移出預設清單）', async () => {
    const wrapper = mountTab()
    await flushAll()
    expect(wrapper.find('[data-test="recon-scope-allocated"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="recon-scope-ignored_non_tuition"]').exists()).toBe(true)
    apiMocks.getBankTransactions.mockClear()
    await wrapper.find('[data-test="recon-scope-allocated"]').trigger('click')
    await flushAll()
    expect(apiMocks.getBankTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'allocated' }),
    )
  })

  it('流程列呈現匯入→媒合→例外→完成四步', async () => {
    const wrapper = mountTab()
    await flushAll()
    const strip = wrapper.find('[aria-label="銀行對帳流程"]')
    expect(strip.exists()).toBe(true)
    const steps = strip.findAll('.flow-step').map((s) => s.text())
    expect(steps).toHaveLength(4)
    expect(steps[0]).toContain('匯入永豐 CSV')
    expect(steps[3]).toContain('確認全數分類')
  })

  it('待媒合清單為空時，空狀態說明下一步並可切到全部', async () => {
    const wrapper = mountTab()
    await flushAll()
    const empty = wrapper.find('[data-testid="empty-state"]')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('沒有待媒合交易')
    expect(wrapper.find('[data-test="recon-empty-show-all"]').exists()).toBe(true)
  })

  it('唯讀（無 FEES_WRITE）時不顯示匯入按鈕、顯示唯讀提示', async () => {
    authMocks.perms = new Set(['FEES_READ'])
    const wrapper = mountTab()
    await flushAll()
    expect(wrapper.find('[data-test="pick-csv"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('唯讀')
  })

  it('日期與末四碼篩選具 accessible name（保留既有篩選）', async () => {
    const wrapper = mountTab()
    await flushAll()
    expect(wrapper.find('[aria-label="以銷帳末四碼篩選"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="入帳起日"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="入帳迄日"]').exists()).toBe(true)
  })
})
