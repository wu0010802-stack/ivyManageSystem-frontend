import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed } from 'vue'
import StepCalculate from '../StepCalculate.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const calculateMock = vi.fn()
const calculateAsyncMock = vi.fn()
const getSalaryCalcJobMock = vi.fn()
const getSnapshotMock = vi.fn()
vi.mock('@/api/salary', () => ({
    calculate: (...a: unknown[]) => calculateMock(...a),
    calculateAsync: (...a: unknown[]) => calculateAsyncMock(...a),
    getSalaryCalcJob: (...a: unknown[]) => getSalaryCalcJobMock(...a),
    getEnrollmentSnapshot: (...a: unknown[]) => getSnapshotMock(...a),
}))

const hasPermissionMock = vi.fn().mockReturnValue(true)
vi.mock('@/utils/auth', () => ({ hasPermission: (...a: unknown[]) => hasPermissionMock(...a) }))

vi.mock('element-plus', async (importOriginal) => {
    const actual = await importOriginal<typeof import('element-plus')>()
    return {
        ...actual,
        ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
        ElMessageBox: { confirm: vi.fn().mockResolvedValue('confirm') },
    }
})

const makeSettlement = (status: string, records: unknown[] = []) => ({
    records: ref(records),
    status: computed(() => status),
    refresh: vi.fn().mockResolvedValue(undefined),
})

const STUBS = {
    'el-alert': { template: '<div class="alert-stub">{{ $attrs.title }}<slot /></div>' },
    'el-card': { template: '<div><slot /></div>' },
    'el-tooltip': { template: '<div><slot /></div>' },
    'el-button': {
        template: '<button :disabled="disabled" v-bind="$attrs"><slot /></button>',
        props: ['disabled', 'loading'],
    },
}

const mountStep = (settlement: ReturnType<typeof makeSettlement>, month = 5) =>
    mount(StepCalculate, {
        global: {
            stubs: STUBS,
            provide: { settlement, settleQuery: { year: 2026, month } },
        },
    })

describe('StepCalculate', () => {
    beforeEach(() => {
        calculateMock.mockReset()
        calculateAsyncMock.mockReset()
        getSalaryCalcJobMock.mockReset()
        getSnapshotMock.mockReset()
        getSnapshotMock.mockResolvedValue({ data: { covered_months: [], rows: [] } })
        hasPermissionMock.mockReturnValue(true)
        vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
        vi.mocked(ElMessage.success).mockReset()
        vi.mocked(ElMessage.warning).mockReset()
    })

    it('已定案 → 計算按鈕 disabled', () => {
        const wrapper = mountStep(makeSettlement('finalized'))
        const btn = wrapper.findAll('button').find((b) => b.text().includes('計算薪資'))
        expect(btn!.attributes('disabled')).toBeDefined()
    })

    it('無 SALARY_WRITE → 唯讀 disabled', () => {
        hasPermissionMock.mockReturnValue(false)
        const wrapper = mountStep(makeSettlement('reviewing'))
        const btn = wrapper.findAll('button').find((b) => b.text().includes('計算薪資'))
        expect(btn!.attributes('disabled')).toBeDefined()
    })

    it('needs_recalc → 顯示重算建議橫幅', () => {
        const wrapper = mountStep(makeSettlement('needs_recalc'))
        expect(wrapper.text()).toContain('建議重新計算')
    })

    it('計算成功 → refresh + emit next', async () => {
        const settlement = makeSettlement('reviewing')
        calculateAsyncMock.mockResolvedValue({ data: { job_id: 'job-1', total: 3 } })
        getSalaryCalcJobMock.mockResolvedValue({
            data: { job_id: 'job-1', status: 'completed', errors: [], done: 3, total: 3, current_employee: '' },
        })
        const wrapper = mountStep(settlement)
        const btn = wrapper.findAll('button').find((b) => b.text().includes('計算薪資'))
        await btn!.trigger('click')
        await flushPromises()
        expect(calculateAsyncMock).toHaveBeenCalledWith(2026, 5)
        expect(settlement.refresh).toHaveBeenCalled()
        expect(wrapper.emitted('next')).toBeTruthy()
        expect(ElMessage.success).toHaveBeenCalled()
    })

    it('部分失敗 → 持久警示列出失敗員工、停留在計算步驟', async () => {
        const settlement = makeSettlement('reviewing')
        calculateAsyncMock.mockResolvedValue({ data: { job_id: 'job-2', total: 3 } })
        getSalaryCalcJobMock.mockResolvedValue({
            data: {
                job_id: 'job-2',
                status: 'completed',
                errors: [{ employee_name: '王小明', error: '缺底薪' }],
                done: 2,
                total: 3,
                current_employee: '',
            },
        })
        const wrapper = mountStep(settlement)
        const btn = wrapper.findAll('button').find((b) => b.text().includes('計算薪資'))
        await btn!.trigger('click')
        await flushPromises()
        // 不自動進覆核（失敗員工在覆核表中是「不存在」而非標紅，滑過去會漏看）
        expect(wrapper.emitted('next')).toBeFalsy()
        expect(settlement.refresh).toHaveBeenCalled()
        // 持久警示（非 3 秒 toast）列出失敗員工與原因
        expect(wrapper.text()).toContain('王小明')
        expect(wrapper.text()).toContain('缺底薪')

        // 重算全成功 → 警示清除、照常前進
        getSalaryCalcJobMock.mockResolvedValue({
            data: {
                job_id: 'job-2',
                status: 'completed',
                errors: [],
                done: 3,
                total: 3,
                current_employee: '',
            },
        })
        await btn!.trigger('click')
        await flushPromises()
        expect(wrapper.emitted('next')).toBeTruthy()
        expect(wrapper.text()).not.toContain('王小明')
    })

    it('使用者取消 confirm → 不呼叫 calculateAsync', async () => {
        vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
        const wrapper = mountStep(makeSettlement('reviewing'))
        const btn = wrapper.findAll('button').find((b) => b.text().includes('計算薪資'))
        await btn!.trigger('click')
        await flushPromises()
        expect(calculateAsyncMock).not.toHaveBeenCalled()
    })

    it('發放月涵蓋月快照未全確認 → 計算按鈕 disabled（決策2 gate）', async () => {
        getSnapshotMock.mockImplementation((year: number, month: number) => {
            if (month === 6) {
                return Promise.resolve({
                    data: { covered_months: [[2026, 2], [2026, 3], [2026, 4], [2026, 5]], rows: [] },
                })
            }
            // 2 月已確認，3/4/5 月未確認
            return Promise.resolve({ data: { rows: [{ is_confirmed: month === 2 }] } })
        })
        const wrapper = mountStep(makeSettlement('idle'), 6)
        await flushPromises()
        const btn = wrapper.findAll('button').find((b) => b.text().includes('計算薪資'))
        expect(btn!.attributes('disabled')).toBeDefined()
    })

    it('發放月涵蓋月快照全確認 → 計算按鈕可用', async () => {
        getSnapshotMock.mockImplementation((year: number, month: number) => {
            if (month === 6) {
                return Promise.resolve({
                    data: { covered_months: [[2026, 2], [2026, 5]], rows: [] },
                })
            }
            return Promise.resolve({ data: { rows: [{ is_confirmed: true }] } })
        })
        const wrapper = mountStep(makeSettlement('idle'), 6)
        await flushPromises()
        const btn = wrapper.findAll('button').find((b) => b.text().includes('計算薪資'))
        expect(btn!.attributes('disabled')).toBeUndefined()
    })

    it('非發放月不查快照 gate（不呼叫 getEnrollmentSnapshot）', async () => {
        mountStep(makeSettlement('idle'), 5)
        await flushPromises()
        expect(getSnapshotMock).not.toHaveBeenCalled()
    })
})
