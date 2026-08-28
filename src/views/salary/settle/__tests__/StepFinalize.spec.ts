import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed } from 'vue'
import StepFinalize from '../StepFinalize.vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
    deriveStatus,
    detectAnomalies,
    DEFAULT_THRESHOLDS,
    type SettlementRecord,
} from '@/composables/useSalarySettlement'

const finalizeMonthMock = vi.fn()
const unfinalizeSalaryMock = vi.fn()
vi.mock('@/api/salary', () => ({
    finalizeMonth: (...a: unknown[]) => finalizeMonthMock(...a),
    unfinalizeSalary: (...a: unknown[]) => unfinalizeSalaryMock(...a),
}))

const hasPermissionMock = vi.fn()
const getUserInfoMock = vi.fn()
vi.mock('@/utils/auth', () => ({
    hasPermission: (...a: unknown[]) => hasPermissionMock(...a),
    getUserInfo: () => getUserInfoMock(),
}))

vi.mock('element-plus', async (importOriginal) => {
    const actual = await importOriginal<typeof import('element-plus')>()
    return {
        ...actual,
        ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
        ElMessageBox: {
            confirm: vi.fn().mockResolvedValue('confirm'),
            prompt: vi.fn().mockResolvedValue({ value: '理由理由理由理由理由' }),
        },
    }
})

const rec = (over: Partial<SettlementRecord> = {}): SettlementRecord => ({
    id: 1,
    employee_id: 'E1',
    employee_name: '測試',
    version: 1,
    gross_salary: 40000,
    net_salary: 36000,
    is_finalized: false,
    breakdown_stale: false,
    manual_overrides: [],
    ...over,
})

const makeSettlement = (records: SettlementRecord[]) => {
    const recordsRef = ref(records)
    return {
        records: recordsRef,
        prevRecords: ref([] as SettlementRecord[]),
        loading: ref(false),
        status: computed(() => deriveStatus(recordsRef.value)),
        anomalies: computed(() => detectAnomalies(recordsRef.value, [], DEFAULT_THRESHOLDS)),
        finalizedCount: computed(() => recordsRef.value.filter((r) => r.is_finalized).length),
        refresh: vi.fn().mockResolvedValue(undefined),
    }
}

const STUBS = {
    'el-card': { template: '<div><slot /></div>' },
    'el-alert': { template: '<div class="alert-stub"><slot /></div>' },
    'el-tooltip': { template: '<div><slot /></div>' },
    'el-button': { template: '<button :disabled="disabled"><slot /></button>', props: ['disabled', 'loading'] },
    'el-table': true,
    'el-table-column': true,
    'el-icon': true,
}

const mountStep = (settlement: ReturnType<typeof makeSettlement>) =>
    mount(StepFinalize, {
        global: { stubs: STUBS, provide: { settlement, settleQuery: { year: 2026, month: 5 } } },
    })

describe('StepFinalize', () => {
    beforeEach(() => {
        finalizeMonthMock.mockReset()
        unfinalizeSalaryMock.mockReset()
        hasPermissionMock.mockReturnValue(true)
        getUserInfoMock.mockReturnValue({ role: 'hr' })
        vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
        vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: '理由理由理由理由理由' } as never)
        vi.mocked(ElMessage.success).mockReset()
    })

    it('定案成功 → finalizeMonth + refresh', async () => {
        finalizeMonthMock.mockResolvedValue({
            data: { message: '已封存', count: 2, skipped_missing: [], skipped_stale: [], force: false },
        })
        const settlement = makeSettlement([rec(), rec({ employee_id: 'E2', id: 2 })])
        const wrapper = mountStep(settlement)
        const btn = wrapper.findAll('button').find((b) => b.text().includes('整月定案'))
        await btn!.trigger('click')
        await flushPromises()
        expect(finalizeMonthMock).toHaveBeenCalledWith({
            year: 2026,
            month: 5,
            force: false,
        })
        expect(settlement.refresh).toHaveBeenCalled()
        expect(ElMessage.success).toHaveBeenCalled()
    })

    it('409 → 顯示 blockers；有財務覆核權限時可強制封存（帶 ≥10 字理由）', async () => {
        finalizeMonthMock.mockRejectedValueOnce({
            response: { status: 409, data: { detail: ['王小明 缺薪資紀錄'] } },
        })
        const settlement = makeSettlement([rec()])
        const wrapper = mountStep(settlement)
        const btn = wrapper.findAll('button').find((b) => b.text().includes('整月定案'))
        await btn!.trigger('click')
        await flushPromises()
        expect(wrapper.text()).toContain('王小明 缺薪資紀錄')

        finalizeMonthMock.mockResolvedValueOnce({
            data: { message: '已封存', count: 1, skipped_missing: [{ id: 3, name: '王小明' }], skipped_stale: [], force: true },
        })
        const forceBtn = wrapper.findAll('button').find((b) => b.text().includes('強制封存'))
        expect(forceBtn).toBeTruthy()
        await forceBtn!.trigger('click')
        await flushPromises()
        expect(finalizeMonthMock).toHaveBeenLastCalledWith({
            year: 2026, month: 5, force: true, force_reason: '理由理由理由理由理由',
        })
    })

    it('無財務覆核權限 → 不顯示強制封存按鈕', async () => {
        hasPermissionMock.mockImplementation((p: string) => p !== 'ACTIVITY_PAYMENT_APPROVE')
        finalizeMonthMock.mockRejectedValue({ response: { status: 409, data: { detail: '有 stale 紀錄' } } })
        const wrapper = mountStep(makeSettlement([rec()]))
        const btn = wrapper.findAll('button').find((b) => b.text().includes('整月定案'))
        await btn!.trigger('click')
        await flushPromises()
        expect(wrapper.findAll('button').find((b) => b.text().includes('強制封存'))).toBeUndefined()
        expect(wrapper.text()).toContain('需要財務覆核權限')
    })

    it('個別退回 → unfinalizeSalary 帶理由 + refresh', async () => {
        unfinalizeSalaryMock.mockResolvedValue({ data: {} })
        const settlement = makeSettlement([rec({ id: 9, is_finalized: true, finalized_by: 'admin' })])
        const wrapper = mountStep(settlement)
        const vm = wrapper.vm as unknown as { onUnfinalize: (row: SettlementRecord) => Promise<void> }
        await vm.onUnfinalize(settlement.records.value[0])
        await flushPromises()
        expect(unfinalizeSalaryMock).toHaveBeenCalledWith(9, '理由理由理由理由理由')
        expect(settlement.refresh).toHaveBeenCalled()
    })

    it('非 admin/hr 即使持有兩項權限，也不可呼叫個別退回', async () => {
        getUserInfoMock.mockReturnValue({ role: 'accountant' })
        const settlement = makeSettlement([rec({ id: 9, is_finalized: true })])
        const wrapper = mountStep(settlement)
        const vm = wrapper.vm as unknown as { onUnfinalize: (row: SettlementRecord) => Promise<void> }

        await vm.onUnfinalize(settlement.records.value[0])

        expect(ElMessageBox.prompt).not.toHaveBeenCalled()
        expect(unfinalizeSalaryMock).not.toHaveBeenCalled()
    })

    it('全數封存 → 定案鈕 disabled、下一步可前進', () => {
        const wrapper = mountStep(makeSettlement([rec({ is_finalized: true })]))
        const finalizeBtn = wrapper.findAll('button').find((b) => b.text().includes('整月定案'))
        expect(finalizeBtn!.attributes('disabled')).toBeDefined()
        const nextBtn = wrapper.findAll('button').find((b) => b.text().includes('下一步'))
        expect(nextBtn!.attributes('disabled')).toBeUndefined()
    })

    it('總實發納入未休假折現', () => {
        const wrapper = mountStep(
            makeSettlement([rec({ net_salary: 36000, unused_leave_payout: 5000 })]),
        )
        const vm = wrapper.vm as unknown as { totalNet: number }
        expect(vm.totalNet).toBe(41000)
    })
})

describe('StepFinalize 退回防連點', () => {
    it('退回進行中再觸發同列 → unfinalizeSalary 只呼叫一次', async () => {
        hasPermissionMock.mockReturnValue(true)
        getUserInfoMock.mockReturnValue({ role: 'hr' })
        vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: '理由理由理由理由理由' } as never)
        const settlement = makeSettlement([rec({ id: 9, is_finalized: true })])
        unfinalizeSalaryMock.mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 20)),
        )
        const wrapper = mountStep(settlement)
        const vm = wrapper.vm as unknown as {
            onUnfinalize: (row: SettlementRecord) => Promise<void>
        }
        const row = settlement.records.value[0]
        await Promise.all([vm.onUnfinalize(row), vm.onUnfinalize(row)])
        expect(unfinalizeSalaryMock).toHaveBeenCalledTimes(1)
    })
})
