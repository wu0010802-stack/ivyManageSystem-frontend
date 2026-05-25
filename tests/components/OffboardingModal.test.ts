import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import OffboardingModal from '@/components/offboarding/OffboardingModal.vue'
import type { ApiResponse } from '@/api/_generated/typed'

type PreviewType = ApiResponse<'/offboarding/{employee_id}/preview', 'post'>
type ProcessType = ApiResponse<'/offboarding/{employee_id}/process', 'post'>

// stub ElDialog：把 slot content 原地渲染
const ElDialogStub = {
    template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title'],
}

vi.mock('@/api/offboarding', () => ({
    previewOffboarding: vi.fn(),
    processOffboarding: vi.fn(),
    getOffboardingDetail: vi.fn(),
    getOffboardingCertificate: vi.fn(),
    patchNhiUnenroll: vi.fn(),
    postMagicLink: vi.fn(),
    deleteMagicLink: vi.fn(),
}))

import * as offboardingApi from '@/api/offboarding'

const stubPreview: PreviewType = {
    employee_id: 1,
    employee_name: '王小明',
    resign_date: '2026-06-30',
    warnings: [],
    preview: {
        user_account_will_be_revoked: true,
        certificate_pdf_ready_to_generate: true,
        leave_snapshot: {
            special_leave_days: 5,
            daily_wage: 1500,
            payout_amount: 7500,
        },
        salary_record_target: {
            year: 2026,
            month: 6,
            exists: false,
            will_be_marked_stale: false,
        },
        appraisal_in_flight_cycles: [],
    },
}

const stubProcess: ProcessType = {
    employee_id: 1,
    employee_name: '王小明',
    resign_date: '2026-06-30',
    processed_at: '2026-06-30T10:00:00',
    steps: [
        { step: 'mark_appraisal', status: 'completed', completed_at: '2026-06-30T10:00:00', error: null, payload: null },
        { step: 'leave_snapshot', status: 'completed', completed_at: '2026-06-30T10:00:01', error: null, payload: null },
        { step: 'prefill_salary', status: 'completed', completed_at: '2026-06-30T10:00:02', error: null, payload: null },
        { step: 'revoke_user', status: 'completed', completed_at: '2026-06-30T10:00:03', error: null, payload: null },
        { step: 'generate_certificate', status: 'completed', completed_at: '2026-06-30T10:00:04', error: null, payload: null },
    ],
}

const mountModal = (modelValue = true) =>
    mount(OffboardingModal, {
        props: {
            modelValue,
            employeeId: 1,
            employeeName: '王小明',
        },
        global: {
            plugins: [ElementPlus, createPinia()],
            stubs: {
                ElDialog: ElDialogStub,
            },
        },
    })

describe('OffboardingModal', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.clearAllMocks()
    })

    it('previews when resign_date is filled and .preview-button is clicked', async () => {
        ;(offboardingApi.previewOffboarding as ReturnType<typeof vi.fn>).mockResolvedValue({
            data: stubPreview,
        })

        const wrapper = mountModal()

        // 填寫離職日期（直接設 v-model value）
        const datePicker = wrapper.findComponent({ name: 'ElDatePicker' })
        await datePicker.setValue('2026-06-30')

        // 點預覽按鈕
        const previewBtn = wrapper.find('.preview-button')
        expect(previewBtn.exists()).toBe(true)
        await previewBtn.trigger('click')

        // 等 async 完成
        await vi.waitUntil(() =>
            offboardingApi.previewOffboarding as ReturnType<typeof vi.fn>
                ? (offboardingApi.previewOffboarding as ReturnType<typeof vi.fn>).mock.calls.length > 0
                : false,
        )

        expect(offboardingApi.previewOffboarding).toHaveBeenCalledWith(
            1,
            expect.objectContaining({ resign_date: '2026-06-30' }),
        )

        // 應進到 preview stage（顯示 OffboardingPreviewPanel）
        await wrapper.vm.$nextTick()
        expect(wrapper.findComponent({ name: 'OffboardingPreviewPanel' }).exists()).toBe(true)
    })

    it('processes after confirm click and emits success', async () => {
        ;(offboardingApi.previewOffboarding as ReturnType<typeof vi.fn>).mockResolvedValue({
            data: stubPreview,
        })
        ;(offboardingApi.processOffboarding as ReturnType<typeof vi.fn>).mockResolvedValue({
            data: stubProcess,
        })

        const wrapper = mountModal()

        // 填寫離職日期並進到 preview stage
        const datePicker = wrapper.findComponent({ name: 'ElDatePicker' })
        await datePicker.setValue('2026-06-30')

        const previewBtn = wrapper.find('.preview-button')
        await previewBtn.trigger('click')
        await vi.waitUntil(() =>
            (offboardingApi.previewOffboarding as ReturnType<typeof vi.fn>).mock.calls.length > 0,
        )
        await wrapper.vm.$nextTick()

        // 應看到確認辦理按鈕
        const confirmBtn = wrapper.find('.confirm-button')
        expect(confirmBtn.exists()).toBe(true)
        await confirmBtn.trigger('click')

        await vi.waitUntil(() =>
            (offboardingApi.processOffboarding as ReturnType<typeof vi.fn>).mock.calls.length > 0,
        )
        await wrapper.vm.$nextTick()

        // 應 emit success 並帶 process result
        const emitted = wrapper.emitted('success')
        expect(emitted).toBeTruthy()
        expect(emitted![0][0]).toEqual(stubProcess)
    })

    it('renders steps result after process', async () => {
        ;(offboardingApi.previewOffboarding as ReturnType<typeof vi.fn>).mockResolvedValue({
            data: stubPreview,
        })
        ;(offboardingApi.processOffboarding as ReturnType<typeof vi.fn>).mockResolvedValue({
            data: stubProcess,
        })

        const wrapper = mountModal()

        // 填寫離職日期並進到 preview stage
        const datePicker = wrapper.findComponent({ name: 'ElDatePicker' })
        await datePicker.setValue('2026-06-30')

        const previewBtn = wrapper.find('.preview-button')
        await previewBtn.trigger('click')
        await vi.waitUntil(() =>
            (offboardingApi.previewOffboarding as ReturnType<typeof vi.fn>).mock.calls.length > 0,
        )
        await wrapper.vm.$nextTick()

        const confirmBtn = wrapper.find('.confirm-button')
        await confirmBtn.trigger('click')
        await vi.waitUntil(() =>
            (offboardingApi.processOffboarding as ReturnType<typeof vi.fn>).mock.calls.length > 0,
        )
        await wrapper.vm.$nextTick()

        // 應進到 result stage 並顯示 OffboardingStepsResult
        expect(wrapper.findComponent({ name: 'OffboardingStepsResult' }).exists()).toBe(true)
    })
})
