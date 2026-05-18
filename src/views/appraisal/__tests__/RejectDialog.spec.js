import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// ── API mocks ─────────────────────────────────────────────
vi.mock('@/api/appraisal', () => ({
  rejectSummary: vi.fn().mockResolvedValue({ data: {} }),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import { rejectSummary } from '@/api/appraisal'
import { ElMessage } from 'element-plus'
import RejectDialog from '../components/RejectDialog.vue'

// ── Element Plus stubs ────────────────────────────────────
const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  props: ['disabled', 'loading', 'type'],
  inheritAttrs: false,
  setup(props, { attrs, emit, slots }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () => h(
      'button',
      {
        ...dataAttrs,
        ...(props.disabled ? { disabled: 'disabled' } : {}),
        onClick: () => emit('click'),
      },
      slots.default?.(),
    )
  },
})

const ElDialogStub = defineComponent({
  name: 'ElDialogStub',
  props: ['modelValue'],
  inheritAttrs: false,
  setup(props, { attrs, slots }) {
    return () =>
      props.modelValue
        ? h(
            'div',
            { class: 'el-dialog-stub', ...attrs },
            [slots.default?.(), slots.footer?.()].filter(Boolean),
          )
        : null
  },
})

const ElInputStub = defineComponent({
  name: 'ElInputStub',
  props: ['modelValue'],
  inheritAttrs: false,
  setup(props, { attrs, emit }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () =>
      h('textarea', {
        ...dataAttrs,
        value: props.modelValue,
        onInput: (e) => emit('update:modelValue', e.target.value),
      })
  },
})

const ElRadioGroupStub = defineComponent({
  name: 'ElRadioGroupStub',
  props: ['modelValue'],
  inheritAttrs: false,
  setup(props, { attrs, emit, slots }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () =>
      h(
        'div',
        {
          ...dataAttrs,
          onChange: (e) => emit('update:modelValue', e.target.value),
        },
        slots.default?.(),
      )
  },
})

const ElRadioStub = defineComponent({
  name: 'ElRadioStub',
  props: ['value'],
  setup(props, { slots }) {
    return () =>
      h(
        'label',
        { 'data-test': `radio-${props.value}` },
        [
          h('input', { type: 'radio', value: props.value }),
          slots.default?.(),
        ],
      )
  },
})

const ElTagStub = defineComponent({
  name: 'ElTagStub',
  setup(_, { slots }) {
    return () => h('span', { class: 'el-tag-stub' }, slots.default?.())
  },
})

const GLOBAL_STUBS = {
  'el-button': ElButtonStub,
  'el-dialog': ElDialogStub,
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot /></label>' },
  'el-input': ElInputStub,
  'el-radio-group': ElRadioGroupStub,
  'el-radio': ElRadioStub,
  'el-tag': ElTagStub,
}

function mountDialog(props = {}) {
  return mount(RejectDialog, {
    props: {
      visible: true,
      summary: { id: 7, status: 'SUPERVISOR_SIGNED', employee_name: '王小明' },
      ...props,
    },
    global: { stubs: GLOBAL_STUBS },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  rejectSummary.mockResolvedValue({ data: {} })
})

describe('RejectDialog', () => {
  it('visible=true 時 reset reason 並預設第一個 to_status（SUPERVISOR_SIGNED→DRAFT）', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    expect(wrapper.vm.reason).toBe('')
    expect(wrapper.vm.toStatus).toBe('DRAFT')
  })

  // P1-10：reason 字數驗證委派後端；前端不再 block 短字串。
  // 測試 reason 為短字串時仍會呼叫 API（由後端 422 驗證並回 detail）。
  it('reason 短字串時仍會呼叫 API（驗證委派後端）', async () => {
    rejectSummary.mockResolvedValueOnce({ data: {} })
    const wrapper = mountDialog()
    await flushPromises()
    await wrapper.find('[data-test="reason-input"]').setValue('太短')
    await flushPromises()
    await wrapper.find('[data-test="submit-btn"]').trigger('click')
    await flushPromises()

    expect(rejectSummary).toHaveBeenCalledTimes(1)
    expect(rejectSummary).toHaveBeenCalledWith(7, {
      reason: '太短',
      to_status: 'DRAFT',
    })
  })

  it('完整 submit 呼叫 rejectSummary 並 emit rejected', async () => {
    const wrapper = mountDialog()
    await flushPromises()

    await wrapper.find('[data-test="reason-input"]').setValue('這是一段足夠長的退簽原因')
    await flushPromises()
    await wrapper.find('[data-test="submit-btn"]').trigger('click')
    await flushPromises()

    expect(rejectSummary).toHaveBeenCalledTimes(1)
    expect(rejectSummary).toHaveBeenCalledWith(7, {
      reason: '這是一段足夠長的退簽原因',
      to_status: 'DRAFT',
    })
    expect(wrapper.emitted('rejected')).toBeTruthy()
  })

  it('status=ACCOUNTING_SIGNED 顯示 2 個 to_status 選項', async () => {
    const wrapper = mountDialog({
      summary: { id: 8, status: 'ACCOUNTING_SIGNED', employee_name: '李' },
    })
    await flushPromises()

    expect(wrapper.vm.toStatusOptions).toHaveLength(2)
    expect(wrapper.vm.toStatusOptions.map((o) => o.value)).toEqual([
      'SUPERVISOR_SIGNED',
      'DRAFT',
    ])
    expect(wrapper.vm.toStatus).toBe('SUPERVISOR_SIGNED')

    // 也驗 DOM 上有 2 個 radio
    expect(wrapper.find('[data-test="radio-SUPERVISOR_SIGNED"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="radio-DRAFT"]').exists()).toBe(true)
  })
})
