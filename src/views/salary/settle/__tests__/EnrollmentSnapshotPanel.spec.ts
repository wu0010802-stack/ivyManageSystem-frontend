import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import EnrollmentSnapshotPanel from '../EnrollmentSnapshotPanel.vue'

const getMock = vi.fn()
const generateMock = vi.fn()
const patchMock = vi.fn()
const confirmMock = vi.fn()
const hasPermissionMock = vi.fn()

vi.mock('@/api/salary', () => ({
    getEnrollmentSnapshot: (...a: unknown[]) => getMock(...a),
    generateEnrollmentSnapshot: (...a: unknown[]) => generateMock(...a),
    patchEnrollmentSnapshot: (...a: unknown[]) => patchMock(...a),
    confirmEnrollmentSnapshot: (...a: unknown[]) => confirmMock(...a),
}))

// 2026-08-21 薄殼化：本元件改為委派 @/components/enrollment/FestivalHeadcountPanel，
// 並依 SALARY_WRITE 推導 readonly（readonly 時按鈕以 v-if 隱藏，非 disabled）。
vi.mock('@/utils/auth', () => ({
    hasPermission: (...a: unknown[]) => hasPermissionMock(...a),
}))

vi.mock('element-plus', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>()
    return { ...actual, ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }
})

const STUBS = {
    'el-card': { template: '<div><slot name="header" /><slot /></div>' },
    'el-tabs': { template: '<div><slot /></div>' },
    'el-tab-pane': { template: '<div />' },
    'el-table': {
        props: ['data'],
        template: '<table class="snap-table"><tr v-for="r in data" :key="r.id"><td>{{ r.classroom_name }}</td><td>{{ r.student_count }}</td></tr></table>',
    },
    'el-table-column': true,
    'el-tag': true,
    'el-empty': true,
    'el-dialog': true,
    'el-form': true,
    'el-form-item': true,
    'el-input': true,
    'el-input-number': true,
    'el-button': {
        props: ['disabled', 'loading'],
        template: '<button :disabled="disabled"><slot /></button>',
    },
}

const snapshotResponse = (rows: unknown[], covered: number[][] = []) => ({
    data: { exists: rows.length > 0, covered_months: covered, rows },
})

const mountPanel = (year = 2026, month = 6) =>
    mount(EnrollmentSnapshotPanel, {
        props: { year, month },
        global: { stubs: STUBS },
    })

describe('EnrollmentSnapshotPanel — 發放月涵蓋月人數快照', () => {
    beforeEach(() => {
        getMock.mockReset()
        generateMock.mockReset()
        patchMock.mockReset()
        confirmMock.mockReset()
        hasPermissionMock.mockReturnValue(true)
    })

    it('以結算月查 covered_months 並逐涵蓋月載入快照列', async () => {
        getMock.mockImplementation((year: number, month: number) => {
            if (month === 6) {
                return Promise.resolve(
                    snapshotResponse([], [[2026, 2], [2026, 3], [2026, 4], [2026, 5]]),
                )
            }
            return Promise.resolve(
                snapshotResponse([
                    {
                        id: month,
                        classroom_id: 1,
                        classroom_name: '天堂鳥',
                        student_count: 24,
                        count_mode: 'month_end',
                        is_confirmed: false,
                        adjust_reason: null,
                    },
                ]),
            )
        })

        const wrapper = mountPanel(2026, 6)
        await flushPromises()

        // 結算月 1 次 + 涵蓋月 4 次
        expect(getMock).toHaveBeenCalledWith(2026, 6)
        expect(getMock).toHaveBeenCalledWith(2026, 2)
        expect(getMock).toHaveBeenCalledWith(2026, 5)
        expect(wrapper.text()).toContain('天堂鳥')
        expect(wrapper.text()).toContain('2月、3月、4月、5月')
    })

    it('產生快照逐涵蓋月呼叫 generate 後重新整理', async () => {
        getMock.mockImplementation((_y: number, month: number) =>
            Promise.resolve(
                month === 6
                    ? snapshotResponse([], [[2026, 2], [2026, 3]])
                    : snapshotResponse([]),
            ),
        )
        generateMock.mockResolvedValue({ data: { generated: 2, changes: [] } })

        const wrapper = mountPanel(2026, 6)
        await flushPromises()
        getMock.mockClear()

        await wrapper.findAll('button')[0].trigger('click')
        await flushPromises()

        expect(generateMock).toHaveBeenCalledTimes(2)
        // 2026-08-20 起後端刻意不提供 force：覆寫已確認月份的唯一途徑是 /reopen。
        expect(generateMock).toHaveBeenCalledWith({ year: 2026, month: 2 })
        expect(generateMock).toHaveBeenCalledWith({ year: 2026, month: 3 })
        expect(getMock).toHaveBeenCalled() // refresh
    })

    it('非發放月（covered_months 空）整個面板不顯示', async () => {
        getMock.mockResolvedValue(snapshotResponse([], []))
        const wrapper = mountPanel(2026, 5)
        await flushPromises()
        expect(wrapper.find('.snap-card').exists()).toBe(false)
    })

    it('沒有 SALARY_WRITE 時看不到寫入按鈕，也不會呼叫寫入 API', async () => {
        hasPermissionMock.mockReturnValue(false)
        getMock.mockImplementation((_y: number, month: number) =>
            Promise.resolve(
                month === 6
                    ? snapshotResponse([], [[2026, 2]])
                    : snapshotResponse([{
                        id: 1,
                        classroom_id: 1,
                        classroom_name: '天堂鳥',
                        student_count: 24,
                        count_mode: 'month_end',
                        is_confirmed: false,
                        adjust_reason: null,
                    }]),
            ),
        )
        const wrapper = mountPanel(2026, 6)
        await flushPromises()
        const writeButtons = wrapper.findAll('button').filter((button) =>
            button.text().includes('產生') || button.text().includes('確認本月'),
        )

        // 薄殼委派的 FestivalHeadcountPanel 以 v-if 隱藏寫入按鈕（非 disabled），
        // 故 readonly 下這批按鈕根本不存在；守衛意圖（不得寫入）不變。
        expect(writeButtons).toHaveLength(0)
        for (const button of wrapper.findAll('button')) await button.trigger('click')
        expect(generateMock).not.toHaveBeenCalled()
        expect(confirmMock).not.toHaveBeenCalled()
        expect(patchMock).not.toHaveBeenCalled()
    })
})
