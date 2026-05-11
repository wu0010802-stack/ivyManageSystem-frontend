import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PortalPunchCorrectionForm from '@/components/portal/PortalPunchCorrectionForm.vue'

const globalStubs = {
    'el-icon': true,
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
    'el-select': true,
    'el-option': true,
    'el-input': true,
}

const mountForm = () => mount(PortalPunchCorrectionForm, {
    global: { stubs: globalStubs },
})

describe('PortalPunchCorrectionForm', () => {
    it('mounts with default correction_type=punch_out', () => {
        const wrapper = mountForm()
        expect(wrapper.exists()).toBe(true)
        expect(wrapper.vm.form.correction_type).toBe('punch_out')
    })

    it('emits cancel when cancel button clicked', async () => {
        const wrapper = mountForm()
        const cancelBtn = wrapper.findAll('button').find((b) => b.text().includes('取消'))
        await cancelBtn.trigger('click')
        expect(wrapper.emitted('cancel')).toBeTruthy()
    })

    it('emits submit with constructed payload', async () => {
        const wrapper = mountForm()
        const vm = wrapper.vm
        vm.form.attendance_date = '2026-05-10'
        vm.form.correction_type = 'punch_out'
        vm.form.requested_punch_out_time = '18:30'
        vm.form.reason = '會議延遲'

        await wrapper.vm.$nextTick()
        await wrapper.find('button.submit-btn').trigger('click')
        await new Promise((r) => setTimeout(r, 50))

        const emitted = wrapper.emitted('submit')
        expect(emitted).toBeTruthy()
        expect(emitted[0][0]).toMatchObject({
            attendance_date: '2026-05-10',
            correction_type: 'punch_out',
            requested_punch_out: '2026-05-10T18:30:00',
            requested_punch_in: null,
            reason: '會議延遲',
        })
    })
})
