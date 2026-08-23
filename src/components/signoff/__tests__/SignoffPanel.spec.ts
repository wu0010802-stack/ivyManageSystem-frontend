import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
  getUserInfo: vi.fn().mockReturnValue({ employee_id: 7 }),
}))
vi.mock('@/utils/download', () => ({ downloadFile: vi.fn().mockResolvedValue(true) }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: {
    confirm: vi.fn().mockResolvedValue(true),
    prompt: vi.fn().mockResolvedValue({ value: '測試原因' }),
  },
}))

import { hasPermission, getUserInfo } from '@/utils/auth'
import { downloadFile } from '@/utils/download'
import { ElMessage, ElMessageBox } from 'element-plus'
import { EMPTY_SIGNOFF_SUMMARY } from '@/constants/signoff'
import {
  VENDOR_SIGNOFF_MODULE,
  MISC_SIGNOFF_MODULE,
  type SignoffModuleConfig,
  type SignoffModuleApi,
} from '@/config/signoffModules'
import SignoffPanel from '../SignoffPanel.vue'

const globalStubs = {
  'el-button': {
    template:
      '<button data-test="el-button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
    props: ['disabled', 'loading', 'type'],
  },
  'el-input': { template: '<input />', props: ['modelValue'] },
  'el-input-number': { template: '<input type="number" />', props: ['modelValue'] },
  'el-select': { template: '<select><slot /></select>', props: ['modelValue'] },
  'el-option': { template: '<option><slot /></option>' },
  'el-date-picker': { template: '<input type="date" />', props: ['modelValue'] },
  // 不渲染 el-table 內部 slot（避免 row scoped slot 解構錯誤），把整列值攤平成文字
  'el-table': {
    template:
      '<table data-test="so-table"><tbody><tr v-for="r in data" :key="r.id"><td>{{ Object.values(r).join(" ") }}</td></tr></tbody><slot name="empty" v-if="!data.length" /></table>',
    props: ['data'],
  },
  'el-table-column': { template: '<span />' },
  'el-dialog': {
    template: '<div v-if="modelValue" class="el-dialog-stub"><slot /><slot name="footer" /></div>',
    props: ['modelValue'],
  },
  'el-form': {
    template: '<form><slot /></form>',
    methods: { validate: () => Promise.resolve(true) },
  },
  'el-form-item': { template: '<div class="el-form-item"><slot /></div>' },
  'el-row': { template: '<div><slot /></div>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-alert': { template: '<div class="el-alert-stub" :title="title"><slot /></div>', props: ['title'] },
  'el-tooltip': { template: '<span><slot /></span>', props: ['content'] },
  'el-pagination': { template: '<div class="el-pagination" />' },
  'el-upload': { template: '<div class="el-upload"><slot /></div>' },
  'el-radio-group': { template: '<div class="el-radio-group"><slot /></div>', props: ['modelValue'] },
  'el-radio-button': { template: '<label class="el-radio-button"><slot /></label>', props: ['value'] },
  'el-skeleton': { template: '<div class="el-skeleton" />' },
  'el-card': { template: '<div class="el-card"><slot /></div>' },
  'el-dropdown': { template: '<div class="el-dropdown"><slot /><slot name="dropdown" /></div>' },
  'el-dropdown-menu': { template: '<div><slot /></div>' },
  'el-dropdown-item': { template: '<div class="el-dropdown-item"><slot /></div>', props: ['command'] },
  'el-icon': { template: '<i><slot /></i>' },
  SignoffSignDialog: { template: '<div class="sign-dialog-stub" />' },
  SignoffSettleDialog: { template: '<div class="settle-dialog-stub" />' },
}

const globalDirectives = {
  loading: { mounted: () => {}, updated: () => {} },
}

function makeItems(cfg: SignoffModuleConfig): Record<string, unknown>[] {
  const controlDefaults = {
    submitted_by_id: null, submitted_by_name: null, submitted_at: null,
    approved_by_id: null, approved_by_name: null, approved_at: null,
    rejected_by_id: null, rejected_by_name: null, rejected_at: null,
    rejection_reason: null,
    settled_by_id: null, settled_by_name: null, settled_at: null,
    reconciled_by_id: null, reconciled_by_name: null, reconciled_at: null,
    reconciliation_note: null, transaction_ref: null,
    [cfg.fields.plannedDate.key]: null,
  }
  return [
    {
      id: 1,
      [cfg.fields.date.key]: null,
      [cfg.fields.partyName.key]: '甲方一號',
      amount: 1200,
      payment_method: 'cash',
      description: '第一筆',
      [cfg.fields.docNumber.key]: 'AB-001',
      notes: null,
      attachments: [],
      status: 'pending',
      approval_status: 'draft',
      settlement_status: 'unsettled',
      reconciliation_status: 'unreconciled',
      ...(cfg.category ? { category: 'rent' } : {}),
      ...controlDefaults,
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
      approval_status: 'legacy',
      settlement_status: 'settled',
      reconciliation_status: 'unreconciled',
      ...(cfg.category ? { category: 'donation' } : {}),
      ...controlDefaults,
      signer_id: 7, signer_name: '林主任', signed_at: '2026-05-11T09:30:00', signature_kind: 'drawn',
      has_signature: true, created_by_id: 1, created_by_name: 'admin',
      created_at: '2026-05-10T10:00:00', updated_at: '2026-05-11T09:30:00',
    },
  ]
}

function makeSummary() {
  return {
    ...EMPTY_SIGNOFF_SUMMARY,
    total_count: 2,
    total_amount: 10000,
    pending_count: 1,
    pending_amount: 1200,
    signed_count: 1,
    signed_amount: 8800,
    pending_approval_count: 1,
    pending_approval_amount: 1200,
    awaiting_reconcile_count: 1,
    awaiting_reconcile_amount: 8800,
  }
}

function makeMockApi(cfg: SignoffModuleConfig): SignoffModuleApi {
  return {
    list: vi.fn().mockResolvedValue({ data: { items: makeItems(cfg), total: 2, page: 1, page_size: 20 } }),
    summary: vi.fn().mockResolvedValue({ data: makeSummary() }),
    get: vi.fn().mockResolvedValue({ data: makeItems(cfg)[0] }),
    create: vi.fn().mockResolvedValue({ data: { id: 99 } }),
    update: vi.fn().mockResolvedValue({ data: { message: 'ok' } }),
    remove: vi.fn().mockResolvedValue({ data: { message: 'ok' } }),
    sign: vi.fn().mockResolvedValue({ data: { message: 'ok' } }),
    uploadAttachment: vi.fn().mockResolvedValue({ data: {} }),
    deleteAttachment: vi.fn().mockResolvedValue({ data: {} }),
    attachmentDownloadUrl: (id: number, key: string) => `/x/${id}/${key}`,
    signatureUrl: (id: number) => `/x/${id}/signature`,
    submit: vi.fn().mockResolvedValue({ data: { message: 'ok', id: 1, approval_status: 'pending_approval', settlement_status: 'unsettled', reconciliation_status: 'unreconciled' } }),
    approve: vi.fn().mockResolvedValue({ data: { message: 'ok', id: 1, approval_status: 'approved', settlement_status: 'unsettled', reconciliation_status: 'unreconciled' } }),
    settle: vi.fn().mockResolvedValue({ data: { message: 'ok', id: 1, approval_status: 'approved', settlement_status: 'settled', reconciliation_status: 'unreconciled' } }),
    reconcile: vi.fn().mockResolvedValue({ data: { message: 'ok', id: 1, approval_status: 'approved', settlement_status: 'settled', reconciliation_status: 'reconciled' } }),
    events: vi.fn().mockResolvedValue({ data: { items: [] } }),
    batchSign: vi.fn().mockResolvedValue({ data: { results: [], succeeded: 0, failed: 0 } }),
  }
}

interface BatchSignResult {
  results: Array<{ id: number | null; ok: boolean; error?: string | null }>
  succeeded: number
  failed: number
}

interface PanelVm {
  filters: {
    status: string
    partyName: string
    category: string
    flow: string | null
    dateRange: string[] | null
  }
  items: Record<string, unknown>[]
  selectedRows: Record<string, unknown>[]
  batchSignRows: Array<{ id: number; partyName: string; amount: number }>
  signDialogVisible: boolean
  selectableRow: (row: Record<string, unknown>) => boolean
  onSelectionChange: (rows: Record<string, unknown>[]) => void
  openBatchSign: () => void
  onSigned: (result?: BatchSignResult) => Promise<void>
  handleExport: () => Promise<void>
  form: Record<string, unknown>
  editingId: number | null
  dialogVisible: boolean
  isFormLocked: boolean
  fetchList: () => Promise<void>
  openCreate: () => void
  openEdit: (row: Record<string, unknown>) => void
  handleSave: () => Promise<unknown>
  handleDelete: (row: Record<string, unknown>) => Promise<void>
  disabledFutureDate: (t: Date) => boolean
  rowPrimaryAction: (row: Record<string, unknown>) => { key: string; label: string } | null
  approveSelfBlocked: boolean
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
    vi.mocked(getUserInfo).mockReturnValue({ employee_id: 7 } as ReturnType<typeof getUserInfo>)
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as Awaited<ReturnType<typeof ElMessageBox.confirm>>)
    mockApi = makeMockApi(baseCfg)
    cfg = { ...baseCfg, api: mockApi }
  })

  const mountPanel = (highlightId: number | null = null, isMobile = false) =>
    mount(SignoffPanel, {
      props: { config: cfg, highlightId, isMobile },
      global: { stubs: globalStubs, directives: globalDirectives },
    })

  it('掛載即載入列表並渲染資料', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(mockApi.list).toHaveBeenCalled()
    expect(wrapper.text()).toContain('甲方一號')
    expect(wrapper.text()).toContain('乙方二號')
  })

  it('掛載載入彙總並渲染流程摘要列（含金額）', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(mockApi.summary).toHaveBeenCalled()
    const text = wrapper.text()
    expect(text).toContain('待核准')
    expect(text).toContain('待補憑證')
    expect(text).toContain('待對帳')
    expect(text).toContain('NT$8,800')
    expect(text).toContain('全部期間')
    // 無日期篩選時不再出現「本期：」前綴
    expect(text).not.toContain('本期：')
  })

  it('流程摘要點擊套用複合篩選、再點取消', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    vi.mocked(mockApi.list).mockClear()
    await wrapper.find('[data-test="flow-chip-pending_approval"]').trigger('click')
    await flushPromises()
    let lastCall = vi.mocked(mockApi.list).mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(lastCall.approval_status).toBe('pending_approval')
    expect(wrapper.text()).toContain('篩選中')
    // 再點同一顆取消
    await wrapper.find('[data-test="flow-chip-pending_approval"]').trigger('click')
    await flushPromises()
    lastCall = vi.mocked(mockApi.list).mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(lastCall.approval_status).toBeUndefined()
  })

  it('待對帳摘要點擊送出 settled + unreconciled 複合條件', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    vi.mocked(mockApi.list).mockClear()
    await wrapper.find('[data-test="flow-chip-awaiting_reconcile"]').trigger('click')
    await flushPromises()
    const lastCall = vi.mocked(mockApi.list).mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(lastCall.settlement_status).toBe('settled')
    expect(lastCall.reconciliation_status).toBe('unreconciled')
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

  it('panel 本身不再渲染常駐新增按鈕（入口統一在 View header／sticky）', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    // 有資料時（非空狀態）不得出現任何新增按鈕文字，避免與 View 的 CTA 重複
    expect(wrapper.text()).not.toContain(cfg.texts.addButton)
  })

  it('空列表＋WRITE 權限時 empty CTA 呼叫同一個 create handler', async () => {
    vi.mocked(mockApi.list).mockResolvedValue({
      data: { items: [], total: 0, page: 1, page_size: 20 },
    })
    const wrapper = mountPanel()
    await flushPromises()
    const cta = wrapper.find('[data-test="empty-create-cta"]')
    expect(cta.exists()).toBe(true)
    await cta.trigger('click')
    const vm = wrapper.vm as unknown as PanelVm
    expect(vm.dialogVisible).toBe(true)
    expect(vm.editingId).toBeNull()
  })

  it('空列表但無 WRITE 權限時不顯示 empty CTA', async () => {
    vi.mocked(hasPermission).mockReturnValue(false)
    vi.mocked(mockApi.list).mockResolvedValue({
      data: { items: [], total: 0, page: 1, page_size: 20 },
    })
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.find('[data-test="empty-create-cta"]').exists()).toBe(false)
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

  it('handleSave 以 config 欄位名組 payload 送 create（含預計日期鍵）', async () => {
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
        [cfg.fields.plannedDate.key]: null,
        amount: 500,
        payment_method: 'cash',
        ...(cfg.category ? { category: 'rent' } : {}),
      }),
    )
    // 送出的 payload 不得帶實際收付日欄位（只能由 settle 寫入）
    const payload = vi.mocked(mockApi.create).mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(payload).not.toHaveProperty(cfg.fields.date.key)
  })

  it('inline validation 失敗時不送出（不再靠全域 warning）', async () => {
    const wrapper = mount(SignoffPanel, {
      props: { config: cfg, highlightId: null },
      global: {
        stubs: {
          ...globalStubs,
          'el-form': {
            template: '<form><slot /></form>',
            methods: { validate: () => Promise.reject(new Error('invalid')) },
          },
        },
        directives: globalDirectives,
      },
    })
    await flushPromises()
    const vm = wrapper.vm as unknown as PanelVm
    vm.openCreate()
    await flushPromises()
    await vm.handleSave()
    expect(mockApi.create).not.toHaveBeenCalled()
  })

  it('類別篩選帶進列表參數（vendor 與 misc 契約皆支援）', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const vm = wrapper.vm as unknown as PanelVm
    vm.filters.category = cfg.key === 'vendor' ? '餐點食材' : 'rent'
    await vm.fetchList()
    const lastCall = vi.mocked(mockApi.list).mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(lastCall.category).toBe(cfg.key === 'vendor' ? '餐點食材' : 'rent')
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

  it('isMobile 時改用卡片列表，不渲染桌面表格', async () => {
    const wrapper = mountPanel(null, true)
    await flushPromises()
    expect(wrapper.find('[data-test="signoff-cards"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="so-table"]').exists()).toBe(false)
  })

  describe('目前待辦（每列唯一 primary next-action）', () => {
    it('草稿 → 送審；legacy 已簽收 → 對帳；legacy 未簽收 → 補憑證', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      const vm = wrapper.vm as unknown as PanelVm
      const [draftRow, legacyRow] = makeItems(cfg)
      expect(vm.rowPrimaryAction(draftRow)?.key).toBe('submit')
      expect(vm.rowPrimaryAction(legacyRow)?.key).toBe('reconcile')
      expect(vm.rowPrimaryAction({ ...legacyRow, status: 'pending' })?.key).toBe('sign')
    })

    it('送審中的單據 → 核准；對帳完成 → 無待辦', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      const vm = wrapper.vm as unknown as PanelVm
      const [row] = makeItems(cfg)
      expect(
        vm.rowPrimaryAction({ ...row, approval_status: 'pending_approval' })?.key,
      ).toBe('approve')
      expect(
        vm.rowPrimaryAction({
          ...row,
          settlement_status: 'settled',
          status: 'signed',
          reconciliation_status: 'reconciled',
        }),
      ).toBeNull()
    })
  })

  describe('自我核准守衛（UI 提示）', () => {
    it('建立者本人開啟送審中單據：核准/駁回 disabled 並顯示說明', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      const vm = wrapper.vm as unknown as PanelVm
      const [row] = makeItems(cfg)
      vm.openEdit({ ...row, approval_status: 'pending_approval', created_by_id: 7 })
      await flushPromises()
      expect(vm.approveSelfBlocked).toBe(true)
      expect(wrapper.find('[data-test="self-approve-hint"]').text()).toContain(
        '不可核准自己建立的單據',
      )
      const approveBtn = wrapper.find('[data-test="approve-btn"]')
      expect(approveBtn.attributes('disabled')).toBeDefined()
    })

    it('非建立者開啟送審中單據：核准可按', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      const vm = wrapper.vm as unknown as PanelVm
      const [row] = makeItems(cfg)
      vm.openEdit({ ...row, approval_status: 'pending_approval', created_by_id: 99 })
      await flushPromises()
      expect(vm.approveSelfBlocked).toBe(false)
      const approveBtn = wrapper.find('[data-test="approve-btn"]')
      expect(approveBtn.attributes('disabled')).toBeUndefined()
    })
  })

  describe('已鎖定資料唯讀（後端 409 守衛的 UI 對齊）', () => {
    it('開啟已簽收紀錄時 footer 不顯示儲存按鈕', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      const vm = wrapper.vm as unknown as PanelVm
      const signedRow = makeItems(cfg)[1] // signed + legacy + settled
      vm.openEdit(signedRow)
      await flushPromises()
      expect(wrapper.find('[data-test="save-draft"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="save-submit"]').exists()).toBe(false)
    })

    it('開啟已簽收紀錄時表單欄位為唯讀鎖定', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      const vm = wrapper.vm as unknown as PanelVm
      vm.openEdit(makeItems(cfg)[1])
      await flushPromises()
      expect(vm.isFormLocked).toBe(true)
      // 鎖定原因以文字呈現（不是只把按鈕藏起來）
      expect(wrapper.find('[data-test="lock-reason"]').exists()).toBe(true)
    })

    it('開啟待簽收（草稿）紀錄時儲存按鈕仍在', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      const vm = wrapper.vm as unknown as PanelVm
      vm.openEdit(makeItems(cfg)[0]) // draft + unsettled + pending
      await flushPromises()
      expect(vm.isFormLocked).toBe(false)
      expect(wrapper.find('[data-test="save-draft"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="save-submit"]').exists()).toBe(true)
    })

    it('送審中的單據鎖定編輯（送審 ≠ 可改）', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      const vm = wrapper.vm as unknown as PanelVm
      const [row] = makeItems(cfg)
      vm.openEdit({ ...row, approval_status: 'pending_approval', created_by_id: 99 })
      await flushPromises()
      expect(vm.isFormLocked).toBe(true)
    })
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

  describe('未儲存離開提示', () => {
    it('表單有變更時關閉會先確認', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      const vm = wrapper.vm as unknown as PanelVm & {
        requestClose: () => void
      }
      vm.openCreate()
      vm.form.partyName = '打了一半'
      await flushPromises()
      vi.mocked(ElMessageBox.confirm).mockClear()
      vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel')
      vm.requestClose()
      await flushPromises()
      expect(ElMessageBox.confirm).toHaveBeenCalled()
      expect(vm.dialogVisible).toBe(true) // 取消離開 → 停留
    })

    it('表單無變更時直接關閉', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      const vm = wrapper.vm as unknown as PanelVm & { requestClose: () => void }
      vm.openCreate()
      await flushPromises()
      vi.mocked(ElMessageBox.confirm).mockClear()
      vm.requestClose()
      await flushPromises()
      expect(ElMessageBox.confirm).not.toHaveBeenCalled()
      expect(vm.dialogVisible).toBe(false)
    })
  })
})
