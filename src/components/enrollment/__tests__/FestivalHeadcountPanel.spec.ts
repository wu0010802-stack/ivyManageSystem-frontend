import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import FestivalHeadcountPanel from '../FestivalHeadcountPanel.vue'

const getMock = vi.fn()
const generateMock = vi.fn()
const patchMock = vi.fn()
const confirmMock = vi.fn()
const reopenMock = vi.fn()
const exclusionsMock = vi.fn()
// vi.mock 的 factory 會被 hoist 到檔頂，直接引用 top-level const 會 ReferenceError；
// warningMock 是唯一被 factory 直接取值（非 lazy 呼叫）的 mock，故走 vi.hoisted。
const { warningMock } = vi.hoisted(() => ({ warningMock: vi.fn() }))

vi.mock('@/api/salary', () => ({
    getEnrollmentSnapshot: (...a: unknown[]) => getMock(...a),
    generateEnrollmentSnapshot: (...a: unknown[]) => generateMock(...a),
    patchEnrollmentSnapshot: (...a: unknown[]) => patchMock(...a),
    confirmEnrollmentSnapshot: (...a: unknown[]) => confirmMock(...a),
    reopenEnrollmentSnapshot: (...a: unknown[]) => reopenMock(...a),
    getEnrollmentSnapshotExclusions: (...a: unknown[]) => exclusionsMock(...a),
}))

vi.mock('element-plus', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>()
    return {
        ...actual,
        ElMessage: { success: vi.fn(), warning: warningMock, error: vi.fn() },
    }
})

const STUBS = {
    'el-card': { template: '<div class="card"><slot name="header" /><slot /></div>' },
    'el-tabs': { template: '<div><slot /></div>' },
    'el-tab-pane': { template: '<div />' },
    'el-table': {
        props: ['data'],
        template:
            '<table class="fh-table"><tr v-for="r in data" :key="r.id" class="fh-row">' +
            '<td class="c-name">{{ r.classroom_name }}</td>' +
            '<td class="c-system">{{ r.system_count }}</td>' +
            '<td class="c-long">{{ r.long_leave_excluded_count }}</td>' +
            '<td class="c-manual">{{ r.manual_delta }}</td>' +
            '<td class="c-final">{{ r.student_count }}</td>' +
            '<td class="c-confirmed">{{ r.is_confirmed ? "已確認" : "未確認" }}</td>' +
            '</tr></table>',
    },
    'el-table-column': true,
    'el-tag': true,
    'el-empty': true,
    'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
    'el-form': true,
    'el-form-item': true,
    'el-input': true,
    'el-input-number': true,
    'el-button': { template: '<button><slot /></button>' },
}

const row = (over: Record<string, unknown> = {}) => ({
    id: 1,
    classroom_id: 1,
    classroom_name: '天堂鳥',
    student_count: 24,
    system_count: 24,
    long_leave_excluded_count: 2,
    on_leave_count: 1,
    other_excluded_count: 0,
    manual_delta: 0,
    count_mode: 'month_end',
    rule_version: 'fh-v1',
    is_confirmed: false,
    adjust_reason: null,
    ...over,
})

const monthResponse = (rows: unknown[], over: Record<string, unknown> = {}) => ({
    data: {
        exists: rows.length > 0,
        covered_months: [],
        long_leave_mode: 'observe',
        long_leave_threshold_days: 10,
        is_post_cutoff: false,
        cutoff_ym: null,
        rows,
        ...over,
    },
})

const mountPanel = (props: Record<string, unknown> = {}) =>
    mount(FestivalHeadcountPanel, {
        props: { year: 2026, month: 1, mode: 'single', ...props },
        global: { stubs: STUBS },
    })

describe('FestivalHeadcountPanel — 節慶人數結算', () => {
    beforeEach(() => {
        getMock.mockReset()
        generateMock.mockReset()
        patchMock.mockReset()
        confirmMock.mockReset()
        reopenMock.mockReset()
        exclusionsMock.mockReset()
        warningMock.mockReset()
    })

    it('single 模式只載入指定月，不查 covered_months', async () => {
        getMock.mockResolvedValue(monthResponse([row()]))
        const wrapper = mountPanel()
        await flushPromises()
        expect(getMock).toHaveBeenCalledTimes(1)
        expect(getMock).toHaveBeenCalledWith(2026, 1)
        expect(wrapper.text()).toContain('天堂鳥')
    })

    it('顯示系統在籍／長假排除／人工調整／最終節慶人數', async () => {
        getMock.mockResolvedValue(monthResponse([row({ manual_delta: 2, student_count: 26 })]))
        const wrapper = mountPanel()
        await flushPromises()
        expect(wrapper.find('.c-system').text()).toBe('24')
        expect(wrapper.find('.c-long').text()).toBe('2')
        expect(wrapper.find('.c-manual').text()).toBe('2')
        expect(wrapper.find('.c-final').text()).toBe('26')
    })

    it('observe 模式提示長假只統計不扣除', async () => {
        getMock.mockResolvedValue(monthResponse([row()]))
        const wrapper = mountPanel()
        await flushPromises()
        expect(wrapper.text()).toContain('觀察期')
        expect(wrapper.text()).toContain('只統計、不扣除人數')
    })

    it('enforce 模式不顯示觀察期提示', async () => {
        getMock.mockResolvedValue(monthResponse([row()], { long_leave_mode: 'enforce' }))
        const wrapper = mountPanel()
        await flushPromises()
        expect(wrapper.text()).not.toContain('觀察期')
    })

    it('未確認時顯示未確認狀態', async () => {
        getMock.mockResolvedValue(monthResponse([row({ is_confirmed: false })]))
        const wrapper = mountPanel()
        await flushPromises()
        expect(wrapper.find('.c-confirmed').text()).toBe('未確認')
    })

    it('人工調整原因少於 10 字時不送出', async () => {
        getMock.mockResolvedValue(monthResponse([row()]))
        const wrapper = mountPanel()
        await flushPromises()
        const vm = wrapper.vm as unknown as {
            openEdit: (r: unknown) => void
            editForm: { student_count: number; reason: string }
            saveEdit: () => Promise<void>
        }
        vm.openEdit(row())
        vm.editForm.reason = '太短'
        await vm.saveEdit()
        expect(patchMock).not.toHaveBeenCalled()
        expect(warningMock).toHaveBeenCalled()
    })

    it('人工調整原因足夠時送出並帶原因', async () => {
        getMock.mockResolvedValue(monthResponse([row()]))
        patchMock.mockResolvedValue({ data: { before: 24, after: 26 } })
        const wrapper = mountPanel()
        await flushPromises()
        const vm = wrapper.vm as unknown as {
            openEdit: (r: unknown) => void
            editForm: { student_count: number; reason: string }
            saveEdit: () => Promise<void>
        }
        vm.openEdit(row())
        vm.editForm.student_count = 26
        vm.editForm.reason = '點名冊核對後補登兩位新生'
        await vm.saveEdit()
        await flushPromises()
        expect(patchMock).toHaveBeenCalledWith(1, {
            student_count: 26,
            reason: '點名冊核對後補登兩位新生',
        })
    })

    it('重開需填原因', async () => {
        getMock.mockResolvedValue(monthResponse([row({ is_confirmed: true })]))
        const wrapper = mountPanel()
        await flushPromises()
        const vm = wrapper.vm as unknown as {
            reopenReason: string
            saveReopen: () => Promise<void>
        }
        vm.reopenReason = '短'
        await vm.saveReopen()
        expect(reopenMock).not.toHaveBeenCalled()
        expect(warningMock).toHaveBeenCalled()
    })

    it('重開帶原因送出', async () => {
        getMock.mockResolvedValue(monthResponse([row({ is_confirmed: true })]))
        reopenMock.mockResolvedValue({ data: { reopened: 2 } })
        const wrapper = mountPanel()
        await flushPromises()
        const vm = wrapper.vm as unknown as {
            reopenReason: string
            saveReopen: () => Promise<void>
        }
        vm.reopenReason = '一月底發現兩位轉出未登錄'
        await vm.saveReopen()
        await flushPromises()
        expect(reopenMock).toHaveBeenCalledWith({
            year: 2026,
            month: 1,
            reason: '一月底發現兩位轉出未登錄',
        })
    })

    it('排除明細只顯示學號與天數，不顯示姓名', async () => {
        getMock.mockResolvedValue(monthResponse([row()]))
        exclusionsMock.mockResolvedValue({
            data: {
                items: [
                    { student_id: 7, student_number: 'S007', reason_code: 'long_leave', leave_days: 11 },
                    { student_id: 8, student_number: 'S008', reason_code: 'on_leave', leave_days: null },
                ],
            },
        })
        const wrapper = mountPanel()
        await flushPromises()
        const vm = wrapper.vm as unknown as {
            openExclusions: (r: unknown) => Promise<void>
            exclusionItems: { student_id: number }[]
        }
        await vm.openExclusions(row())
        await flushPromises()
        expect(exclusionsMock).toHaveBeenCalledWith(1)
        expect(vm.exclusionItems).toHaveLength(2)
        expect(wrapper.text()).toContain('不顯示幼生姓名')
        expect(Object.keys(vm.exclusionItems[0])).not.toContain('name')
    })

    it('readonly 模式不顯示產生／確認／重開按鈕', async () => {
        getMock.mockResolvedValue(monthResponse([row()]))
        const wrapper = mountPanel({ readonly: true })
        await flushPromises()
        const labels = wrapper.findAll('button').map((b) => b.text())
        expect(labels).not.toContain('產生節慶人數')
        expect(labels).not.toContain('確認本月')
        expect(labels).not.toContain('重開本月')
    })

    it('coverage 模式先查 covered_months 再逐月載入', async () => {
        getMock.mockImplementation((_y: number, month: number) =>
            Promise.resolve(
                month === 6
                    ? monthResponse([], { covered_months: [[2026, 2], [2026, 3]] })
                    : monthResponse([row()]),
            ),
        )
        const wrapper = mountPanel({ mode: 'coverage', year: 2026, month: 6 })
        await flushPromises()
        expect(getMock).toHaveBeenCalledWith(2026, 6)
        expect(getMock).toHaveBeenCalledWith(2026, 2)
        expect(getMock).toHaveBeenCalledWith(2026, 3)
        expect(wrapper.text()).toContain('2月、3月')
    })

    it('coverage 模式 covered_months 為空時整個面板不顯示', async () => {
        getMock.mockResolvedValue(monthResponse([], { covered_months: [] }))
        const wrapper = mountPanel({ mode: 'coverage', year: 2026, month: 5 })
        await flushPromises()
        expect(wrapper.find('.snap-card').exists()).toBe(false)
    })
})
