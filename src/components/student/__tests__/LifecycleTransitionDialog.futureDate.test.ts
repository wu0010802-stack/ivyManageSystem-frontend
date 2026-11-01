/**
 * DAILY-F6：生命週期轉移的生效日期不可選未來日。
 *
 * 後端 transition() 會立即改 is_active／lifecycle_status，沒有「到生效日才生效」
 * 的排程；選未來日會讓孩子在仍在籍的日子就從各當日名冊消失（後端已改回 422）。
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/students', () => ({ transitionStudentLifecycle: vi.fn() }))

import LifecycleTransitionDialog from '../LifecycleTransitionDialog.vue'

function daysFromToday(days: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d
}

describe('LifecycleTransitionDialog 生效日期', () => {
  it('今天與過去可選、未來日 disabled', () => {
    const w = mount(LifecycleTransitionDialog, {
      props: { modelValue: false, studentId: 1, currentStatus: 'active' },
      global: { plugins: [ElementPlus] },
    })
    const { disabledEffectiveDate } = w.vm as unknown as {
      disabledEffectiveDate: (d: Date) => boolean
    }
    expect(disabledEffectiveDate(daysFromToday(0))).toBe(false)
    expect(disabledEffectiveDate(daysFromToday(-30))).toBe(false)
    expect(disabledEffectiveDate(daysFromToday(1))).toBe(true)
  })
})
