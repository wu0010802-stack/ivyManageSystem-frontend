import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// ── API mocks ─────────────────────────────────────────────
vi.mock('@/api/appraisal', () => ({
  commentSummary: vi.fn().mockResolvedValue({ data: {} }),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import { commentSummary } from '@/api/appraisal'
import { ElMessage } from 'element-plus'
import CommentDialog from '../components/CommentDialog.vue'

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

const GLOBAL_STUBS = {
  'el-button': ElButtonStub,
  'el-dialog': ElDialogStub,
  'el-input': ElInputStub,
}

function mountDialog(props = {}) {
  return mount(CommentDialog, {
    props: {
      visible: true,
      summary: { id: 7, employee_name: '王小明' },
      ...props,
    },
    global: { stubs: GLOBAL_STUBS },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  commentSummary.mockResolvedValue({ data: {} })
})

describe('CommentDialog', () => {
  it('visible=true 時 reset comment 為空', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    expect(wrapper.vm.comment).toBe('')
  })

  it('空 comment 不送 API 並發出 warning', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    // 留言只放空白也算空
    await wrapper.find('[data-test="comment-input"]').setValue('   ')
    await flushPromises()
    await wrapper.find('[data-test="submit-btn"]').trigger('click')
    await flushPromises()

    expect(commentSummary).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalled()
  })
})
