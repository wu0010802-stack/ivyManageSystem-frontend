import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import OffboardingPreviewPanel from '../OffboardingPreviewPanel.vue'

function previewFixture(overrides: Record<string, unknown> = {}) {
    return {
        employee_id: 9,
        employee_name: '測試員工',
        resign_date: '2026-07-31',
        preview: {
            user_account_will_be_revoked: true,
            leave_snapshot: { special_leave_days: 3, daily_wage: 1000, payout_amount: 3000 },
            salary_record_target: { year: 2026, month: 7, exists: true, will_be_marked_stale: true },
            appraisal_in_flight_cycles: [],
            certificate_pdf_ready_to_generate: false,
            ...(overrides.preview as Record<string, unknown> | undefined),
        },
        warnings: [],
        ...overrides,
    }
}

describe('OffboardingPreviewPanel 術語（不得對行政露出工程詞）', () => {
    it('薪資將標記重算的提示不使用「stale」字樣', () => {
        const w = mount(OffboardingPreviewPanel, {
            props: { preview: previewFixture() },
            global: { plugins: [ElementPlus] },
        })

        expect(w.text()).not.toContain('stale')
        expect(w.text()).toContain('需重算')
    })
})
