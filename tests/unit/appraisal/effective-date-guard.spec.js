/**
 * P1-12：effective_on / effective_from 不可選過去日期。
 *
 * 驗證 disabledDate callback：
 *   - 昨天 → 回 true（禁用）
 *   - 今天 → 回 false（允許）
 *   - 明天 → 回 false（允許）
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const { mocks } = vi.hoisted(() => ({
  mocks: {
    elMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
  },
}))

vi.mock('element-plus', () => ({
  ElMessage: mocks.elMessage,
}))

vi.mock('@/api/appraisal', () => ({
  listScoringRules: () => Promise.resolve({ data: [] }),
  createScoringRule: vi.fn(),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => true),
}))

vi.mock('@/utils/error', () => ({
  apiError: (e, f) => f || 'err',
}))

import ScoringRulesPanel from '@/views/appraisal/components/ScoringRulesPanel.vue'
import RuleEditorDialog from '@/views/appraisal/components/RuleEditorDialog.vue'

const transparentStub = (slotsToRender = ['default']) => ({
  template: `<div>${slotsToRender.map((s) => `<slot name="${s}" />`).join('')}</div>`,
})

const stubs = {
  'el-button': transparentStub(),
  'el-form-item': transparentStub(),
  'el-form': transparentStub(),
  'el-dialog': transparentStub(['default', 'footer']),
  'el-select': transparentStub(),
  'el-option': transparentStub(),
  'el-input': transparentStub(),
  'el-input-number': transparentStub(),
  'el-date-picker': transparentStub(),
  'el-tag': transparentStub(),
}

function startOfTomorrow() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 1)
  return d
}
function startOfYesterday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - 1)
  return d
}
function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

describe('P1-12 effective date 不可選過去日期', () => {
  describe('ScoringRulesPanel.disablePastDates', () => {
    it('昨天 → true（禁用）；今天 → false；明天 → false', async () => {
      const w = mount(ScoringRulesPanel, {
        global: {
          stubs: {
            ...stubs,
            RuleEditorDialog: true,
            RuleHistoryDrawer: true,
          },
        },
      })
      await new Promise((r) => setTimeout(r, 0))
      const fn = w.vm.disablePastDates
      expect(typeof fn).toBe('function')
      expect(fn(startOfYesterday())).toBe(true)
      expect(fn(startOfToday())).toBe(false)
      expect(fn(startOfTomorrow())).toBe(false)
    })
  })

  describe('RuleEditorDialog.disablePastDates', () => {
    it('昨天 → true（禁用）；今天 → false；明天 → false', () => {
      const w = mount(RuleEditorDialog, {
        props: { visible: true, itemCode: 'LATE_EARLY', existingRule: null },
        global: { stubs },
      })
      const fn = w.vm.disablePastDates
      expect(typeof fn).toBe('function')
      expect(fn(startOfYesterday())).toBe(true)
      expect(fn(startOfToday())).toBe(false)
      expect(fn(startOfTomorrow())).toBe(false)
    })
  })
})
