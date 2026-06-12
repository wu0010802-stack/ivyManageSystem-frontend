import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed } from 'vue'
import StepCalculate from '../StepCalculate.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const calculateMock = vi.fn()
vi.mock('@/api/salary', () => ({ calculate: (...a: unknown[]) => calculateMock(...a) }))

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
    'el-alert': { template: '<div class="alert-stub">{{ $attrs.title }}</div>' },
    'el-card': { template: '<div><slot /></div>' },
    'el-tooltip': { template: '<div><slot /></div>' },
    'el-button': {
        template: '<button :disabled="disabled" v-bind="$attrs"><slot /></button>',
        props: ['disabled', 'loading'],
    },
}

const mountStep = (settlement: ReturnType<typeof makeSettlement>) =>
    mount(StepCalculate, {
        global: {
            stubs: STUBS,
            provide: { settlement, settleQuery: { year: 2026, month: 5 } },
        },
    })

describe('StepCalculate', () => {
    beforeEach(() => {
        calculateMock.mockReset()
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

    it('計算成功 → refresh + emit next；部分失敗 → warning', async () => {
        const settlement = makeSettlement('reviewing')
        calculateMock.mockResolvedValue({ data: { results: [], errors: [] } })
        const wrapper = mountStep(settlement)
        const btn = wrapper.findAll('button').find((b) => b.text().includes('計算薪資'))
        await btn!.trigger('click')
        await flushPromises()
        expect(calculateMock).toHaveBeenCalledWith(2026, 5)
        expect(settlement.refresh).toHaveBeenCalled()
        expect(wrapper.emitted('next')).toBeTruthy()
        expect(ElMessage.success).toHaveBeenCalled()

        calculateMock.mockResolvedValue({ data: { errors: [{ employee_name: '王', error: '缺底薪' }] } })
        await btn!.trigger('click')
        await flushPromises()
        expect(ElMessage.warning).toHaveBeenCalled()
    })

    it('使用者取消 confirm → 不呼叫 calculate', async () => {
        vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
        const wrapper = mountStep(makeSettlement('reviewing'))
        const btn = wrapper.findAll('button').find((b) => b.text().includes('計算薪資'))
        await btn!.trigger('click')
        await flushPromises()
        expect(calculateMock).not.toHaveBeenCalled()
    })
})
