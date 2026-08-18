import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SalaryHubView from '../SalaryHubView.vue'

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
    useRouter: () => ({ push: pushMock }),
}))

const getRecordsMock = vi.fn()
vi.mock('@/api/salary', () => ({
    getRecords: (...args: unknown[]) => getRecordsMock(...args),
}))

const rec = (over: Record<string, unknown> = {}) => ({
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

const STUBS = {
    'el-select': true,
    'el-option': true,
    'el-card': { template: '<div><slot /></div>' },
    'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
    'el-icon': true,
}

const mountHub = () =>
    mount(SalaryHubView, { global: { stubs: STUBS } })

describe('SalaryHubView', () => {
    beforeEach(() => {
        pushMock.mockReset()
        getRecordsMock.mockReset()
    })

    it('覆核中狀態：顯示封存進度與需注意數，深連結到 review 步驟', async () => {
        // 本月 2 筆（1 封存 1 未封存 + 手動調整異常）；上月查詢回空
        getRecordsMock.mockImplementation((_y: number, m: number) => {
            const now = new Date()
            if (m === now.getMonth() + 1) {
                return Promise.resolve({
                    data: [
                        rec({ employee_id: 'A', is_finalized: true }),
                        rec({ employee_id: 'B', manual_overrides: ['net_salary'] }),
                    ],
                })
            }
            return Promise.resolve({ data: [] })
        })
        const wrapper = mountHub()
        await flushPromises()
        expect(wrapper.text()).toContain('覆核中')
        expect(wrapper.text()).toContain('1 / 2 人')
        expect(wrapper.text()).toContain('1 筆')

        await wrapper.find('button').trigger('click')
        expect(pushMock).toHaveBeenCalledWith(
            expect.objectContaining({
                path: '/salary/settle',
                query: expect.objectContaining({ step: 'review' }),
            }),
        )
    })

    it('概況卡不渲染裝飾 icon，狀態語意色掛在數值上', async () => {
        getRecordsMock.mockResolvedValue({ data: [rec({ breakdown_stale: true })] })
        const wrapper = mountHub()
        await flushPromises()
        expect(wrapper.findAll('.stat-card')).toHaveLength(3)
        expect(wrapper.find('.stat-card__icon-wrap').exists()).toBe(false)
        expect(wrapper.findAll('.stat-card--iconless')).toHaveLength(3)
        // needs_recalc → warning：色彩掛在卡片上，文字本身仍寫明狀態
        expect(wrapper.find('.stat-card--warning').exists()).toBe(true)
        expect(wrapper.text()).toContain('需重算')
    })

    it('無紀錄：未計算狀態，深連結到 precheck', async () => {
        getRecordsMock.mockResolvedValue({ data: [] })
        const wrapper = mountHub()
        await flushPromises()
        expect(wrapper.text()).toContain('未計算')

        await wrapper.find('button').trigger('click')
        expect(pushMock).toHaveBeenCalledWith(
            expect.objectContaining({ query: expect.objectContaining({ step: 'precheck' }) }),
        )
    })

    it('全封存：已定案狀態，深連結到 export', async () => {
        getRecordsMock.mockResolvedValue({ data: [rec({ is_finalized: true })] })
        const wrapper = mountHub()
        await flushPromises()
        expect(wrapper.text()).toContain('已定案')

        await wrapper.find('button').trigger('click')
        expect(pushMock).toHaveBeenCalledWith(
            expect.objectContaining({ query: expect.objectContaining({ step: 'export' }) }),
        )
    })
})
