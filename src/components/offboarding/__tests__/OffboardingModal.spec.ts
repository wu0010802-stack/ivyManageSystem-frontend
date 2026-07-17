import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'

vi.mock('@/api/offboarding', () => ({
    previewOffboarding: vi.fn(),
    processOffboarding: vi.fn(),
    getOffboardingDetail: vi.fn(),
    getOffboardingCertificate: vi.fn(),
    patchNhiUnenroll: vi.fn(),
    postMagicLink: vi.fn(),
    deleteMagicLink: vi.fn(),
    closeOffboarding: vi.fn(),
}))

import { previewOffboarding, processOffboarding } from '@/api/offboarding'
import OffboardingModal from '../OffboardingModal.vue'

const mockPreview = previewOffboarding as unknown as ReturnType<typeof vi.fn>
const mockProcess = processOffboarding as unknown as ReturnType<typeof vi.fn>

/** OffboardingPreviewResponse fixture（形狀照 schema.d.ts 契約） */
function previewFixture() {
    return {
        employee_id: 9,
        employee_name: '測試員工',
        resign_date: '2026-07-31',
        preview: {
            user_account_will_be_revoked: true,
            leave_snapshot: { special_leave_days: 3, daily_wage: 1000, payout_amount: 3000 },
            salary_record_target: { year: 2026, month: 7, exists: false, will_be_marked_stale: false },
            appraisal_in_flight_cycles: [],
            certificate_pdf_ready_to_generate: false,
        },
        warnings: [],
    }
}

/** OffboardingProcessResponse fixture */
function processFixture(steps: Array<{ step: string; status: string; error?: string | null }>) {
    return {
        employee_id: 9,
        resign_date: '2026-07-31',
        is_active: false,
        user_account_revoked: true,
        steps: steps.map((s) => ({
            step: s.step,
            status: s.status,
            completed_at: null,
            payload: null,
            error: s.error ?? null,
        })),
        certificate_download_url: null,
    }
}

function mountModal() {
    // el-dialog 預設 append-to-body=false → teleport disabled、內容 render in place，
    // wrapper.find 直接可及，毋需 stub teleport（stub 反而會吞掉 slot 內容）
    return mount(OffboardingModal, {
        props: { modelValue: true, employeeId: 9, employeeName: '測試員工' },
        global: { plugins: [ElementPlus] },
    })
}

/** 走完 input → preview → result（process 首次回傳含失敗步驟） */
async function driveToFailedResult(w: ReturnType<typeof mountModal>) {
    mockPreview.mockResolvedValue({ data: previewFixture() })
    mockProcess.mockResolvedValueOnce({
        data: processFixture([
            { step: 'mark_appraisal', status: 'completed' },
            { step: 'generate_certificate', status: 'failed', error: 'PDF 產生失敗' },
        ]),
    })

    // el-dialog 的 rendered flag 在 mount 後下一個 tick 才開，先 flush 再找內容
    await flushPromises()
    w.findComponent({ name: 'ElDatePicker' }).vm.$emit('update:modelValue', '2026-07-31')
    await flushPromises()
    await w.find('.preview-button').trigger('click')
    await flushPromises()
    await w.find('.confirm-button').trigger('click')
    await flushPromises()
}

describe('OffboardingModal 重試失敗步驟（真重試）', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        setActivePinia(createPinia())
    })

    it('點「重試失敗步驟」→ 直接重呼 process，停留在結果頁原地更新（不跳回預覽）', async () => {
        const w = mountModal()
        await driveToFailedResult(w)

        expect(w.find('.retry-button').exists()).toBe(true)

        // 重試成功：全部步驟 completed
        mockProcess.mockResolvedValueOnce({
            data: processFixture([
                { step: 'mark_appraisal', status: 'completed' },
                { step: 'generate_certificate', status: 'completed' },
            ]),
        })

        await w.find('.retry-button').trigger('click')
        await flushPromises()

        expect(mockProcess).toHaveBeenCalledTimes(2)
        // 原地更新：仍在結果頁（無確認辦理鈕），且全部成功後重試鈕消失
        expect(w.find('.confirm-button').exists()).toBe(false)
        expect(w.find('.retry-button').exists()).toBe(false)
    })

    it('preview 階段有「上一步」，返回 input 後表單值保留（再按預覽帶同一日期）', async () => {
        const w = mountModal()
        mockPreview.mockResolvedValue({ data: previewFixture() })

        await flushPromises()
        w.findComponent({ name: 'ElDatePicker' }).vm.$emit('update:modelValue', '2026-07-31')
        await flushPromises()
        await w.find('.preview-button').trigger('click')
        await flushPromises()

        const backBtn = w.find('.back-button')
        expect(backBtn.exists()).toBe(true)

        await backBtn.trigger('click')
        await flushPromises()

        // 回到 input：預覽鈕存在，且再按預覽帶同一份日期（不需重填）
        expect(w.find('.preview-button').exists()).toBe(true)
        await w.find('.preview-button').trigger('click')
        await flushPromises()
        expect(mockPreview).toHaveBeenCalledTimes(2)
        expect(mockPreview.mock.calls[1][1]).toMatchObject({ resign_date: '2026-07-31' })
    })

    it('已填資料時關閉（X）→ 先跳確認；取消則不關閉、確認才關閉', async () => {
        const { ElMessageBox } = await import('element-plus')
        const confirmSpy = vi.spyOn(ElMessageBox, 'confirm')
        const w = mountModal()
        await flushPromises()
        w.findComponent({ name: 'ElDatePicker' }).vm.$emit('update:modelValue', '2026-07-31')
        await flushPromises()

        // 取消確認 → 不關閉
        confirmSpy.mockRejectedValueOnce('cancel')
        await w.find('.el-dialog__headerbtn').trigger('click')
        await flushPromises()
        expect(confirmSpy).toHaveBeenCalled()
        expect(w.emitted('update:modelValue')).toBeUndefined()

        // 確認 → 關閉
        confirmSpy.mockResolvedValueOnce('confirm')
        await w.find('.el-dialog__headerbtn').trigger('click')
        await flushPromises()
        expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
        confirmSpy.mockRestore()
    })

    it('process 進行中 → X 不可關閉（不彈確認、不 emit）', async () => {
        const { ElMessageBox } = await import('element-plus')
        const confirmSpy = vi.spyOn(ElMessageBox, 'confirm')
        const w = mountModal()
        mockPreview.mockResolvedValue({ data: previewFixture() })
        let resolveProcess!: (v: unknown) => void
        mockProcess.mockReturnValueOnce(new Promise((r) => { resolveProcess = r }))

        await flushPromises()
        w.findComponent({ name: 'ElDatePicker' }).vm.$emit('update:modelValue', '2026-07-31')
        await flushPromises()
        await w.find('.preview-button').trigger('click')
        await flushPromises()
        await w.find('.confirm-button').trigger('click')
        await flushPromises()

        await w.find('.el-dialog__headerbtn').trigger('click')
        await flushPromises()
        expect(confirmSpy).not.toHaveBeenCalled()
        expect(w.emitted('update:modelValue')).toBeUndefined()

        resolveProcess({ data: processFixture([{ step: 'mark_appraisal', status: 'completed' }]) })
        await flushPromises()
        confirmSpy.mockRestore()
    })

    it('initialResignDate 預填既有離職日（待離職者重開不需重填）', async () => {
        mockPreview.mockResolvedValue({ data: previewFixture() })
        const w = mount(OffboardingModal, {
            props: {
                modelValue: true,
                employeeId: 9,
                employeeName: '測試員工',
                initialResignDate: '2026-08-15',
            },
            global: { plugins: [ElementPlus] },
        })
        await flushPromises()

        await w.find('.preview-button').trigger('click')
        await flushPromises()
        expect(mockPreview.mock.calls[0][1]).toMatchObject({ resign_date: '2026-08-15' })
    })

    it('日期範圍防呆：過去 2 年以前與未來 1 年以後不可選', async () => {
        const w = mountModal()
        await flushPromises()
        const disabledDate = w
            .findComponent({ name: 'ElDatePicker' })
            .props('disabledDate') as (d: Date) => boolean
        expect(typeof disabledDate).toBe('function')

        const now = new Date()
        const threeYearsAgo = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate())
        const twoYearsAhead = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate())
        expect(disabledDate(threeYearsAgo)).toBe(true)
        expect(disabledDate(twoYearsAhead)).toBe(true)
        expect(disabledDate(now)).toBe(false)
    })

    it('重試每次都對 process 帶同一份 resign_date payload', async () => {
        const w = mountModal()
        await driveToFailedResult(w)

        mockProcess.mockResolvedValueOnce({
            data: processFixture([{ step: 'generate_certificate', status: 'completed' }]),
        })
        await w.find('.retry-button').trigger('click')
        await flushPromises()

        const calls = mockProcess.mock.calls
        expect(calls).toHaveLength(2)
        expect(calls[1][0]).toBe(9)
        expect(calls[1][1]).toMatchObject({ resign_date: '2026-07-31' })
    })
})
