import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import EnrollmentSnapshotPanel from '../EnrollmentSnapshotPanel.vue'

const getMock = vi.fn()
const generateMock = vi.fn()
const patchMock = vi.fn()
const confirmMock = vi.fn()

vi.mock('@/api/salary', () => ({
    getEnrollmentSnapshot: (...a: unknown[]) => getMock(...a),
    generateEnrollmentSnapshot: (...a: unknown[]) => generateMock(...a),
    patchEnrollmentSnapshot: (...a: unknown[]) => patchMock(...a),
    confirmEnrollmentSnapshot: (...a: unknown[]) => confirmMock(...a),
}))

// 2026-08-21：薄殼改為依 SALARY_WRITE 推導 readonly（rev-parity：只持 SALARY_READ
// 者不該看到產生／確認／重開按鈕）。本 spec 未登入，需顯式 mock 成有寫入權，
// 才能維持原本「點第一顆按鈕＝產生」的斷言。
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

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
    'el-button': { template: '<button><slot /></button>' },
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
})
