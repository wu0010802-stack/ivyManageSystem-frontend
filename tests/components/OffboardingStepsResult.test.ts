import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import OffboardingStepsResult from '@/components/offboarding/OffboardingStepsResult.vue'
import type { ApiResponse } from '@/api/_generated/typed'

type StepResultModel = ApiResponse<'/offboarding/{employee_id}/process', 'post'>['steps'][number]

const allSteps: StepResultModel[] = [
    { step: 'mark_appraisal', status: 'completed', completed_at: '2026-06-30T10:00:00', error: null, payload: null },
    { step: 'leave_snapshot', status: 'completed', completed_at: '2026-06-30T10:00:01', error: null, payload: null },
    { step: 'prefill_salary', status: 'completed', completed_at: '2026-06-30T10:00:02', error: null, payload: null },
    { step: 'revoke_user', status: 'skipped', completed_at: null, error: null, payload: { reason: '非正式帳號，略過撤銷' } },
    { step: 'generate_certificate', status: 'failed', completed_at: null, error: 'PDF 產生失敗：無模板', payload: null },
]

const mountResult = (steps: StepResultModel[]) =>
    mount(OffboardingStepsResult, {
        props: { steps },
        global: { plugins: [ElementPlus] },
    })

describe('OffboardingStepsResult', () => {
    it('renders 5 step items', () => {
        const wrapper = mountResult(allSteps)
        expect(wrapper.findAll('.step-item').length).toBe(5)
    })

    it('shows green check icon for completed steps', () => {
        const wrapper = mountResult(allSteps)
        const completedItems = wrapper.findAll('.status-completed')
        expect(completedItems.length).toBe(3)
    })

    it('shows yellow minus icon for skipped step', () => {
        const wrapper = mountResult(allSteps)
        const skippedItems = wrapper.findAll('.status-skipped')
        expect(skippedItems.length).toBe(1)
        expect(skippedItems[0].text()).toContain('非正式帳號，略過撤銷')
    })

    it('shows red close icon and error message for failed step', () => {
        const wrapper = mountResult(allSteps)
        const failedItems = wrapper.findAll('.status-failed')
        expect(failedItems.length).toBe(1)
        expect(failedItems[0].text()).toContain('PDF 產生失敗：無模板')
    })

    it('emits retry event when retry button is clicked', async () => {
        const wrapper = mountResult(allSteps)
        const retryBtn = wrapper.find('.retry-button')
        expect(retryBtn.exists()).toBe(true)
        await retryBtn.trigger('click')
        expect(wrapper.emitted('retry')).toBeTruthy()
        expect(wrapper.emitted('retry')!.length).toBe(1)
    })

    it('does not show retry button when all steps are completed', () => {
        const successSteps: StepResultModel[] = allSteps.map((s) => ({
            ...s,
            status: 'completed' as const,
            error: null,
        }))
        const wrapper = mountResult(successSteps)
        expect(wrapper.find('.retry-button').exists()).toBe(false)
    })
})
