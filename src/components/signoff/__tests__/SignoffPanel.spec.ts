import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn().mockReturnValue(true) }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockResolvedValue(true) },
}))
vi.mock('@/utils/download', () => ({ downloadFile: vi.fn().mockResolvedValue(true) }))

import { hasPermission } from '@/utils/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import { downloadFile } from '@/utils/download'
import {
  VENDOR_SIGNOFF_MODULE,
  MISC_SIGNOFF_MODULE,
  type SignoffModuleConfig,
  type SignoffModuleApi,
} from '@/config/signoffModules'
import SignoffPanel from '../SignoffPanel.vue'

const globalStubs = {
  'el-button': { template: '<button data-test="el-button" @click="$emit(\'click\')"><slot /></button>' },
  'el-input': { template: '<input />', props: ['modelValue'] },
  'el-input-number': { template: '<input type="number" />', props: ['modelValue'] },
  'el-select': { template: '<select><slot /></select>', props: ['modelValue'] },
  'el-option': { template: '<option><slot /></option>' },
  'el-date-picker': { template: '<input type="date" />', props: ['modelValue'] },
  // 不渲染 el-table 內部 slot（避免 row scoped slot 解構錯誤），把整列值攤平成文字
  'el-table': {
    template:
      '<table data-test="so-table"><tbody><tr v-for="r in data" :key="r.id"><td>{{ Object.values(r).join(" ") }}</td></tr></tbody></table>',
    props: ['data'],
  },
  'el-table-column': { template: '<span />' },
  'el-dialog': {
    template: '<div v-if="modelValue" class="el-dialog-stub"><slot /><slot name="footer" /></div>',
    props: ['modelValue'],
  },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div class="el-form-item"><slot /></div>' },
  'el-pagination': { template: '<div class="el-pagination" />' },
  'el-upload': { template: '<div class="el-upload"><slot /></div>' },
  'el-radio-group': { template: '<div class="el-radio-group"><slot /></div>', props: ['modelValue'] },
  'el-radio-button': { template: '<label class="el-radio-button"><slot /></label>', props: ['value'] },
  'el-skeleton': { template: '<div class="el-skeleton" />' },
  'el-dropdown': { template: '<div class="el-dropdown"><slot /><slot name="dropdown" /></div>' },
  'el-dropdown-menu': { template: '<div><slot /></div>' },
  'el-dropdown-item': { template: '<div class="el-dropdown-item"><slot /></div>', props: ['command'] },
  'el-icon': { template: '<i><slot /></i>' },
  SignoffSignDialog: { template: '<div class="sign-dialog-stub" />' },
}

const globalDirectives = {
  loading: { mounted: () => {}, updated: () => {} },
}

function makeItems(cfg: SignoffModuleConfig): Record<string, unknown>[] {
  return [
    {
      id: 1,
      [cfg.fields.date.key]: '2026-05-15',
      [cfg.fields.partyName.key]: '甲方一號',
      amount: 1200,
      payment_method: 'cash',
      description: '第一筆',
      [cfg.fields.docNumber.key]: 'AB-001',
      notes: null,
      attachments: [],
      status: 'pending',
      ...(cfg.category ? { category: 'rent' } : {}),
      signer_id: null, signer_name: null, signed_at: null, signature_kind: null,
      has_signature: false, created_by_id: 1, created_by_name: 'admin',
      created_at: '2026-05-15T10:00:00', updated_at: '2026-05-15T10:00:00',
    },
    {
      id: 2,
      [cfg.fields.date.key]: '2026-05-10',
      [cfg.fields.partyName.key]: '乙方二號',
      amount: 8800,
      payment_method: 'bank_transfer',
      description: '第二筆',
      [cfg.fields.docNumber.key]: null,
      notes: '已對帳',
      attachments: [],
      status: 'signed',
      ...(cfg.category ? { category: 'donation' } : {}),
      signer_id: 7, signer_name: '林主任', signed_at: '2026-05-11T09:30:00', signature_kind: 'drawn',
      has_signature: true, created_by_id: 1, created_by_name: 'admin',
      created_at: '2026-05-10T10:00:00', updated_at: '2026-05-11T09:30:00',
    },
  ]
}

function makeMockApi(cfg: SignoffModuleConfig): SignoffModuleApi {
  return {
    list: vi.fn().mockResolvedValue({ data: { items: makeItems(cfg), total: 2, page: 1, page_size: 20 } }),
    summary: vi.fn().mockResolvedValue({
      data: {
        total_count: 2, total_amount: 10000,
        pending_count: 1, pending_amount: 1200,
        signed_count: 1, signed_amount: 8800,
      },
    }),
    get: vi.fn().mockResolvedValue({ data: makeItems(cfg)[0] }),
    create: vi.fn().mockResolvedValue({ data: { id: 99 } }),
    update: vi.fn().mockResolvedValue({ data: { message: 'ok' } }),
    remove: vi.fn().mockResolvedValue({ data: { message: 'ok' } }),
    sign: vi.fn().mockResolvedValue({ data: { message: 'ok' } }),
    batchSign: vi.fn().mockResolvedValue({ data: { results: [], succeeded: 0, failed: 0 } }),
    uploadAttachment: vi.fn().mockResolvedValue({ data: {} }),
    deleteAttachment: vi.fn().mockResolvedValue({ data: {} }),
    attachmentDownloadUrl: (id: number, key: string) => `/x/${id}/${key}`,
    signatureUrl: (id: number) => `/x/${id}/signature`,
  }
}

interface BatchSignResult {
  results: Array<{ id: number | null; ok: boolean; error?: string | null }>
  succeeded: number
  failed: number
}

interface PanelVm {
  filters: { status: string; partyName: string; category: string; dateRange: string[] | null }
  form: Record<string, unknown>
  editingId: number | null
  dialogVisible: boolean
  items: Record<string, unknown>[]
  selectedRows: Record<string, unknown>[]
  batchSignRows: Array<{ id: number; partyName: string; amount: number }>
  signDialogVisible: boolean
  fetchList: () => Promise<void>
  openCreate: () => void
  handleSave: () => Promise<unknown>
  handleDelete: (row: Record<string, unknown>) => Promise<void>
  disabledFutureDate: (t: Date) => boolean
  selectableRow: (row: Record<string, unknown>) => boolean
  onSelectionChange: (rows: Record<string, unknown>[]) => void
  openBatchSign: () => void
  onSigned: (result?: BatchSignResult) => Promise<void>
  handleExport: () => Promise<void>
}

const CASES: [string, SignoffModuleConfig][] = [
  ['vendor', VENDOR_SIGNOFF_MODULE],
  ['misc', MISC_SIGNOFF_MODULE],
]

describe.each(CASES)('SignoffPanel (%s)', (_name, baseCfg) => {
  let mockApi: SignoffModuleApi
  let cfg: SignoffModuleConfig

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(hasPermission).mockReturnValue(true)
    mockApi = makeMockApi(baseCfg)
    cfg = { ...baseCfg, api: mockApi }
  })

  const mountPanel = (highlightId: number | null = null) =>
    mount(SignoffPanel, {
      props: { config: cfg, highlightId },
      global: { stubs: globalStubs, directives: globalDirectives },
    })

  it('掛載即載入列表並渲染資料', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(mockApi.list).toHaveBeenCalled()
    expect(wrapper.text()).toContain('甲方一號')
    expect(wrapper.text()).toContain('乙方二號')
  })

  it('掛載載入彙總並渲染 KPI 卡（文案來自 config）', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(mockApi.summary).toHaveBeenCalled()
    const text = wrapper.text()
    expect(text).toContain(cfg.texts.kpiTotalLabel)
    expect(text).toContain(cfg.texts.kpiPendingLabel)
    expect(text).toContain('已簽收')
    expect(text).toContain('1 筆等待回簽')
    expect(text).toContain('NT$10,000')
    expect(text).toContain('NT$1,200')
  })

  it('只改 status 只刷列表、彙總不重抓', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    vi.mocked(mockApi.summary).mockClear()
    vi.mocked(mockApi.list).mockClear()
    const vm = wrapper.vm as unknown as PanelVm
    vm.filters.status = 'pending'
    await vm.fetchList()
    expect(mockApi.list).toHaveBeenCalled()
    expect(mockApi.summary).not.toHaveBeenCalled()
  })

  it('無 WRITE 權限時隱藏新增按鈕', async () => {
    vi.mocked(hasPermission).mockReturnValue(false)
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.text()).not.toContain(cfg.texts.addButton)
  })

  it('有 WRITE 權限時顯示新增按鈕', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.text()).toContain(cfg.texts.addButton)
  })

  it('刪除先確認再打 API', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const vm = wrapper.vm as unknown as PanelVm
    await vm.handleDelete({ id: 1, [cfg.fields.partyName.key]: '甲方一號' })
    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(mockApi.remove).toHaveBeenCalledWith(1)
  })

  it('openCreate 重置表單並開 dialog', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const vm = wrapper.vm as unknown as PanelVm
    vm.openCreate()
    await flushPromises()
    expect(vm.editingId).toBeNull()
    expect(vm.dialogVisible).toBe(true)
    expect(vm.form.paymentMethod).toBe('cash')
    expect(vm.form.amount).toBe(0)
    expect(vm.form.category).toBe('')
  })

  it('handleSave 以 config 欄位名組 payload 送 create', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const vm = wrapper.vm as unknown as PanelVm
    vm.openCreate()
    vm.form.partyName = '測試對象'
    vm.form.amount = 500
    if (cfg.category) vm.form.category = 'rent'
    await vm.handleSave()
    expect(mockApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        [cfg.fields.partyName.key]: '測試對象',
        amount: 500,
        payment_method: 'cash',
        ...(cfg.category ? { category: 'rent' } : {}),
      }),
    )
  })

  it.runIf(!!baseCfg.category)('（misc）缺類別時 handleSave 擋下並警告', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const vm = wrapper.vm as unknown as PanelVm
    vm.openCreate()
    vm.form.partyName = '測試對象'
    vm.form.amount = 500
    vm.form.category = ''
    await vm.handleSave()
    expect(ElMessage.warning).toHaveBeenCalledWith(cfg.texts.requiredMsg)
    expect(mockApi.create).not.toHaveBeenCalled()
  })

  it.runIf(!!baseCfg.category)('（misc）類別篩選帶進列表參數', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const vm = wrapper.vm as unknown as PanelVm
    vm.filters.category = 'rent'
    await vm.fetchList()
    const lastCall = vi.mocked(mockApi.list).mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(lastCall.category).toBe('rent')
  })

  it('disabledFutureDate 擋未來日、放行今日以前', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const vm = wrapper.vm as unknown as PanelVm
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    expect(vm.disabledFutureDate(tomorrow)).toBe(true)
    expect(vm.disabledFutureDate(yesterday)).toBe(false)
  })

  it('highlightId 有值時掛載後自動抓該筆並開 dialog', async () => {
    const wrapper = mountPanel(1)
    await flushPromises()
    expect(mockApi.get).toHaveBeenCalledWith(1)
    const vm = wrapper.vm as unknown as PanelVm
    expect(vm.dialogVisible).toBe(true)
    expect(vm.editingId).toBe(1)
  })

  describe('批次簽收與匯出', () => {
    it('selectableRow 只允許 pending 列被勾選', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      const vm = wrapper.vm as unknown as PanelVm
      expect(vm.selectableRow({ status: 'pending' })).toBe(true)
      expect(vm.selectableRow({ status: 'signed' })).toBe(false)
    })

    it('未勾選時批次簽收按鈕停用；有勾選後啟用且顯示筆數', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      const btn = wrapper.find('.so-toolbar__batch-btn')
      expect(btn.attributes('disabled')).toBeDefined()
      expect(btn.text()).toContain('0')

      const vm = wrapper.vm as unknown as PanelVm
      vm.onSelectionChange([{ id: 1, status: 'pending' }])
      await flushPromises()
      expect(wrapper.find('.so-toolbar__batch-btn').attributes('disabled')).toBeUndefined()
      expect(wrapper.find('.so-toolbar__batch-btn').text()).toContain('1')
    })

    it('openBatchSign 以選取列組出 {id, partyName, amount} 並開啟簽收 dialog', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      const vm = wrapper.vm as unknown as PanelVm
      vm.onSelectionChange([
        { id: 1, [cfg.fields.partyName.key]: '甲方一號', amount: 1200, status: 'pending' },
        { id: 3, [cfg.fields.partyName.key]: '丙方三號', amount: 500, status: 'pending' },
      ])
      vm.openBatchSign()
      await flushPromises()
      expect(vm.batchSignRows).toEqual([
        { id: 1, partyName: '甲方一號', amount: 1200 },
        { id: 3, partyName: '丙方三號', amount: 500 },
      ])
      expect(vm.signDialogVisible).toBe(true)
    })

    it('無勾選時 openBatchSign 不動作', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      const vm = wrapper.vm as unknown as PanelVm
      vm.openBatchSign()
      expect(vm.signDialogVisible).toBe(false)
    })

    it('onSigned 全數成功 → 成功 toast、清空選取、重新載入列表與彙總', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      const vm = wrapper.vm as unknown as PanelVm
      vm.onSelectionChange([{ id: 1, status: 'pending' }])
      vi.mocked(mockApi.list).mockClear()
      vi.mocked(mockApi.summary).mockClear()
      await vm.onSigned({ results: [{ id: 1, ok: true }], succeeded: 1, failed: 0 })
      expect(ElMessage.success).toHaveBeenCalledWith('已成功簽收 1 筆')
      expect(vm.selectedRows).toEqual([])
      expect(mockApi.list).toHaveBeenCalled()
      expect(mockApi.summary).toHaveBeenCalled()
    })

    it('onSigned 部分失敗 → 警告 toast 含原因、失敗筆保留勾選供重試', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      const vm = wrapper.vm as unknown as PanelVm
      vm.onSelectionChange([
        { id: 1, [cfg.fields.partyName.key]: '甲方一號', amount: 1200, status: 'pending' },
      ])
      vm.batchSignRows = [{ id: 1, partyName: '甲方一號', amount: 1200 }]
      await vm.onSigned({
        results: [{ id: 1, ok: false, error: '非 pending' }],
        succeeded: 0,
        failed: 1,
      })
      expect(ElMessage.warning).toHaveBeenCalledWith(
        expect.stringContaining('甲方一號：非 pending'),
      )
      // id=1 在 makeItems 中仍為 pending，重刷後應保留在勾選清單裡供重試
      expect(vm.selectedRows.map((r) => r.id)).toEqual([1])
    })

    it('onSigned 無 payload（單筆簽收）→ 清空選取並重新整理', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      const vm = wrapper.vm as unknown as PanelVm
      vm.onSelectionChange([{ id: 1, status: 'pending' }])
      await vm.onSigned()
      expect(vm.selectedRows).toEqual([])
    })

    it('handleExport 帶目前篩選條件（日期區間/類別/狀態）呼叫 downloadFile', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      const vm = wrapper.vm as unknown as PanelVm
      vm.filters.dateRange = ['2026-05-01', '2026-05-31']
      vm.filters.status = 'pending'
      if (cfg.category) vm.filters.category = 'rent'
      await vm.handleExport()
      expect(downloadFile).toHaveBeenCalledWith(
        cfg.exportPath,
        cfg.exportFilename,
        expect.objectContaining({
          start_date: '2026-05-01',
          end_date: '2026-05-31',
          status: 'pending',
          ...(cfg.category ? { category: 'rent' } : {}),
        }),
      )
    })

    it('handleExport 無篩選時仍可呼叫（params 為空物件）', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      const vm = wrapper.vm as unknown as PanelVm
      await vm.handleExport()
      expect(downloadFile).toHaveBeenCalledWith(cfg.exportPath, cfg.exportFilename, {})
    })
  })
})
