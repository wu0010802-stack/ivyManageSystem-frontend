import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

import BatchSignButton from '@/views/appraisal/components/BatchSignButton.vue'

vi.mock('@/api/appraisal', () => ({
  batchSignSummaries: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

import * as api from '@/api/appraisal'
import { ElMessage, ElMessageBox } from 'element-plus'

const ElButtonStub = defineComponent({
  props: ['type', 'disabled', 'loading'],
  emits: ['click'],
  setup(props, { slots, emit, attrs }) {
    return () => h('button', {
      ...attrs,
      disabled: props.disabled || props.loading,
      onClick: () => emit('click'),
    }, slots.default?.())
  },
})
const ElDialogStub = defineComponent({
  props: ['modelValue', 'title'],
  setup(props, { slots, attrs }) {
    return () => props.modelValue
      ? h('div', { ...attrs }, slots.default?.())
      : null
  },
})
const ElTableStub = defineComponent({
  props: ['data'],
  setup(props, { slots, attrs }) {
    return () => h('table', { ...attrs }, slots.default?.())
  },
})
const ElTableColumnStub = defineComponent({
  setup(_, { slots }) { return () => h('td', slots.default?.()) },
})

const stubs = {
  ElButton: ElButtonStub,
  ElDialog: ElDialogStub,
  ElTable: ElTableStub,
  ElTableColumn: ElTableColumnStub,
}

const mountOpts = (props = {}) => ({
  props: { cycleId: 3, stage: 'SUPERVISOR', selectedIds: [1, 2, 3], ...props },
  global: { stubs },
})

describe('BatchSignButton', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('shows confirm dialog on click and aborts on cancel', async () => {
    ElMessageBox.confirm.mockRejectedValueOnce('cancel')
    const wrapper = mount(BatchSignButton, mountOpts())
    await wrapper.find('[data-test="batch-sign-btn"]').trigger('click')
    await nextTick()
    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(api.batchSignSummaries).not.toHaveBeenCalled()
  })

  it('calls batchSignSummaries on confirm and emits done', async () => {
    ElMessageBox.confirm.mockResolvedValueOnce('confirm')
    api.batchSignSummaries.mockResolvedValueOnce({
      data: { succeeded: [1, 2, 3], failed: [] }
    })
    const wrapper = mount(BatchSignButton, mountOpts())
    await wrapper.find('[data-test="batch-sign-btn"]').trigger('click')
    await nextTick(); await nextTick()
    expect(api.batchSignSummaries).toHaveBeenCalledWith(3, [1, 2, 3], 'SUPERVISOR')
    expect(wrapper.emitted('done')).toBeTruthy()
    expect(ElMessage.success).toHaveBeenCalled()
  })

  it('shows failed dialog when partial failure', async () => {
    ElMessageBox.confirm.mockResolvedValueOnce('confirm')
    api.batchSignSummaries.mockResolvedValueOnce({
      data: {
        succeeded: [1, 2],
        failed: [{ summary_id: 3, error: '已經 supervisor signed' }],
      }
    })
    const wrapper = mount(BatchSignButton, mountOpts())
    await wrapper.find('[data-test="batch-sign-btn"]').trigger('click')
    await nextTick(); await nextTick(); await nextTick()
    expect(ElMessage.warning).toHaveBeenCalledWith(expect.stringContaining('成功 2 筆 / 失敗 1 筆'))
    expect(wrapper.find('[data-test="failed-dialog"]').exists()).toBe(true)
  })
})
