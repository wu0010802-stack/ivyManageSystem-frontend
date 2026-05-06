import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ScheduleSwapDialog from '@/views/portal/components/schedule/ScheduleSwapDialog.vue'

const CANDIDATES = [
  { employee_id: 5, name: '王老師', shift_name: '早班', work_start: '08:00', work_end: '16:00', has_pending_swap: false },
  { employee_id: 6, name: '李老師', shift_name: '正班', work_start: null, work_end: null, has_pending_swap: true },
]

const STUBS = {
  TeacherBottomSheet: {
    template: '<div data-test="sheet" :data-visible="modelValue"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title', 'snapPoints', 'defaultSnap'],
    emits: ['update:modelValue'],
  },
  ElDialog: {
    template: '<div data-test="dialog" :data-visible="modelValue"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title', 'width'],
    emits: ['update:modelValue'],
  },
  ElForm: { template: '<form><slot /></form>', props: ['labelWidth'] },
  ElFormItem: { template: '<div><slot /></div>', props: ['label'] },
  ElDatePicker: {
    template: '<input data-test="date-picker" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value); $emit(\'change\', $event.target.value)" />',
    props: ['modelValue', 'type', 'placeholder', 'valueFormat', 'disabledDate'],
    emits: ['update:modelValue', 'change'],
  },
  ElSelect: {
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', parseInt($event.target.value) || $event.target.value)"><slot /></select>',
    props: ['modelValue', 'placeholder', 'loading', 'disabled'],
    emits: ['update:modelValue'],
  },
  ElOption: {
    template: '<option :value="value" :disabled="disabled">{{ label }}</option>',
    props: ['value', 'label', 'disabled'],
  },
  ElInput: {
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue', 'type', 'rows', 'placeholder'],
    emits: ['update:modelValue'],
  },
  ElButton: {
    template: '<button :disabled="disabled" :data-loading="loading" @click="$emit(\'click\')"><slot /></button>',
    props: ['disabled', 'loading', 'type', 'size'],
    emits: ['click'],
  },
}

describe('ScheduleSwapDialog', () => {
  it('renders TeacherBottomSheet on mobile', () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: true,
        isMobile: true,
        initialDate: '2026-05-10',
        candidates: CANDIDATES,
        loading: false,
      },
      global: { stubs: STUBS },
    })
    expect(w.find('[data-test="sheet"]').exists()).toBe(true)
    expect(w.find('[data-test="dialog"]').exists()).toBe(false)
  })

  it('renders el-dialog on desktop', () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: true,
        isMobile: false,
        initialDate: '2026-05-10',
        candidates: CANDIDATES,
        loading: false,
      },
      global: { stubs: STUBS },
    })
    expect(w.find('[data-test="dialog"]').exists()).toBe(true)
    expect(w.find('[data-test="sheet"]').exists()).toBe(false)
  })

  it('initialises form.date from initialDate prop when opened', async () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: true,
        isMobile: false,
        initialDate: '2026-05-10',
        candidates: CANDIDATES,
        loading: false,
      },
      global: { stubs: STUBS },
    })
    await w.vm.$nextTick()
    const datePicker = w.find('[data-test="date-picker"]')
    expect(datePicker.element.value).toBe('2026-05-10')
  })

  it('submit button is disabled when no candidate selected', () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: true,
        isMobile: false,
        initialDate: '2026-05-10',
        candidates: CANDIDATES,
        loading: false,
      },
      global: { stubs: STUBS },
    })
    const submitBtn = w.findAll('button').find((b) => b.text().includes('送出'))
    expect(submitBtn.attributes('disabled')).toBeDefined()
  })

  it('emits submit with correct payload when candidate selected and submit clicked', async () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: true,
        isMobile: false,
        initialDate: '2026-05-10',
        candidates: CANDIDATES,
        loading: false,
      },
      global: { stubs: STUBS },
    })
    await w.vm.$nextTick()
    // Directly update form.target_id on the component instance
    w.vm.form.target_id = 5
    await w.vm.$nextTick()
    // Now submit should be enabled
    const submitBtn = w.findAll('button').find((b) => b.text().includes('送出'))
    expect(submitBtn).toBeDefined()
    await submitBtn.trigger('click')
    expect(w.emitted('submit')).toHaveLength(1)
    expect(w.emitted('submit')[0][0]).toEqual({
      swap_date: '2026-05-10',
      target_id: 5,
      reason: '',
    })
  })

  it('emits update:modelValue false when cancel clicked', async () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: true,
        isMobile: false,
        initialDate: '2026-05-10',
        candidates: CANDIDATES,
        loading: false,
      },
      global: { stubs: STUBS },
    })
    const cancelBtn = w.findAll('button').find((b) => b.text() === '取消')
    await cancelBtn.trigger('click')
    expect(w.emitted('update:modelValue')).toBeDefined()
    expect(w.emitted('update:modelValue')[0]).toEqual([false])
  })

  it('emits date-change when date picker changes', async () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: true,
        isMobile: false,
        initialDate: '',
        candidates: [],
        loading: false,
      },
      global: { stubs: STUBS },
    })
    // Directly call the onDateChange method exposed on the component instance
    w.vm.onDateChange('2026-05-20')
    await w.vm.$nextTick()
    expect(w.emitted('date-change')).toBeDefined()
    expect(w.emitted('date-change')[0]).toEqual(['2026-05-20'])
  })

  it('resets form when dialog reopens', async () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: false,
        isMobile: false,
        initialDate: '2026-05-10',
        candidates: CANDIDATES,
        loading: false,
      },
      global: { stubs: STUBS },
    })
    // Select a candidate first (form won't show since modelValue=false, but we can set props)
    // Open dialog
    await w.setProps({ modelValue: true })
    // date should be reset to initialDate
    const datePicker = w.find('[data-test="date-picker"]')
    expect(datePicker.element.value).toBe('2026-05-10')
    // Submit should still be disabled (no target_id)
    const submitBtn = w.findAll('button').find((b) => b.text().includes('送出'))
    expect(submitBtn.attributes('disabled')).toBeDefined()
  })

  it('does not emit submit when date is empty', async () => {
    const w = mount(ScheduleSwapDialog, {
      props: {
        modelValue: true,
        isMobile: false,
        initialDate: '',
        candidates: CANDIDATES,
        loading: false,
      },
      global: { stubs: STUBS },
    })
    await w.vm.$nextTick()
    // Set candidate only, no date
    w.vm.form.target_id = 5
    // Explicitly ensure date remains empty
    w.vm.form.date = ''
    await w.vm.$nextTick()
    const submitBtn = w.findAll('button').find((b) => b.text().includes('送出'))
    // disabled because date is empty
    expect(submitBtn.attributes('disabled')).toBeDefined()
  })
})
