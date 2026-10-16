import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PortalOvertimeForm from '@/components/portal/PortalOvertimeForm.vue'

vi.mock('@/api/portal', () => ({
    getMyWorkdayHours: vi.fn(() => Promise.resolve({ data: { breakdown: [] } })),
}))

const globalStubs = {
    'el-icon': true,
    'el-popconfirm': true,
    'el-button': {
        template: '<button v-bind="$attrs" :class="$attrs.class" @click="$emit(\'click\')"><slot /></button>',
        emits: ['click'],
        inheritAttrs: false,
    },
    'el-form': {
        template: '<form><slot /></form>',
        methods: {
            validate: () => Promise.resolve(true),
            clearValidate: () => {},
            resetFields: () => {},
        },
    },
    'el-form-item': { template: '<div><slot /></div>' },
    'el-date-picker': true,
    'el-time-picker': true,
    'el-input-number': true,
    'el-input': true,
    'el-switch': true,
    'el-tag': { template: '<span><slot /></span>' },
}

const mountForm = () => mount(PortalOvertimeForm, {
    global: { stubs: globalStubs },
})

describe('PortalOvertimeForm', () => {
    beforeEach(() => vi.clearAllMocks())

    it('mounts with default form state', () => {
        const wrapper = mountForm()
        expect(wrapper.exists()).toBe(true)
        expect(wrapper.html()).toContain('overtime-form')
    })

    it('時數由起迄時間無條件捨去到 0.5h，不得超出實際時段（教師端深度掃描 F2）', async () => {
        const wrapper = mountForm()
        const vm = wrapper.vm
        vm.form.start_time = '18:00'
        vm.form.end_time = '18:45'
        await wrapper.vm.$nextTick()
        // 45 分鐘：舊版四捨五入成 1h（超報 15 分鐘）；後端現在也會拒絕 hours > 時段差
        expect(vm.form.hours).toBe(0.5)
        vm.form.end_time = '19:15'
        await wrapper.vm.$nextTick()
        expect(vm.form.hours).toBe(1)
        vm.form.end_time = '19:29'
        await wrapper.vm.$nextTick()
        expect(vm.form.hours).toBe(1)
    })

    it('emits cancel when cancel button clicked', async () => {
        const wrapper = mountForm()
        const cancelBtn = wrapper.findAll('button').find((b) => b.text().includes('取消'))
        await cancelBtn.trigger('click')
        expect(wrapper.emitted('cancel')).toBeTruthy()
    })

    it('emits submit with payload when valid', async () => {
        const wrapper = mountForm()
        const vm = wrapper.vm
        vm.form.overtime_date = '2026-05-12'
        vm.form.start_time = '18:00'
        vm.form.end_time = '20:00'
        vm.form.hours = 2
        vm.form.reason = '專案趕工'

        await wrapper.vm.$nextTick()
        await wrapper.find('button.submit-btn').trigger('click')
        await new Promise((r) => setTimeout(r, 50)) // 等 validate
        const submits = wrapper.emitted('submit')
        expect(submits).toBeTruthy()
        expect(submits[0][0]).toMatchObject({
            overtime_date: '2026-05-12',
            hours: 2,
            reason: '專案趕工',
        })
    })
})
