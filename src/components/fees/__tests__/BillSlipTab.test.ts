/**
 * SPEC-016 Phase 3 發單快照與未繳名單：
 * - 匯入預覽顯示期別/應收/零元單，批次名自動帶入
 * - 未繳名單預設鎖「未繳」；快篩顯示各狀態筆數
 * - 跨批應收（expected_total ≠ net_amount）與差額方向可辨識
 * - 「疑缺另一批快照」警示（避免會計把滿江紅的溢繳誤讀成家長多繳）
 * - 唯讀權限隱藏匯入
 *
 * SPEC-019：匯入時宣告批次類型（月費批／註冊費批），未產單批次可改類型；
 * 產單對話框改顯示類型（不再要求「月費批聲明」勾選），未解析列可逐列指定學生。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, inject, nextTick, provide } from 'vue'

const apiMocks = vi.hoisted(() => ({
  previewBillSlipBatch: vi.fn(),
  importBillSlipBatch: vi.fn(),
  getBillSlipBatches: vi.fn(),
  getOutstandingReport: vi.fn(),
  deleteBillSlipBatch: vi.fn(() => Promise.resolve({ ok: true })),
  generateBillSlipRecords: vi.fn(),
  patchBillSlipBatch: vi.fn(),
  assignBillSlipItemStudent: vi.fn(),
}))
vi.mock('@/api/fees', () => apiMocks)

const authMocks = vi.hoisted(() => ({ perms: new Set<string>() }))
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => authMocks.perms.has(name),
}))
const mbMocks = vi.hoisted(() => ({ confirm: vi.fn() }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: mbMocks.confirm },
}))

// 欄位 stub 要能渲染 `#default="{ row }"`（SPEC-019 的類型欄與「改」按鈕都在欄位插槽裡），
// 所以 el-table stub 把列資料 provide 下去，由 el-table-column stub 逐列展開。
const TABLE_ROWS = Symbol('table-rows')

const ElTableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    provide(TABLE_ROWS, props)
    return () =>
      h(
        'div',
        { 'data-testid': 'table' },
        props.data.length === 0 ? [slots.empty?.()] : [slots.default?.()],
      )
  },
})

const ElTableColumnStub = defineComponent({
  setup(_props, { slots }) {
    const holder = inject<{ data: unknown[] }>(TABLE_ROWS, { data: [] })
    return () =>
      h(
        'span',
        (holder.data ?? []).map((row) => h('span', slots.default?.({ row }))),
      )
  },
})

const STUBS = {
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-upload': { template: '<div><slot /></div>' },
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  'el-input': { template: '<input v-bind="$attrs" />' },
  'el-descriptions': { template: '<div v-bind="$attrs"><slot /></div>' },
  'el-descriptions-item': {
    props: ['label'],
    template: '<div><span>{{ label }}</span><slot /></div>',
  },
  'el-alert': {
    props: ['title', 'description'],
    template: '<div v-bind="$attrs"><p>{{ title }}</p><p>{{ description }}</p></div>',
  },
  'el-tag': { template: '<span v-bind="$attrs"><slot /></span>' },
  'el-dialog': {
    props: ['modelValue', 'title'],
    template:
      '<div v-if="modelValue" v-bind="$attrs"><p>{{ title }}</p><slot /><slot name="footer" /></div>',
  },
  'el-checkbox': { template: '<input type="checkbox" v-bind="$attrs" />' },
  'el-select': {
    template:
      '<select v-bind="$attrs" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
  },
  'el-option': { props: ['value', 'label'], template: '<option :value="value">{{ label }}</option>' },
  'el-date-picker': { template: '<input v-bind="$attrs" />' },
  EmptyState: {
    props: ['title', 'description'],
    template: '<div data-testid="empty-state"><p>{{ title }}</p></div>',
  },
}

const BATCH = {
  id: 7,
  batch_no: '140',
  bill_year: 2026,
  bill_month: 8,
  title: '115學年度第一學期註冊費',
  source: 'check_import',
  original_filename: 'Check_998172-140.xls',
  row_count: 197,
  net_total: 1775200,
  zero_amount_count: 78,
  note: null,
  created_at: '2026-08-26T10:00:00',
  created: null,
  records_generated_count: 0,
  batch_kind: 'registration' as const,
}

const PREVIEW = {
  bill_year: 2026,
  bill_month: 8,
  row_count: 197,
  net_total: 1775200,
  zero_amount_count: 78,
  error_count: 0,
  errors: [],
  already_imported: false,
  existing_batch_id: null,
  overlap_count: 0,
  overlap_ratio: 0,
  overlap_batch_ids: [],
}

function report(over: Record<string, unknown> = {}) {
  return {
    batch: { ...BATCH, sibling_batch_count: 0, likely_missing_sibling_batch: false },
    totals: {
      expected: 1775200,
      paid: 806420,
      outstanding: 968780,
      excess: 0,
      row_count: 197,
      settled_count: 78,
      unpaid_count: 64,
      partial_count: 1,
      paid_count: 54,
      overpaid_count: 0,
    },
    items: [
      {
        item_id: 1,
        student_id: 5,
        student_name: '王小明',
        classroom_name: '天堂鳥班',
        grade_name: '大班',
        collection_suffix: '1101',
        full_collection_number: '99817226081101',
        net_amount: 15000,
        expected_total: 25800,
        paid_amount: 15000,
        shortfall: 10800,
        excess: 0,
        status: 'partial',
      },
    ],
    ...over,
  }
}

async function mountTab(reportData = report()) {
  apiMocks.getBillSlipBatches.mockResolvedValue([BATCH])
  apiMocks.getOutstandingReport.mockResolvedValue(reportData)
  const BillSlipTab = (await import('../BillSlipTab.vue')).default
  const wrapper = mount(BillSlipTab, { global: { stubs: STUBS } })
  await nextTick()
  await nextTick()
  return wrapper
}

const flush = async () => {
  await flushPromises()
  await nextTick()
}

async function pickFile(wrapper: { vm: unknown }, name = 'Check.xls') {
  ;(wrapper.vm as { pickedFile: File | null }).pickedFile = new File(['x'], name)
  await nextTick()
}

beforeEach(() => {
  vi.clearAllMocks()
  authMocks.perms = new Set(['FEES_READ', 'FEES_WRITE'])
})

describe('BillSlipTab 匯入', () => {
  it('預覽顯示期別/應收/零元單並自動帶入批次名', async () => {
    apiMocks.previewBillSlipBatch.mockResolvedValue({
      bill_year: 2026,
      bill_month: 8,
      row_count: 197,
      net_total: 1775200,
      zero_amount_count: 78,
      error_count: 0,
      errors: [],
      already_imported: false,
      existing_batch_id: null,
      overlap_count: 0,
      overlap_ratio: 0,
      overlap_batch_ids: [],
    })
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      pickedFile: File | null
      form: { title: string }
      runPreview: () => Promise<void>
    }
    vm.pickedFile = new File(['x'], 'Check.xls')
    await vm.runPreview()
    await nextTick()
    const text = wrapper.find('[data-test="slip-preview"]').text()
    expect(text).toContain('應收合計')
    expect(text).toContain('零元單')
    expect(vm.form.title).toBe('2026-08 繳款單')
  })

  it('匯入前必選批次類型；送出帶 batch_kind', async () => {
    apiMocks.previewBillSlipBatch.mockResolvedValue({ ...PREVIEW })
    apiMocks.importBillSlipBatch.mockResolvedValue({ ...BATCH, created: true })
    const wrapper = await mountTab()
    await pickFile(wrapper)
    await wrapper.find('[data-test="run-preview"]').trigger('click')
    await flush()
    expect(wrapper.find('[data-test="run-import"]').attributes('disabled')).toBeDefined()
    await wrapper.find('[data-test="slip-kind-select"]').setValue('registration')
    await flush()
    expect(wrapper.find('[data-test="run-import"]').attributes('disabled')).toBeUndefined()
    await wrapper.find('[data-test="run-import"]').trigger('click')
    await flush()
    expect(apiMocks.importBillSlipBatch).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ batch_kind: 'registration' }),
    )
  })

  it('唯讀權限隱藏匯入入口', async () => {
    authMocks.perms = new Set(['FEES_READ'])
    const wrapper = await mountTab()
    expect(wrapper.find('[data-test="pick-check-xls"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('唯讀檢視')
  })
})

describe('BillSlipTab 未繳名單', () => {
  it('自動載入首批並預設鎖未繳', async () => {
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      selectBatch: (row: unknown) => Promise<void>
      statusFilter: string
    }
    expect(vm.statusFilter).toBe('unpaid')
    await vm.selectBatch(BATCH)
    expect(apiMocks.getOutstandingReport).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ status: 'unpaid' }),
    )
  })

  it('快篩顯示各狀態筆數', async () => {
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as { selectBatch: (r: unknown) => Promise<void> }
    await vm.selectBatch(BATCH)
    await nextTick()
    const chip = wrapper.find('[data-test="outstanding-scope-unpaid"]')
    expect(chip.text()).toContain('64')
    expect(wrapper.find('[data-test="outstanding-scope-settled"]').text()).toContain(
      '78',
    )
  })

  it('切換快篩重新查詢', async () => {
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      selectBatch: (r: unknown) => Promise<void>
      setStatus: (v: string) => Promise<void>
    }
    await vm.selectBatch(BATCH)
    apiMocks.getOutstandingReport.mockClear()
    await vm.setStatus('')
    const params = apiMocks.getOutstandingReport.mock.calls.at(-1)?.[1] as Record<
      string,
      unknown
    >
    expect(params.status).toBeUndefined()
  })

  it('缺同期別批次時顯示警示', async () => {
    const wrapper = await mountTab(
      report({
        batch: {
          ...BATCH,
          sibling_batch_count: 0,
          likely_missing_sibling_batch: true,
        },
      }),
    )
    const vm = wrapper.vm as unknown as { selectBatch: (r: unknown) => Promise<void> }
    await vm.selectBatch(BATCH)
    await nextTick()
    const alert = wrapper.find('[data-test="missing-sibling-alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('溢繳')
  })

  it('無警示時不顯示', async () => {
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as { selectBatch: (r: unknown) => Promise<void> }
    await vm.selectBatch(BATCH)
    await nextTick()
    expect(wrapper.find('[data-test="missing-sibling-alert"]').exists()).toBe(false)
  })

  it('未收金額以警示樣式呈現', async () => {
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as { selectBatch: (r: unknown) => Promise<void> }
    await vm.selectBatch(BATCH)
    await nextTick()
    expect(wrapper.find('.tile--warn').text()).toContain('未收')
  })
})


describe('BillSlipTab 重複批次防護', () => {
  it('高比例帳號重疊時警示可能是重傳修正版', async () => {
    apiMocks.previewBillSlipBatch.mockResolvedValue({
      bill_year: 2026,
      bill_month: 8,
      row_count: 197,
      net_total: 1775200,
      zero_amount_count: 78,
      error_count: 0,
      errors: [],
      already_imported: false,
      existing_batch_id: null,
      overlap_count: 197,
      overlap_ratio: 1,
      overlap_batch_ids: [3],
    })
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      pickedFile: File | null
      runPreview: () => Promise<void>
    }
    vm.pickedFile = new File(['x'], 'Check_v2.xls')
    await vm.runPreview()
    await nextTick()
    const alert = wrapper.find('[data-test="overlap-alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('100%')
    expect(alert.text()).toContain('重複計算')
  })

  it('低重疊不警示', async () => {
    apiMocks.previewBillSlipBatch.mockResolvedValue({
      bill_year: 2026,
      bill_month: 8,
      row_count: 10,
      net_total: 100,
      zero_amount_count: 0,
      error_count: 0,
      errors: [],
      already_imported: false,
      existing_batch_id: null,
      overlap_count: 1,
      overlap_ratio: 0.1,
      overlap_batch_ids: [3],
    })
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      pickedFile: File | null
      runPreview: () => Promise<void>
    }
    vm.pickedFile = new File(['x'], 'Check.xls')
    await vm.runPreview()
    await nextTick()
    expect(wrapper.find('[data-test="overlap-alert"]').exists()).toBe(false)
  })

  it('刪除批次需確認後才送出', async () => {
    mbMocks.confirm.mockResolvedValue('confirm')
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      removeBatch: (row: unknown) => Promise<void>
    }
    await vm.removeBatch(BATCH)
    expect(mbMocks.confirm).toHaveBeenCalled()
    expect(apiMocks.deleteBillSlipBatch).toHaveBeenCalledWith(7)
  })

  it('取消確認不送出刪除', async () => {
    mbMocks.confirm.mockRejectedValue('cancel')
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      removeBatch: (row: unknown) => Promise<void>
    }
    await vm.removeBatch(BATCH)
    expect(apiMocks.deleteBillSlipBatch).not.toHaveBeenCalled()
  })

  it('唯讀權限隱藏刪除按鈕', async () => {
    authMocks.perms = new Set(['FEES_READ'])
    const wrapper = await mountTab()
    expect(wrapper.find('[data-test="delete-batch"]').exists()).toBe(false)
  })
})


describe('BillSlipTab 產生費用單（SPEC-018）', () => {
  const PLAN = {
    batch_id: 7,
    dry_run: true,
    created: 119,
    skipped_zero: 78,
    skipped_existing: 0,
    unresolved: [],
    conflicts: [],
    total_amount_due: 1775200,
    due_date: '2026-08-10',
    target_month: '2026-08',
    batch_kind: 'monthly',
    prepayment_applied: 0,
    prepayment_pending: [],
    preview: [],
  }

  it('開啟對話框先 dry_run 預覽，顯示筆數與合計', async () => {
    apiMocks.generateBillSlipRecords.mockResolvedValue(PLAN)
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      openGenerateDialog: (row: unknown) => Promise<void>
    }
    await vm.openGenerateDialog(BATCH)
    await nextTick()
    expect(apiMocks.generateBillSlipRecords).toHaveBeenCalledWith(7, {
      dry_run: true,
      skip_unresolved: false,
    })
    const dialog = wrapper.find('[data-test="gen-dialog"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('119')
    expect(dialog.text()).toContain('零元')
  })

  it('確認後以非 dry_run 送出並刷新批次清單', async () => {
    apiMocks.generateBillSlipRecords.mockResolvedValue(PLAN)
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      openGenerateDialog: (row: unknown) => Promise<void>
      confirmGenerate: () => Promise<void>
    }
    await vm.openGenerateDialog(BATCH)
    apiMocks.generateBillSlipRecords.mockResolvedValue({
      ...PLAN,
      dry_run: false,
    })
    apiMocks.getBillSlipBatches.mockClear()
    await vm.confirmGenerate()
    expect(apiMocks.generateBillSlipRecords).toHaveBeenLastCalledWith(7, {
      dry_run: false,
      skip_unresolved: false,
    })
    expect(apiMocks.getBillSlipBatches).toHaveBeenCalled()
    expect(wrapper.find('[data-test="gen-dialog"]').exists()).toBe(false)
  })

  it('產單 dialog 顯示批次類型，不再要求月費批聲明勾選', async () => {
    apiMocks.generateBillSlipRecords.mockResolvedValue({ ...PLAN, batch_kind: 'registration' })
    const wrapper = await mountTab()
    await wrapper.find('[data-test="open-generate"]').trigger('click')
    await flush()
    expect(wrapper.find('[data-test="gen-kind-confirm"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="gen-kind-label"]').text()).toContain('註冊費批')
    expect(wrapper.find('[data-test="gen-confirm"]').attributes('disabled')).toBeUndefined()
  })

  it('產單成功訊息含預繳套用數（註冊費批）', async () => {
    apiMocks.generateBillSlipRecords
      .mockResolvedValueOnce({ ...PLAN, batch_kind: 'registration' })
      .mockResolvedValueOnce({
        ...PLAN,
        batch_kind: 'registration',
        dry_run: false,
        created: 3,
        prepayment_applied: 2,
        prepayment_pending: [],
      })
    const wrapper = await mountTab()
    await wrapper.find('[data-test="open-generate"]').trigger('click')
    await flush()
    await wrapper.find('[data-test="gen-confirm"]').trigger('click')
    await flush()
    const { ElMessage } = await import('element-plus')
    expect((ElMessage.success as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]).toContain(
      '預繳套用 2',
    )
  })

  it('有同月其他來源衝突時警示且不可確認', async () => {
    apiMocks.generateBillSlipRecords.mockResolvedValue({
      ...PLAN,
      created: 0,
      conflicts: [
        {
          student_id: 5,
          student_name: '王小明',
          record_id: 9,
          source: 'template',
          source_bill_slip_batch_id: null,
        },
      ],
    })
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      openGenerateDialog: (row: unknown) => Promise<void>
      confirmGenerate: () => Promise<void>
      canConfirmGenerate: boolean
    }
    await vm.openGenerateDialog(BATCH)
    await nextTick()
    expect(wrapper.find('[data-test="gen-conflict-alert"]').exists()).toBe(true)
    expect(vm.canConfirmGenerate).toBe(false)
    apiMocks.generateBillSlipRecords.mockClear()
    await vm.confirmGenerate()
    expect(apiMocks.generateBillSlipRecords).not.toHaveBeenCalled()
  })

  it('有未解析學生時需先勾選略過才能確認', async () => {
    apiMocks.generateBillSlipRecords.mockResolvedValue({
      ...PLAN,
      unresolved: [
        {
          slip_item_id: 3,
          student_name: '查無此生',
          collection_suffix: '9999',
          net_amount: 9720,
        },
      ],
    })
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      openGenerateDialog: (row: unknown) => Promise<void>
      confirmGenerate: () => Promise<void>
      canConfirmGenerate: boolean
      skipUnresolved: boolean
    }
    await vm.openGenerateDialog(BATCH)
    await nextTick()
    expect(wrapper.find('[data-test="gen-unresolved-alert"]').text()).toContain(
      '查無此生',
    )
    expect(vm.canConfirmGenerate).toBe(false)
    vm.skipUnresolved = true
    await nextTick()
    expect(vm.canConfirmGenerate).toBe(true)
    // 未解析列可逐列指定學生（dialog 關閉前檢查）
    expect(wrapper.find('[data-test="gen-assign-student"]').exists()).toBe(true)
    await vm.confirmGenerate()
    expect(apiMocks.generateBillSlipRecords).toHaveBeenLastCalledWith(7, {
      dry_run: false,
      skip_unresolved: true,
    })
  })

  it('全部已產過（created=0）時不可再確認', async () => {
    apiMocks.generateBillSlipRecords.mockResolvedValue({
      ...PLAN,
      created: 0,
      skipped_existing: 119,
    })
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      openGenerateDialog: (row: unknown) => Promise<void>
      canConfirmGenerate: boolean
    }
    await vm.openGenerateDialog(BATCH)
    await nextTick()
    expect(vm.canConfirmGenerate).toBe(false)
  })
})


describe('BillSlipTab 匯入衝突處理', () => {
  it('後端 409（重傳修正版）以錯誤訊息呈現，不中斷頁面', async () => {
    const { ElMessage } = await import('element-plus')
    apiMocks.importBillSlipBatch.mockRejectedValue({
      response: {
        status: 409,
        data: { detail: '與同期別既有批次有 197 筆重疊，多半是同一批的修正版重傳。' },
      },
    })
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      pickedFile: File | null
      form: { title: string; batch_no: string; batch_kind: string }
      runImport: () => Promise<void>
    }
    vm.pickedFile = new File(['x'], 'Check_v2.xls')
    vm.form.title = '註冊費(修正)'
    vm.form.batch_kind = 'registration'
    await vm.runImport()
    expect(ElMessage.error).toHaveBeenCalled()
    // 檔案保留，讓會計可先去刪舊批次再重試
    expect(vm.pickedFile).not.toBeNull()
  })

  it('匯入成功後清空選檔並重載清單', async () => {
    apiMocks.importBillSlipBatch.mockResolvedValue({
      ...BATCH,
      created: true,
    })
    const wrapper = await mountTab()
    const vm = wrapper.vm as unknown as {
      pickedFile: File | null
      form: { title: string; batch_kind: string }
      runImport: () => Promise<void>
    }
    vm.pickedFile = new File(['x'], 'Check.xls')
    vm.form.title = '註冊費'
    vm.form.batch_kind = 'monthly'
    apiMocks.getBillSlipBatches.mockClear()
    await vm.runImport()
    expect(vm.pickedFile).toBeNull()
    expect(apiMocks.getBillSlipBatches).toHaveBeenCalled()
  })
})


describe('BillSlipTab 批次類型（SPEC-019 §6.1）', () => {
  it('未產單批次可改類型（PATCH），已產單不顯示', async () => {
    apiMocks.patchBillSlipBatch.mockResolvedValue({ ...BATCH, batch_kind: 'monthly' })
    const wrapper = await mountTab()
    expect(wrapper.find('[data-test="slip-kind-cell"]').text()).toContain('註冊費批')
    await wrapper.find('[data-test="slip-kind-change"]').trigger('click')
    await flush()
    await wrapper.find('[data-test="slip-kind-change-select"]').setValue('monthly')
    await wrapper.find('[data-test="slip-kind-change-confirm"]').trigger('click')
    await flush()
    expect(apiMocks.patchBillSlipBatch).toHaveBeenCalledWith(7, { batch_kind: 'monthly' })
  })

  it('已產單批次不顯示「改」入口', async () => {
    apiMocks.getBillSlipBatches.mockResolvedValue([{ ...BATCH, records_generated_count: 119 }])
    apiMocks.getOutstandingReport.mockResolvedValue(report())
    const BillSlipTab = (await import('../BillSlipTab.vue')).default
    const wrapper = mount(BillSlipTab, { global: { stubs: STUBS } })
    await flush()
    expect(wrapper.find('[data-test="slip-kind-cell"]').text()).toContain('註冊費批')
    expect(wrapper.find('[data-test="slip-kind-change"]').exists()).toBe(false)
  })

  it('未解析列可指定學生，指定後重跑 dry_run', async () => {
    apiMocks.generateBillSlipRecords.mockResolvedValue({
      batch_id: 7,
      dry_run: true,
      created: 1,
      skipped_zero: 0,
      skipped_existing: 0,
      unresolved: [
        {
          slip_item_id: 3,
          student_name: '查無此生',
          collection_suffix: '9999',
          net_amount: 9720,
        },
      ],
      conflicts: [],
      total_amount_due: 9720,
      due_date: '2026-08-10',
      target_month: '2026-08',
      batch_kind: 'registration',
      prepayment_applied: 0,
      prepayment_pending: [],
      preview: [],
    })
    apiMocks.assignBillSlipItemStudent.mockResolvedValue({ ok: true })
    const wrapper = await mountTab()
    await wrapper.find('[data-test="open-generate"]').trigger('click')
    await flush()
    await wrapper.find('[data-test="gen-assign-student"]').trigger('click')
    await flush()
    const vm = wrapper.vm as unknown as {
      onAssignPick: (s: { id: number; name: string }) => Promise<void>
    }
    apiMocks.generateBillSlipRecords.mockClear()
    await vm.onAssignPick({ id: 5, name: '王小明' })
    await flush()
    expect(apiMocks.assignBillSlipItemStudent).toHaveBeenCalledWith(7, 3, { student_id: 5 })
    expect(apiMocks.generateBillSlipRecords).toHaveBeenCalledWith(7, {
      dry_run: true,
      skip_unresolved: false,
    })
  })
})
