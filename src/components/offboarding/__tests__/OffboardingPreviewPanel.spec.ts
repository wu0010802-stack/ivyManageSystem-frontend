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

describe('OffboardingPreviewPanel 缺特休配額（後端 quota_missing，2026-10-28）', () => {
    const mountWith = (quotaMissing: boolean) => {
        const fixture = previewFixture()
        fixture.preview.leave_snapshot = {
            special_leave_days: 3,
            daily_wage: 1000,
            payout_amount: 3000,
            quota_missing: quotaMissing,
        } as typeof fixture.preview.leave_snapshot
        return mount(OffboardingPreviewPanel, {
            props: { preview: fixture as never },
            global: { plugins: [ElementPlus] },
        })
    }

    it('quota_missing=true → 提示依到職日法定天數計算、建議先初始化配額', () => {
        const text = mountWith(true).find('[data-test="leave-quota-missing"]').text()
        expect(text).toContain('此員工未建特休配額，已依到職日按法定天數計算，建議先初始化配額')
    })

    it('quota_missing=false → 不提示', () => {
        expect(mountWith(false).find('[data-test="leave-quota-missing"]').exists()).toBe(false)
    })
})
