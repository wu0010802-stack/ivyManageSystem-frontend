import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/activity', () => ({
  getRegistrationTime: vi.fn(),
  updateRegistrationTime: vi.fn(),
  uploadActivityPoster: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn(() => Promise.resolve()) },
}))

import {
  getRegistrationTime,
  updateRegistrationTime,
} from '@/api/activity'
import { ElMessage } from 'element-plus'
import ActivitySettingsView from '../ActivitySettingsView.vue'

const FormItemStub = defineComponent({
  props: { label: { type: String, default: '' } },
  setup(props, { slots }) {
    return () => h('label', {}, [
      h('span', { class: 'field-label' }, props.label),
      slots.default?.(),
    ])
  },
})

const InputStub = defineComponent({
  props: {
    modelValue: { type: [String, Number], default: '' },
    placeholder: { type: String, default: '' },
    type: { type: String, default: 'text' },
    maxlength: { type: [String, Number], default: undefined },
  },
  emits: ['update:modelValue'],
  setup(props) {
    return () => h(
      props.type === 'textarea' ? 'textarea' : 'input',
      {
        'data-placeholder': props.placeholder,
        'data-maxlength': props.maxlength,
        value: props.modelValue,
      },
    )
  },
})

function mountView() {
  return mount(ActivitySettingsView, {
    global: {
      directives: { loading: () => {} },
      stubs: {
        'el-card': { template: '<section><slot /></section>' },
        'el-form': { template: '<form><slot /></form>' },
        'el-form-item': FormItemStub,
        'el-input': InputStub,
        'el-divider': { template: '<h3><slot /></h3>' },
        'el-switch': true,
        'el-date-picker': true,
        'el-upload': { template: '<div><slot /></div>' },
        'el-button': { template: '<button><slot /></button>' },
        'el-alert': true,
      },
    },
  })
}

describe('ActivitySettingsView email templates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRegistrationTime.mockResolvedValue({
      data: {
        is_open: true,
        open_at: '2026-08-01T08:00',
        close_at: '2026-08-31T18:00',
        page_title: '課後才藝',
        registration_success_email_subject: '報名成功：{{student_name}}',
        registration_success_email_body: '{{student_name}} 已完成報名：{{course_list}}',
        waitlist_promoted_email_subject: '候補轉正：{{course_name}}',
        waitlist_promoted_email_body: '請於 {{confirm_deadline}} 前確認：{{edit_url}}',
      },
    })
    updateRegistrationTime.mockResolvedValue({ data: { message: 'ok' } })
  })

  it('載入四個信件模板欄位，並顯示後端支援的 placeholder 提示', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.vm.form.registration_success_email_subject).toBe('報名成功：{{student_name}}')
    expect(wrapper.vm.form.registration_success_email_body).toContain('{{course_list}}')
    expect(wrapper.vm.form.waitlist_promoted_email_subject).toContain('{{course_name}}')
    expect(wrapper.vm.form.waitlist_promoted_email_body).toContain('{{confirm_deadline}}')
    expect(wrapper.text()).toContain('報名成功通知信')
    expect(wrapper.text()).toContain('候補轉正通知信')
    expect(wrapper.text()).toContain('{{student_name}}')
    expect(wrapper.text()).toContain('{{course_name}}')
    const bodies = wrapper.findAll('textarea')
    expect(bodies).toHaveLength(2)
    expect(bodies.every((body) => body.attributes('data-maxlength') === '10000')).toBe(true)
  })

  it('儲存時帶回四個模板欄位，空白模板轉為 null 以使用後端預設內容', async () => {
    const wrapper = mountView()
    await flushPromises()

    wrapper.vm.form.registration_success_email_subject = '  新主旨 {{student_name}}  '
    wrapper.vm.form.registration_success_email_body = '  '
    wrapper.vm.form.waitlist_promoted_email_subject = '  候補 {{course_name}}  '
    wrapper.vm.form.waitlist_promoted_email_body = '  請確認 {{edit_url}}  '
    await wrapper.vm.handleSave()

    expect(updateRegistrationTime).toHaveBeenCalledWith(expect.objectContaining({
      registration_success_email_subject: '新主旨 {{student_name}}',
      registration_success_email_body: null,
      waitlist_promoted_email_subject: '候補 {{course_name}}',
      waitlist_promoted_email_body: '請確認 {{edit_url}}',
    }))
  })

  it('設定載入失敗時禁止把預設空表單存回；重新載入成功後才允許儲存', async () => {
    getRegistrationTime.mockRejectedValueOnce(new Error('network down'))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.vm.settingsLoaded).toBe(false)
    await wrapper.vm.handleSave()
    expect(updateRegistrationTime).not.toHaveBeenCalled()

    getRegistrationTime.mockResolvedValueOnce({
      data: {
        is_open: true,
        registration_success_email_subject: '保留的成功信主旨',
        waitlist_promoted_email_subject: '保留的候補信主旨',
      },
    })
    await wrapper.vm.fetchSettings()
    await wrapper.vm.handleSave()

    expect(wrapper.vm.settingsLoaded).toBe(true)
    expect(updateRegistrationTime).toHaveBeenCalledWith(expect.objectContaining({
      is_open: true,
      registration_success_email_subject: '保留的成功信主旨',
      waitlist_promoted_email_subject: '保留的候補信主旨',
    }))
  })

  it('後端回傳陣列型驗證錯誤時顯示可讀訊息，不把物件陣列直接交給 ElMessage', async () => {
    const wrapper = mountView()
    await flushPromises()
    updateRegistrationTime.mockRejectedValueOnce({
      response: {
        data: {
          detail: [
            { loc: ['body', 'registration_success_email_body'], msg: '信件內文不可超過 10000 字' },
          ],
        },
      },
    })

    await wrapper.vm.handleSave()

    expect(ElMessage.error).toHaveBeenCalledWith('信件內文不可超過 10000 字')
  })
})
