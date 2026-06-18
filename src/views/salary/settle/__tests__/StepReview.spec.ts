import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed } from 'vue'
import StepReview from '../StepReview.vue'
import AdjustDrawer from '../AdjustDrawer.vue'
import { ElMessageBox } from 'element-plus'
import {
    detectAnomalies,
    sortByAttention,
    DEFAULT_THRESHOLDS,
    type SettlementRecord,
} from '@/composables/useSalarySettlement'

vi.mock('@/api/salary', () => ({
    getSalaryFieldBreakdown: vi.fn(),
    manualAdjustSalary: vi.fn(),
}))
vi.mock('@/api/yearEnd', () => ({ listAppraisalPayouts: vi.fn() }))
vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn().mockReturnValue(true) }))
vi.mock('@/utils/download', () => ({ downloadFile: vi.fn() }))
vi.mock('element-plus', async (importOriginal) => {
    const actual = await importOriginal<typeof import('element-plus')>()
    return {
        ...actual,
        ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
        ElMessageBox: { alert: vi.fn().mockResolvedValue('confirm') },
    }
})

import { manualAdjustSalary } from '@/api/salary'

const rec = (over: Partial<SettlementRecord> = {}): SettlementRecord => ({
    id: 1,
    employee_id: 'E1',
    employee_name: '測試',
    version: 3,
    gross_salary: 40000,
    net_salary: 36000,
    is_finalized: false,
    breakdown_stale: false,
    manual_overrides: [],
    ...over,
})

const makeSettlement = (records: SettlementRecord[], prev: SettlementRecord[] = []) => {
    const recordsRef = ref(records)
    const prevRef = ref(prev)
    const thresholds = ref({ ...DEFAULT_THRESHOLDS })
    const anomalies = computed(() => detectAnomalies(recordsRef.value, prevRef.value, thresholds.value))
    return {
        records: recordsRef,
        prevRecords: prevRef,
        prevLoadFailed: ref(false),
        loading: ref(false),
        anomalies,
        sortedRecords: computed(() => sortByAttention(recordsRef.value, anomalies.value)),
        thresholds,
        refresh: vi.fn(),
    }
}

const STUBS = {
    'el-card': { template: '<div><slot /></div>' },
    'el-table': true,
    'el-switch': true,
    'el-popover': true,
    'el-form': true,
    'el-form-item': true,
    'el-input': true,
    'el-input-number': true,
    'el-button': { template: '<button><slot /></button>' },
    'el-dialog': true,
    'el-tag': true,
    'el-tooltip': { template: '<div><slot /></div>' },
    'el-icon': true,
    teleport: true,
}

interface ReviewVm {
    visibleRecords: SettlementRecord[]
    onlyAttention: boolean
}

describe('StepReview', () => {
    it('異常列排前；「只看需注意」過濾正確', async () => {
        const prev = [
            rec({ employee_id: 'A', net_salary: 30000 }),
            rec({ employee_id: 'B', net_salary: 30000 }),
        ]
        const cur = [
            rec({ employee_id: 'A', net_salary: 30000 }), // 正常
            rec({ employee_id: 'B', net_salary: 40000 }), // 差 33% → 異常
        ]
        const settlement = makeSettlement(cur, prev)
        const wrapper = mount(StepReview, {
            global: { stubs: STUBS, provide: { settlement, settleQuery: { year: 2026, month: 5 } } },
        })
        const vm = wrapper.vm as unknown as ReviewVm
        expect(vm.visibleRecords.map((r) => r.employee_id)).toEqual(['B', 'A'])

        vm.onlyAttention = true
        await flushPromises()
        expect(vm.visibleRecords.map((r) => r.employee_id)).toEqual(['B'])
    })

    it('需注意筆數摘要正確顯示', () => {
        const settlement = makeSettlement([rec({ manual_overrides: ['net_salary'] })])
        const wrapper = mount(StepReview, {
            global: { stubs: STUBS, provide: { settlement, settleQuery: { year: 2026, month: 5 } } },
        })
        expect(wrapper.text()).toContain('需注意')
        expect(wrapper.text()).toContain('共 1 人')
    })

    it('點欄位明細：有 record id 開 dialog、無 id 警告（取代舊 SalaryView 測試）', async () => {
        const { getSalaryFieldBreakdown } = await import('@/api/salary')
        vi.mocked(getSalaryFieldBreakdown).mockResolvedValue({
            data: { title: '底薪明細', employee: { employee_name: '測試' }, rows: [], columns: [] },
        } as never)
        const settlement = makeSettlement([rec({ id: 12 })])
        const wrapper = mount(StepReview, {
            global: { stubs: STUBS, provide: { settlement, settleQuery: { year: 2026, month: 5 } } },
        })
        const vm = wrapper.vm as unknown as {
            openFieldBreakdown: (row: SettlementRecord, field: string) => Promise<void>
            showFieldBreakdownDialog: boolean
        }
        await vm.openFieldBreakdown(settlement.records.value[0], 'base_salary')
        await flushPromises()
        expect(getSalaryFieldBreakdown).toHaveBeenCalledWith(12, 'base_salary')
        expect(vm.showFieldBreakdownDialog).toBe(true)
    })
})

describe('AdjustDrawer', () => {
    const DRAWER_STUBS = {
        'el-drawer': { template: '<div><slot /><slot name="footer" /></div>' },
        'el-alert': true,
        'el-form': { template: '<form><slot /></form>' },
        'el-form-item': { template: '<div><slot /></div>' },
        'el-input-number': true,
        'el-input': true,
        'el-button': { template: '<button><slot /></button>' },
        teleport: true,
    }

    beforeEach(() => {
        vi.mocked(manualAdjustSalary).mockReset()
        vi.mocked(ElMessageBox.alert).mockResolvedValue('confirm' as never)
    })

    it('儲存成功 → emit saved + 關閉；payload 帶 If-Match version', async () => {
        vi.mocked(manualAdjustSalary).mockResolvedValue({ data: { record: {} } } as never)
        const row = rec({ id: 77, version: 5, extra_allowance_label: '值週' })
        const wrapper = mount(AdjustDrawer, {
            props: { modelValue: true, row },
            global: { stubs: DRAWER_STUBS },
        })
        const vm = wrapper.vm as unknown as { reason: string; save: () => Promise<void> }
        vm.reason = '主管核准一次性獎勵'
        await vm.save()
        expect(manualAdjustSalary).toHaveBeenCalledWith(
            77,
            expect.objectContaining({ adjustment_reason: '主管核准一次性獎勵', extra_allowance_label: '值週' }),
            5,
        )
        expect(wrapper.emitted('saved')).toBeTruthy()
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    })

    it('原因 <5 字 → 不送出', async () => {
        const wrapper = mount(AdjustDrawer, {
            props: { modelValue: true, row: rec({ id: 77 }) },
            global: { stubs: DRAWER_STUBS },
        })
        const vm = wrapper.vm as unknown as { reason: string; save: () => Promise<void> }
        vm.reason = '短'
        await vm.save()
        expect(manualAdjustSalary).not.toHaveBeenCalled()
    })

    it('409 版本衝突 → alert 後 emit saved（外層重載）', async () => {
        vi.mocked(manualAdjustSalary).mockRejectedValue({ response: { status: 409, data: { detail: '已被修改' } } })
        const wrapper = mount(AdjustDrawer, {
            props: { modelValue: true, row: rec({ id: 77 }) },
            global: { stubs: DRAWER_STUBS },
        })
        const vm = wrapper.vm as unknown as { reason: string; save: () => Promise<void> }
        vm.reason = '誤算修正補登'
        await vm.save()
        await flushPromises()
        expect(ElMessageBox.alert).toHaveBeenCalled()
        expect(wrapper.emitted('saved')).toBeTruthy()
    })

    it('編輯其他欄位時不把已存的額外加給靜默歸零（回歸，原 SalaryView.test.js）', async () => {
        vi.mocked(manualAdjustSalary).mockResolvedValue({ data: { record: {} } } as never)
        // row 來自 DB records，自帶 extra_allowance=500；只改 reason 直接存
        const row = rec({ id: 88, extra_allowance: 500, extra_allowance_label: '值週' })
        const wrapper = mount(AdjustDrawer, {
            props: { modelValue: true, row },
            global: { stubs: DRAWER_STUBS },
        })
        const vm = wrapper.vm as unknown as { reason: string; save: () => Promise<void> }
        vm.reason = '只調整原因不動金額'
        await vm.save()
        expect(manualAdjustSalary).toHaveBeenCalledWith(
            88,
            expect.objectContaining({ extra_allowance: 500, extra_allowance_label: '值週' }),
            expect.anything(),
        )
    })

    it('已封存列 → 儲存按鈕 disabled', () => {
        const wrapper = mount(AdjustDrawer, {
            props: { modelValue: true, row: rec({ is_finalized: true }) },
            global: {
                stubs: {
                    ...DRAWER_STUBS,
                    'el-button': { template: '<button :disabled="disabled"><slot /></button>', props: ['disabled'] },
                },
            },
        })
        const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('儲存'))
        expect(saveBtn!.attributes('disabled')).toBeDefined()
    })
})

describe('StepReview 姓名搜尋', () => {
    it('reviewSearch 以姓名過濾 visibleRecords', async () => {
        const settlement = makeSettlement([
            rec({ employee_id: 'E1', employee_name: '王小明' }),
            rec({ employee_id: 'E2', employee_name: '陳大文' }),
            rec({ employee_id: 'E3', employee_name: '王美麗' }),
        ])
        const wrapper = mount(StepReview, {
            global: { stubs: STUBS, provide: { settlement, settleQuery: { year: 2026, month: 5 } } },
        })
        const vm = wrapper.vm as unknown as { reviewSearch: string; visibleRecords: { employee_id: string }[] }
        expect(vm.visibleRecords).toHaveLength(3)
        vm.reviewSearch = '王'
        await wrapper.vm.$nextTick()
        expect(vm.visibleRecords.map((r) => r.employee_id)).toEqual(['E1', 'E3'])
    })
})

describe('StepReview 上月比較 banner', () => {
    it('prevLoadFailed=true → 顯示載入失敗警示而非「上月無紀錄」', () => {
        const settlement = makeSettlement([rec()])
        settlement.prevLoadFailed.value = true
        const wrapper = mount(StepReview, {
            global: { stubs: STUBS, provide: { settlement, settleQuery: { year: 2026, month: 5 } } },
        })
        expect(wrapper.text()).toContain('上月資料載入失敗')
        expect(wrapper.text()).not.toContain('上月無紀錄')
    })

    it('上月真無資料（未失敗）→ 顯示「上月無紀錄」', () => {
        const settlement = makeSettlement([rec()])
        const wrapper = mount(StepReview, {
            global: { stubs: STUBS, provide: { settlement, settleQuery: { year: 2026, month: 5 } } },
        })
        expect(wrapper.text()).toContain('上月無紀錄')
    })
})

describe('StepReview 批次調整', () => {
  beforeEach(() => { vi.mocked(manualAdjustSalary).mockReset() })

  it('applyBatchAdjust 對每筆選取送單欄 partial payload 並 refresh', async () => {
    vi.mocked(manualAdjustSalary).mockResolvedValue({ data: { record: {} } } as never)
    const settlement = makeSettlement([rec({ id: 1 })])
    const wrapper = mount(StepReview, {
      global: { stubs: { ...STUBS, BatchAdjustDialog: true }, provide: { settlement, settleQuery: { year: 2026, month: 5 } } },
    })
    const vm = wrapper.vm as unknown as {
      selectedAdjustRows: SettlementRecord[]
      applyBatchAdjust: (p: { field: string; value: number; reason: string }) => Promise<void>
    }
    vm.selectedAdjustRows = [
      rec({ id: 1, employee_name: '甲', version: 3 }),
      rec({ id: 2, employee_name: '乙', version: 5 }),
    ]
    await vm.applyBatchAdjust({ field: 'festival_bonus', value: 500, reason: '活動加班補發' })
    expect(vi.mocked(manualAdjustSalary)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(manualAdjustSalary)).toHaveBeenCalledWith(1, { festival_bonus: 500, adjustment_reason: '活動加班補發' }, 3)
    expect(vi.mocked(manualAdjustSalary)).toHaveBeenCalledWith(2, { festival_bonus: 500, adjustment_reason: '活動加班補發' }, 5)
    expect(settlement.refresh).toHaveBeenCalled()
  })

  it('部分失敗時其餘成功並 warning', async () => {
    vi.mocked(manualAdjustSalary)
      .mockRejectedValueOnce({ response: { data: { detail: '已封存' } } })
      .mockResolvedValue({ data: { record: {} } } as never)
    const settlement = makeSettlement([rec({ id: 1 })])
    const wrapper = mount(StepReview, {
      global: { stubs: { ...STUBS, BatchAdjustDialog: true }, provide: { settlement, settleQuery: { year: 2026, month: 5 } } },
    })
    const vm = wrapper.vm as unknown as {
      selectedAdjustRows: SettlementRecord[]
      applyBatchAdjust: (p: { field: string; value: number; reason: string }) => Promise<void>
    }
    vm.selectedAdjustRows = [rec({ id: 1, employee_name: '甲', version: 3 }), rec({ id: 2, employee_name: '乙', version: 5 })]
    await vm.applyBatchAdjust({ field: 'overtime_pay', value: 300, reason: '值週津貼補發' })
    const { ElMessage } = await import('element-plus')
    expect(vi.mocked(ElMessage.warning)).toHaveBeenCalled()
    expect(settlement.refresh).toHaveBeenCalled()
  })
})
