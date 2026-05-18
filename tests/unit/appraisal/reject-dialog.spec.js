/**
 * P1-10：RejectDialog reason 字數驗證委派後端。
 *
 * 移除 reason.length < 10 前端守衛。改驗：
 *   1. 0 字也允許 submit（呼叫 API）
 *   2. API 回 422 時 dialog 不關閉 + 顯示 ElMessage error
 *   3. textarea 帶 maxlength="500"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const { messageMock, rejectSummaryMock } = vi.hoisted(() => ({
  messageMock: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
  rejectSummaryMock: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: messageMock,
}))

vi.mock('@/api/appraisal', () => ({
  rejectSummary: rejectSummaryMock,
}))

vi.mock('@/utils/error', () => ({
  apiError: (e, fallback) => e?.response?.data?.detail || fallback || 'error',
}))

import RejectDialog from '@/views/appraisal/components/RejectDialog.vue'

const transparentStub = (slotsToRender = ['default']) => ({
  template: `<div>${slotsToRender.map((s) => `<slot name="${s}" />`).join('')}</div>`,
})

const elStubs = {
  'el-dialog': transparentStub(['default', 'footer']),
  'el-form': transparentStub(),
  'el-form-item': transparentStub(),
  'el-tag': transparentStub(),
  'el-radio-group': transparentStub(),
  'el-radio': transparentStub(),
  'el-input': {
    props: ['modelValue', 'maxlength'],
    template: `<textarea
      :data-test="$attrs['data-test']"
      :maxlength="maxlength"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
    />`,
  },
  'el-button': {
    props: ['loading'],
    emits: ['click'],
    template: `<button
      :data-test="$attrs['data-test']"
      :disabled="loading"
      @click="$emit('click')"
    ><slot /></button>`,
  },
}

function makeWrapper() {
  return mount(RejectDialog, {
    props: {
      visible: true,
      summary: { id: 99, employee_name: '張三', status: 'SUPERVISOR_SIGNED' },
    },
    global: { stubs: elStubs },
  })
}

describe('P1-10 RejectDialog reason 字數驗證委派後端', () => {
  beforeEach(() => {
    rejectSummaryMock.mockReset()
    messageMock.warning.mockClear()
    messageMock.success.mockClear()
    messageMock.error.mockClear()
  })

  it('reason 為空字串時仍會呼叫 API（前端不再 block）', async () => {
    rejectSummaryMock.mockResolvedValue({ data: {} })
    const w = makeWrapper()
    await w.find('[data-test="submit-btn"]').trigger('click')
    expect(rejectSummaryMock).toHaveBeenCalledTimes(1)
    expect(rejectSummaryMock).toHaveBeenCalledWith(99, {
      reason: '',
      to_status: 'DRAFT',
    })
    // 不再出現「至少 10 字」的 warning
    expect(messageMock.warning).not.toHaveBeenCalledWith(
      expect.stringContaining('10 字'),
    )
  })

  it('API 回 422 時 dialog 不關 + 顯示 ElMessage error（apiError 取 detail）', async () => {
    rejectSummaryMock.mockRejectedValue({
      response: { status: 422, data: { detail: '退簽原因不可為空' } },
    })
    const w = makeWrapper()
    await w.find('[data-test="submit-btn"]').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    expect(messageMock.error).toHaveBeenCalledWith('退簽原因不可為空')
    // emit update:visible(false) 不應發生
    const closes = (w.emitted('update:visible') || []).filter(
      (e) => e[0] === false,
    )
    expect(closes.length).toBe(0)
  })

  it('reason textarea 帶 maxlength="500"', () => {
    const w = makeWrapper()
    const ta = w.find('[data-test="reason-input"]')
    expect(ta.exists()).toBe(true)
    expect(ta.attributes('maxlength')).toBe('500')
  })
})
