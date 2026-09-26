/**
 * 套用預覽 dialog：開啟即 dry-run；只覆寫勾選的手動列（Review Focus #4）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { mockApply } = vi.hoisted(() => ({ mockApply: vi.fn() }))
vi.mock('@/api/dutyRotations', () => ({ applyDutyRotation: mockApply }))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import DutyRotationApplyDialog from '../DutyRotationApplyDialog.vue'

// 比照 src/views/__tests__/ScheduleView.test.ts 的 stub 慣例（EP 元件在測試不註冊）
const globalConfig = {
  stubs: {
    'el-dialog': {
      props: ['modelValue', 'title', 'width'],
      template: '<div v-if="modelValue" class="dlg"><slot /><slot name="footer" /></div>',
    },
    'el-button': {
      props: ['type', 'loading', 'disabled', 'size', 'link'],
      emits: ['click'],
      template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
    },
  },
}

const change = (over: Record<string, unknown>) => ({
  employee_id: 1, employee_name: '王老師', week_start_date: '2026-09-14',
  from_shift_type_id: 5, to_shift_type_id: 6, label: '早車', action: 'create', skip_reason: null, ...over,
})

describe('DutyRotationApplyDialog', () => {
  beforeEach(() => {
    mockApply.mockReset()
    mockApply.mockResolvedValue({
      data: {
        applied: false,
        counts: { create: 1, skip: 1 },
        changes: [
          change({}),
          change({ employee_id: 2, employee_name: '李老師', action: 'skip', skip_reason: 'manual' }),
          change({ employee_id: 3, employee_name: '陳老師', week_start_date: '2026-09-21', action: 'skip', skip_reason: 'manual' }),
        ],
      },
    })
  })

  it('開啟即 dry-run 並顯示手動列', async () => {
    const wrapper = mount(DutyRotationApplyDialog, {
      props: { modelValue: true, rotationId: 7, fromWeekStart: '2026-09-14' },
      global: globalConfig,
    })
    await flushPromises()
    expect(mockApply).toHaveBeenCalledWith(7, { dry_run: true, from_week_start: '2026-09-14', overwrite_manual: [] })
    expect(wrapper.findAll('[data-test="overwrite-checkbox"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('行政手動設定過')
  })

  it('overwrites only checked manual rows', async () => {
    const wrapper = mount(DutyRotationApplyDialog, {
      props: { modelValue: true, rotationId: 7, fromWeekStart: null },
      global: globalConfig,
    })
    await flushPromises()
    await wrapper.findAll('[data-test="overwrite-checkbox"]')[1].setValue(true)
    mockApply.mockResolvedValueOnce({ data: { applied: true, counts: {}, changes: [] } })
    await wrapper.find('[data-test="confirm-apply"]').trigger('click')
    await flushPromises()
    expect(mockApply).toHaveBeenLastCalledWith(7, {
      dry_run: false,
      from_week_start: null,
      overwrite_manual: [{ employee_id: 3, week_start_date: '2026-09-21' }],
    })
    expect(wrapper.emitted('applied')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})
