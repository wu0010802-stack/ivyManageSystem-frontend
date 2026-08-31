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

const qualificationExportMock = vi.fn()
vi.mock('@/api/govReports', () => ({
    getStaffQualificationChecklist: (...args: unknown[]) => qualificationExportMock(...args),
}))

const hasPermissionMock = vi.fn()
const hasFullSalaryViewMock = vi.fn()
vi.mock('@/utils/auth', () => ({
    hasPermission: (...args: unknown[]) => hasPermissionMock(...args),
    hasFullSalaryView: () => hasFullSalaryViewMock(),
}))

const saveBlobResponseMock = vi.fn()
vi.mock('@/utils/download', () => ({
    saveBlobResponse: (...args: unknown[]) => saveBlobResponseMock(...args),
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
        qualificationExportMock.mockReset()
        hasPermissionMock.mockReset()
        hasPermissionMock.mockReturnValue(false)
        hasFullSalaryViewMock.mockReset().mockReturnValue(true)
        saveBlobResponseMock.mockReset()
    })

    it('非完整薪資角色不顯示跨員工獎金入口', async () => {
        hasFullSalaryViewMock.mockReturnValue(false)
        getRecordsMock.mockResolvedValue({ data: [] })

        const wrapper = mountHub()
        await flushPromises()

        expect(wrapper.text()).not.toContain('招生獎金')
        expect(wrapper.text()).not.toContain('自主成長獎勵金')
        expect(wrapper.text()).toContain('薪資總覽與歷史')
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

    it('沒有政府報表匯出權限時不顯示 4 合 1 下載入口', async () => {
        getRecordsMock.mockResolvedValue({ data: [] })
        const wrapper = mountHub()
        await flushPromises()

        expect(
            wrapper.find('[data-testid="qualification-checklist-export"]').exists(),
        ).toBe(false)
    })

    it('持政府報表匯出權限時，可依目前年月下載 4 合 1 核對表', async () => {
        hasPermissionMock.mockImplementation(
            (permission: string) => permission === 'GOV_REPORTS_EXPORT',
        )
        getRecordsMock.mockResolvedValue({ data: [] })
        const response = {
            data: new Blob(['xlsx']),
            headers: {},
        }
        qualificationExportMock.mockResolvedValue(response)
        const wrapper = mountHub()
        await flushPromises()

        const button = wrapper.get('[data-testid="qualification-checklist-export"]')
        await button.trigger('click')
        await flushPromises()

        const now = new Date()
        expect(hasPermissionMock).toHaveBeenCalledWith('GOV_REPORTS_EXPORT')
        expect(qualificationExportMock).toHaveBeenCalledWith({
            year: now.getFullYear(),
            month: now.getMonth() + 1,
        })
        expect(saveBlobResponseMock).toHaveBeenCalledWith(
            response,
            expect.stringContaining('教職員4合1資格核對表'),
        )
    })
})
