/**
 * SPEC-016 代收明細對帳工作台：
 * - 預設鎖「待媒合」；chips 對應伺服器單值 status 篩選
 * - 列顯示帳單面額（毛額）／手續費／帳單期別；舊期別標警示
 * - 匯入預覽以毛額與手續費為口徑；無寫入權限時隱藏匯入與分配
 * - 存摺勾稽 dry-run 預覽不寫入
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

const apiMocks = vi.hoisted(() => ({
  previewCollectionImport: vi.fn(),
  confirmCollectionImport: vi.fn(),
  getCollectionPayments: vi.fn(),
  getCollectionCandidates: vi.fn(),
  allocateCollectionPayment: vi.fn(),
  reverseCollectionPayment: vi.fn(),
  reconcileCollectionCoverage: vi.fn(),
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
  'el-descriptions-item': {
    props: ['label'],
    template: '<div><span>{{ label }}</span><slot /></div>',
  },
  'el-alert': { template: '<div v-bind="$attrs" />' },
  'el-tag': { template: '<span v-bind="$attrs"><slot /></span>' },
  'el-pagination': { template: '<div />' },
  'el-dialog': { template: '<div v-bind="$attrs"><slot /><slot name="footer" /></div>' },
  CollectionAllocationDialog: true,
  EmptyState: {
    props: ['title', 'description'],
    template:
      '<div data-testid="empty-state"><p>{{ title }}</p><p>{{ description }}</p><slot name="action" /></div>',
  },
}

const PAYMENT = {
  id: 11,
  import_id: 1,
  customer_paid_date: '2026-08-03',
  channel: '統一',
  gross_amount: 10800,
  net_amount: 10798,
  fee_amount: 2,
  collection_suffix: '1104',
  bill_year: 2026,
  bill_month: 8,
  posting_date: '2026-08-10',
  expected_posting_date: '2026-08-10',
  occurrence_index: 0,
  reconciliation_status: 'imported',
  status_note: null,
  allocated_total: 0,
  unallocated: 10800,
}

async function mountTab(payments = [PAYMENT]) {
  apiMocks.getCollectionPayments.mockResolvedValue({
    total: payments.length,
    page: 1,
    page_size: 50,
    items: payments,
  })
  const CollectionReconTab = (await import('../CollectionReconTab.vue')).default
  const wrapper = mount(CollectionReconTab, { global: { stubs: GLOBAL_STUBS } })
  await nextTick()
  await nextTick()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  authMocks.perms = new Set(['FEES_READ', 'FEES_WRITE'])
})

describe('CollectionReconTab 預設檢視', () => {
  it('預設以待媒合（status=imported）查詢', async () => {
    await mountTab()
    expect(apiMocks.getCollectionPayments).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'imported' }),
    )
  })

  it('切「全部」不帶 status', async () => {
    const wrapper = await mountTab()
    await wrapper.find('[data-test="collection-scope-all"]').trigger('click')
    await nextTick()
    const lastCall = apiMocks.getCollectionPayments.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >
    expect(lastCall.status).toBeUndefined()
  })

  it('空清單顯示待媒合語境的 EmptyState', async () => {
    const wrapper = await mountTab([])
    expect(wrapper.find('[data-testid="empty-state"]').text()).toContain('待媒合')
  })
})

describe('CollectionReconTab 匯入', () => {
  it('預覽以毛額與手續費為口徑', async () => {
    apiMocks.previewCollectionImport.mockResolvedValue({
      statement_start: '2026-08-03',
      statement_end: '2026-08-11',
      row_count: 144,
      gross_total: 1980692,
      net_total: 1980548,
      fee_total: 144,
      decoded_count: 144,
      old_period_count: 2,
      duplicate_count: 0,
      error_count: 0,
      already_imported: false,
      parser_version: 'sinopac-collection-csv-v1',
    })
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      pickedFile: File | null
      runPreview: () => Promise<void>
    }
    vm.pickedFile = new File(['x'], 'CS_1.csv')
    await vm.runPreview()
    await nextTick()
    const text = wrapper.find('[data-test="import-preview"]').text()
    expect(text).toContain('帳單面額合計')
    expect(text).toContain('手續費合計')
    expect(text).toContain('舊期別帳號')
  })

  it('唯讀權限隱藏匯入與分配按鈕', async () => {
    authMocks.perms = new Set(['FEES_READ'])
    const wrapper = await mountTab()
    expect(wrapper.find('[data-test="pick-cs-csv"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="open-alloc"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('唯讀檢視')
  })
})

describe('CollectionReconTab 存摺勾稽', () => {
  it('預覽以 dry_run 呼叫、不立即標記', async () => {
    apiMocks.reconcileCollectionCoverage.mockResolvedValue({
      covered_count: 1,
      days: [
        {
          posting_date: '2026-08-10',
          collection_net_total: 10798,
          collection_count: 1,
          passbook_total: 10798,
          difference: 0,
          matched: true,
          transaction_ids: [5],
        },
      ],
    })
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      coverage: { date_from: string | null; date_to: string | null }
      runCoverage: (dry: boolean) => Promise<void>
    }
    vm.coverage.date_from = '2026-08-01'
    vm.coverage.date_to = '2026-08-31'
    await vm.runCoverage(true)
    expect(apiMocks.reconcileCollectionCoverage).toHaveBeenCalledWith(
      expect.objectContaining({ dry_run: true }),
    )
  })

  it('未選區間不送出請求', async () => {
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as { runCoverage: (dry: boolean) => Promise<void> }
    await vm.runCoverage(true)
    expect(apiMocks.reconcileCollectionCoverage).not.toHaveBeenCalled()
  })
})
