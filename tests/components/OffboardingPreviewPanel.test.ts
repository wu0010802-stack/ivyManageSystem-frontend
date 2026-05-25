import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import OffboardingPreviewPanel from '@/components/offboarding/OffboardingPreviewPanel.vue'
import type { ApiResponse } from '@/api/_generated/typed'

type PreviewType = ApiResponse<'/offboarding/{employee_id}/preview', 'post'>

const buildPreview = (overrides: Partial<PreviewType> = {}): PreviewType => ({
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
            exists: true,
            will_be_marked_stale: true,
        },
        appraisal_in_flight_cycles: [],
    },
    ...overrides,
})

const mountPanel = (preview: PreviewType) =>
    mount(OffboardingPreviewPanel, {
        props: { preview },
        global: { plugins: [ElementPlus] },
    })

describe('OffboardingPreviewPanel', () => {
    it('renders leave snapshot with correct formula', () => {
        const wrapper = mountPanel(buildPreview())
        const text = wrapper.text()
        expect(text).toContain('5 天')
        expect(text).toContain('1,500')
        expect(text).toContain('7,500')
    })

    it('shows danger tag when user account will be revoked', () => {
        const wrapper = mountPanel(buildPreview({
            preview: {
                ...buildPreview().preview,
                user_account_will_be_revoked: true,
            },
        }))
        const tag = wrapper.find('.el-tag')
        expect(tag.exists()).toBe(true)
        expect(tag.text()).toContain('將撤銷')
        expect(tag.classes()).toContain('el-tag--danger')
    })

    it('shows info tag when account is retained during notice period', () => {
        const wrapper = mountPanel(buildPreview({
            preview: {
                ...buildPreview().preview,
                user_account_will_be_revoked: false,
            },
        }))
        const tag = wrapper.find('.el-tag')
        expect(tag.exists()).toBe(true)
        expect(tag.text()).toContain('通知期保留')
        expect(tag.classes()).toContain('el-tag--info')
    })

    it('renders warnings in red when present', () => {
        const wrapper = mountPanel(buildPreview({
            warnings: ['員工有未核假單', '薪資尚未結算'],
        }))
        const warningItems = wrapper.findAll('.warning-text')
        expect(warningItems.length).toBe(2)
        expect(warningItems[0].text()).toContain('員工有未核假單')
        expect(warningItems[1].text()).toContain('薪資尚未結算')
    })

    it('does not render warning box when warnings is empty', () => {
        const wrapper = mountPanel(buildPreview({ warnings: [] }))
        expect(wrapper.find('.warning-box').exists()).toBe(false)
    })
})
