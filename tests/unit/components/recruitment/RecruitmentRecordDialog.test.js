import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import ElementPlus from 'element-plus'

// stub el-dialog 直接渲染 slot 內容（happy-dom 下 el-dialog 的 teleport 會造成 DOM 不可見）
const ElDialogStub = {
  template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>',
  props: ['modelValue', 'title', 'width'],
  emits: ['update:modelValue'],
}

import RecruitmentRecordDialog from '@/components/recruitment/RecruitmentRecordDialog.vue'

const makeForm = (overrides = {}) =>
  reactive({
    month: '',
    month_raw: null,
    seq_no: '',
    visit_date: '',
    child_name: '測試幼生',
    birthday: null,
    grade: null,
    phone: '',
    address: '高雄市三民區民族一路100號',
    district: '三民區',
    source: '',
    referrer: '',
    deposit_collector: '',
    has_deposit: false,
    enrolled: false,
    transfer_term: false,
    no_deposit_reason: null,
    no_deposit_reason_detail: '',
    notes: '',
    parent_response: '',
    geocoding_consent: false,
    ...overrides,
  })

const factory = (props = {}) => {
  const form = makeForm(props.formOverrides ?? {})
  const wrapper = mount(RecruitmentRecordDialog, {
    props: {
      visible: true,
      mode: 'add',
      form,
      saving: false,
      districtSuggestions: [],
      sourceSuggestions: [],
      referrerSuggestions: [],
      noDepositReasons: [],
      ...props,
    },
    global: {
      plugins: [ElementPlus],
      components: { ElDialog: ElDialogStub },
    },
  })
  return { wrapper, form }
}

describe('RecruitmentRecordDialog — geocoding_consent', () => {
  it('consent checkbox 在 create 模式預設為 false（不勾選）', () => {
    const { form } = factory({ mode: 'add' })
    expect(form.geocoding_consent).toBe(false)
  })

  it('el-alert 在 geocoding_consent=false 時應顯示', () => {
    const { wrapper } = factory({ formOverrides: { geocoding_consent: false } })
    const alert = wrapper.find('.el-alert')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('未勾選同意')
  })

  it('el-alert 在 geocoding_consent=true 時不顯示', async () => {
    const { wrapper, form } = factory({ formOverrides: { geocoding_consent: false } })
    // 模擬勾選
    form.geocoding_consent = true
    await wrapper.vm.$nextTick()
    const alert = wrapper.find('.el-alert')
    expect(alert.exists()).toBe(false)
  })

  it('el-checkbox 存在且 label 含「需明確確認」', () => {
    const { wrapper } = factory()
    const checkbox = wrapper.find('.el-checkbox')
    expect(checkbox.exists()).toBe(true)
    expect(wrapper.text()).toContain('需明確確認')
  })

  it('checkbox 勾選後 form.geocoding_consent 變為 true', async () => {
    const { wrapper, form } = factory({ formOverrides: { geocoding_consent: false } })
    const checkbox = wrapper.find('.el-checkbox__input')
    expect(checkbox.exists()).toBe(true)
    // 直接設定 form（模擬 v-model 雙向綁定）
    form.geocoding_consent = true
    await wrapper.vm.$nextTick()
    expect(form.geocoding_consent).toBe(true)
  })

  it('emit save 時 form 已含 geocoding_consent 欄位', async () => {
    const { wrapper, form } = factory({ formOverrides: { geocoding_consent: true } })
    // 觸發 save
    wrapper.vm.$emit('save')
    await wrapper.vm.$nextTick()
    expect(form.geocoding_consent).toBe(true)
  })

  it('edit 模式：geocoding_consent=true 傳入時 checkbox 應已勾選且無 el-alert', async () => {
    const { wrapper, form } = factory({
      mode: 'edit',
      formOverrides: { geocoding_consent: true },
    })
    await wrapper.vm.$nextTick()
    expect(form.geocoding_consent).toBe(true)
    expect(wrapper.find('.el-alert').exists()).toBe(false)
  })

  it('edit 模式：geocoding_consent=false 傳入時有 el-alert', () => {
    const { wrapper } = factory({
      mode: 'edit',
      formOverrides: { geocoding_consent: false },
    })
    expect(wrapper.find('.el-alert').exists()).toBe(true)
  })
})
