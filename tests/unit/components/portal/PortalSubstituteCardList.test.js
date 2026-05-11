import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PortalSubstituteCardList from '@/components/portal/PortalSubstituteCardList.vue'

const sampleRequests = [
    {
        id: 1,
        requester_name: '王老師',
        leave_type_label: '事假',
        start_date: '2026-05-12',
        end_date: '2026-05-12',
        leave_hours: 4,
        reason: '臨時家中事務',
        substitute_status: 'pending',
        created_at: '2026-05-11T08:00:00',
    },
    {
        id: 2,
        requester_name: '李老師',
        leave_type_label: '病假',
        start_date: '2026-05-15',
        end_date: '2026-05-15',
        leave_hours: 8,
        reason: '感冒',
        substitute_status: 'accepted',
        created_at: '2026-05-10T08:00:00',
    },
]

describe('PortalSubstituteCardList', () => {
    it('renders one card per request', () => {
        const wrapper = mount(PortalSubstituteCardList, {
            props: { requests: sampleRequests, respondLoading: false },
        })
        expect(wrapper.findAll('[data-test="substitute-card"]')).toHaveLength(2)
    })

    it('shows requester name, leave type, hours, and reason', () => {
        const wrapper = mount(PortalSubstituteCardList, {
            props: { requests: sampleRequests, respondLoading: false },
        })
        const text = wrapper.text()
        expect(text).toContain('王老師')
        expect(text).toContain('事假')
        expect(text).toContain('4')
        expect(text).toContain('臨時家中事務')
    })

    it('renders accept/reject buttons only for pending status', () => {
        const wrapper = mount(PortalSubstituteCardList, {
            props: { requests: sampleRequests, respondLoading: false },
        })
        const cards = wrapper.findAll('[data-test="substitute-card"]')
        expect(cards[0].find('[data-test="accept-btn"]').exists()).toBe(true)
        expect(cards[0].find('[data-test="reject-btn"]').exists()).toBe(true)
        expect(cards[1].find('[data-test="accept-btn"]').exists()).toBe(false)
        expect(cards[1].find('[data-test="reject-btn"]').exists()).toBe(false)
    })

    it('emits respond event with leaveId and action when accept clicked', async () => {
        const wrapper = mount(PortalSubstituteCardList, {
            props: { requests: sampleRequests, respondLoading: false },
        })
        await wrapper.find('[data-test="accept-btn"]').trigger('click')
        const emitted = wrapper.emitted('respond')
        expect(emitted).toBeTruthy()
        expect(emitted[0]).toEqual([1, 'accept'])
    })

    it('emits respond event with reject action', async () => {
        const wrapper = mount(PortalSubstituteCardList, {
            props: { requests: sampleRequests, respondLoading: false },
        })
        await wrapper.find('[data-test="reject-btn"]').trigger('click')
        expect(wrapper.emitted('respond')[0]).toEqual([1, 'reject'])
    })
})
