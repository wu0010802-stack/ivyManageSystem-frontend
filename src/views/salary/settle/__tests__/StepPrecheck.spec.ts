import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import StepPrecheck from '../StepPrecheck.vue'

const getLeavesMock = vi.fn()
const getOvertimesMock = vi.fn()
const getCorrectionsMock = vi.fn()
vi.mock('@/api/leaves', () => ({ getLeaves: (...a: unknown[]) => getLeavesMock(...a) }))
vi.mock('@/api/overtimes', () => ({ getOvertimes: (...a: unknown[]) => getOvertimesMock(...a) }))
vi.mock('@/api/punchCorrections', () => ({ getCorrections: (...a: unknown[]) => getCorrectionsMock(...a) }))

const pushMock = vi.fn()

const STUBS = {
    // 快照面板自有 spec（EnrollmentSnapshotPanel.spec.ts），此處 stub 避免觸發 api
    EnrollmentSnapshotPanel: true,
    'el-alert': { template: '<div class="alert-stub">{{ $attrs.title }}</div>' },
    'el-card': { template: '<div><slot /></div>' },
    'el-result': { template: '<div class="result-stub">{{ $attrs.title }}</div>' },
    // 純 button：讓 @click 以原生 fallthrough 單次觸發（stub 再 $emit('click') 會 double fire）
    'el-button': { template: '<button><slot /></button>' },
}

const mountStep = (settleQuery = { year: 2026, month: 5 }) =>
    mount(StepPrecheck, {
        global: {
            stubs: STUBS,
            provide: { settleQuery },
            mocks: { $router: { push: pushMock } },
        },
    })

describe('StepPrecheck', () => {
    beforeEach(() => {
        pushMock.mockReset()
        getLeavesMock.mockReset()
        getOvertimesMock.mockReset()
        getCorrectionsMock.mockReset()
    })

    it('有 pending 項目：顯示計數與「前往簽核」連結、警告但不擋下一步', async () => {
        getLeavesMock.mockResolvedValue({ data: [{}, {}] })
        getOvertimesMock.mockResolvedValue({ data: [{}] })
        getCorrectionsMock.mockResolvedValue({ data: [] })
        const wrapper = mountStep()
        await flushPromises()

        expect(getLeavesMock).toHaveBeenCalledWith({ year: 2026, month: 5, status: 'pending' })
        expect(wrapper.text()).toContain('3 筆未簽核項目')
        expect(wrapper.text()).toContain('待簽核假單')
        expect(wrapper.text()).toContain('待簽核加班單')
        expect(wrapper.text()).not.toContain('待簽核補打卡')

        // 不擋：下一步按鈕仍可按
        const nextBtn = wrapper.findAll('button').find((b) => b.text().includes('下一步'))
        await nextBtn!.trigger('click')
        expect(wrapper.emitted('next')).toHaveLength(1)
    })

    it('全部簽核完畢：顯示就緒', async () => {
        getLeavesMock.mockResolvedValue({ data: [] })
        getOvertimesMock.mockResolvedValue({ data: [] })
        getCorrectionsMock.mockResolvedValue({ data: [] })
        const wrapper = mountStep()
        await flushPromises()
        expect(wrapper.text()).toContain('無未簽核項目')
    })

    it('節慶發放月（6 月）顯示提示、非發放月（5 月）不顯示', async () => {
        getLeavesMock.mockResolvedValue({ data: [] })
        getOvertimesMock.mockResolvedValue({ data: [] })
        getCorrectionsMock.mockResolvedValue({ data: [] })

        const w6 = mountStep({ year: 2026, month: 6 })
        await flushPromises()
        expect(w6.text()).toContain('節慶獎金發放月')

        const w5 = mountStep({ year: 2026, month: 5 })
        await flushPromises()
        expect(w5.text()).not.toContain('節慶獎金發放月')
    })
})
