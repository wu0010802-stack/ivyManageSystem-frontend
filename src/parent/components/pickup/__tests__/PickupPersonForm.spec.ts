import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import PickupPersonForm from '../PickupPersonForm.vue'

function emptyForm() {
  return { personName: '', personRelation: '', personPhone: '', note: '', photoFile: null }
}

describe('PickupPersonForm', () => {
  it('emits update:modelValue with full object on field input', async () => {
    const wrapper = mount(PickupPersonForm, {
      props: { modelValue: emptyForm() },
    })
    const nameInput = wrapper.find('#pickup-person-name')
    await nameInput.setValue('王阿嬤')

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const lastEvent = emitted![emitted!.length - 1][0] as Record<string, unknown>
    expect(lastEvent.personName).toBe('王阿嬤')
    // 整包物件 emit，不遺漏其他欄位
    expect(lastEvent).toHaveProperty('personRelation')
    expect(lastEvent).toHaveProperty('personPhone')
  })

  it('disables submit button when required fields are missing', () => {
    const wrapper = mount(PickupPersonForm, {
      props: { modelValue: emptyForm() },
    })
    const submitBtn = wrapper.find('.primary-btn')
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables submit button once name/relation/phone all filled', () => {
    const wrapper = mount(PickupPersonForm, {
      props: {
        modelValue: {
          personName: '王阿嬤',
          personRelation: '祖母',
          personPhone: '0912345678',
          note: '',
          photoFile: null,
        },
      },
    })
    const submitBtn = wrapper.find('.primary-btn')
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(false)
  })

  it('emits submit when submit button clicked and enabled', async () => {
    const wrapper = mount(PickupPersonForm, {
      props: {
        modelValue: {
          personName: '王阿嬤',
          personRelation: '祖母',
          personPhone: '0912345678',
          note: '',
          photoFile: null,
        },
      },
    })
    await wrapper.find('.primary-btn').trigger('click')
    expect(wrapper.emitted('submit')).toBeTruthy()
  })

  it('emits cancel when cancel button clicked', async () => {
    const wrapper = mount(PickupPersonForm, { props: { modelValue: emptyForm() } })
    await wrapper.find('.secondary-btn').trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })

  it('clears file input value after selecting a file (allows reselecting same file)', async () => {
    const wrapper = mount(PickupPersonForm, { props: { modelValue: emptyForm() } })
    const fileInput = wrapper.find('#pickup-person-photo')
      .element as HTMLInputElement
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    await wrapper.find('#pickup-person-photo').trigger('change')

    const emitted = wrapper.emitted('update:modelValue')
    const lastEvent = emitted![emitted!.length - 1][0] as { photoFile: File | null }
    expect(lastEvent.photoFile).toBe(file)
  })
})
