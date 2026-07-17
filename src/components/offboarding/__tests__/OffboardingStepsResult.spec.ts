import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import OffboardingStepsResult from '../OffboardingStepsResult.vue'

function stepsFixture() {
    return [
        { step: 'mark_appraisal', status: 'completed', completed_at: null, payload: null, error: null },
        { step: 'leave_snapshot', status: 'skipped', completed_at: null, payload: { reason: '無特休餘額' }, error: null },
        { step: 'generate_certificate', status: 'failed', completed_at: null, payload: null, error: 'PDF 產生失敗' },
    ]
}

describe('OffboardingStepsResult 無障礙：狀態不得只靠 icon 顏色', () => {
    it('每個步驟有可見的狀態文字（完成／已略過／失敗）', () => {
        const w = mount(OffboardingStepsResult, {
            props: { steps: stepsFixture() },
            global: { plugins: [ElementPlus] },
        })

        const statuses = w.findAll('.step-status')
        expect(statuses).toHaveLength(3)
        expect(statuses[0].text()).toBe('完成')
        expect(statuses[1].text()).toBe('已略過')
        expect(statuses[2].text()).toBe('失敗')
    })

    it('狀態 icon 標記 aria-hidden（語意由文字承載）', () => {
        const w = mount(OffboardingStepsResult, {
            props: { steps: stepsFixture() },
            global: { plugins: [ElementPlus] },
        })

        const icons = w.findAll('.step-icon .el-icon')
        expect(icons.length).toBeGreaterThan(0)
        for (const icon of icons) {
            expect(icon.attributes('aria-hidden')).toBe('true')
        }
    })
})
