import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, reactive } from 'vue'
import ElementPlus from 'element-plus'
import EmployeeFormSalary from '@/components/employee/EmployeeFormSalary.vue'

// 義華 2026-10-27：「目前就讀幼保相關科系」放在薪資 tab 的進階特殊狀況（與不投保同類的布林旗標）。
const SwitchStub = defineComponent({
  props: { modelValue: Boolean, disabled: Boolean },
  emits: ['update:modelValue'],
  setup(props, { emit, attrs }) {
    return () =>
      h('input', {
        type: 'checkbox',
        ...attrs,
        checked: props.modelValue,
        disabled: props.disabled,
        onChange: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).checked),
      })
  },
})

function mountForm(form: Record<string, unknown>, props: Record<string, unknown> = {}) {
  return mount(EmployeeFormSalary, {
    global: {
      plugins: [ElementPlus],
      stubs: { 'el-input-number': true, 'el-tooltip': { template: '<span><slot /></span>' }, 'el-switch': SwitchStub },
    },
    props: { form, ...props },
  })
}

describe('EmployeeFormSalary — 目前就讀幼保相關科系', () => {
  it('進階特殊狀況裡有這個旗標，並說明只在獎金設定開啟規則時才影響節慶', () => {
    const wrapper = mountForm(reactive({ ece_program_enrolled: false }))

    expect(wrapper.find('[data-test="ece-program-enrolled"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('目前就讀幼保相關科系')
    expect(wrapper.text()).toContain('C 級滿二年且就讀幼保比照 B 級')
  })

  it('勾選會寫回 form.ece_program_enrolled', async () => {
    const form = reactive({ ece_program_enrolled: false })
    const wrapper = mountForm(form)

    await wrapper.find('[data-test="ece-program-enrolled"]').setValue(true)

    expect(form.ece_program_enrolled).toBe(true)
  })

  it('已勾選時顯示為勾選；唯讀（本人或無薪資寫入權）時不可改', () => {
    const wrapper = mountForm(reactive({ ece_program_enrolled: true }), { isReadonly: true })
    const box = wrapper.find('[data-test="ece-program-enrolled"]').element as HTMLInputElement

    expect(box.checked).toBe(true)
    expect(box.disabled).toBe(true)
  })

  it('可編輯時不是 disabled', () => {
    const wrapper = mountForm(reactive({ ece_program_enrolled: false }))

    expect((wrapper.find('[data-test="ece-program-enrolled"]').element as HTMLInputElement).disabled).toBe(false)
  })
})
