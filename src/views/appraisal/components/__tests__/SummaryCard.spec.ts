import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

// ── 權限 mock（可切換）─────────────────────────────────────
const permState = { granted: new Set<string>() }
vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn((name: string) => permState.granted.has(name)),
}))

import SummaryCard from '@/views/appraisal/components/SummaryCard.vue'

// ── Element Plus stubs（比照本目錄既有 spec 慣例，最小可用）───
const stubs = {
  ElCheckbox: { props: ['modelValue'], template: '<input type="checkbox" />' },
  ElIcon: { template: '<i><slot /></i>' },
  ElDropdown: { template: '<div><slot /><slot name="dropdown" /></div>' },
  ElDropdownMenu: { template: '<div><slot /></div>' },
  ElDropdownItem: { template: '<div><slot /></div>' },
  ElTag: { props: ['type', 'size'], template: '<span :data-type="type"><slot /></span>' },
  ElButton: {
    props: ['type', 'size', 'disabled'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
  },
}

const baseSummary = {
  id: 1,
  employee_name: '王小明',
  status: 'DRAFT',
  total_score: 88,
  grade: 'OUTSTANDING',
  bonus_amount: 1000,
}

const mountCard = (summary = baseSummary, props = {}) =>
  mount(SummaryCard, { props: { summary, ...props }, global: { stubs } })

describe('SummaryCard', () => {
  beforeEach(() => {
    permState.granted = new Set()
  })

  it('DRAFT + APPRAISAL_REVIEW 顯示「主管簽」主按鈕並可觸發 sign action', async () => {
    permState.granted.add('APPRAISAL_REVIEW')
    const wrapper = mountCard({ ...baseSummary, status: 'DRAFT' })
    const btn = wrapper.find('[data-test="summary-primary-action"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toBe('主管簽')
    await btn.trigger('click')
    expect(wrapper.emitted('action')?.[0]?.[0]).toEqual({
      action: 'sign',
      summary: { ...baseSummary, status: 'DRAFT' },
    })
  })

  it('DRAFT 但無 APPRAISAL_REVIEW 權限則不顯示主按鈕', () => {
    const wrapper = mountCard({ ...baseSummary, status: 'DRAFT' })
    expect(wrapper.find('[data-test="summary-primary-action"]').exists()).toBe(false)
  })

  it('SUPERVISOR_SIGNED + APPRAISAL_ACCOUNTING 顯示「會計簽」', () => {
    permState.granted.add('APPRAISAL_ACCOUNTING')
    const wrapper = mountCard({ ...baseSummary, status: 'SUPERVISOR_SIGNED' })
    expect(wrapper.find('[data-test="summary-primary-action"]').text()).toBe('會計簽')
  })

  it('ACCOUNTING_SIGNED + APPRAISAL_FINALIZE 顯示「核定」', () => {
    permState.granted.add('APPRAISAL_FINALIZE')
    const wrapper = mountCard({ ...baseSummary, status: 'ACCOUNTING_SIGNED' })
    expect(wrapper.find('[data-test="summary-primary-action"]').text()).toBe('核定')
  })

  it('FINALIZED（終態）不顯示主按鈕', () => {
    permState.granted.add('APPRAISAL_REVIEW')
    permState.granted.add('APPRAISAL_ACCOUNTING')
    permState.granted.add('APPRAISAL_FINALIZE')
    const wrapper = mountCard({ ...baseSummary, status: 'FINALIZED' })
    expect(wrapper.find('[data-test="summary-primary-action"]').exists()).toBe(false)
  })

  it('等第顯示中文標籤（非 raw code）', () => {
    const wrapper = mountCard({ ...baseSummary, grade: 'OUTSTANDING' })
    const tag = wrapper.find('[data-test="grade-tag"]')
    expect(tag.text()).toBe('優等')
    expect(tag.text()).not.toContain('OUTSTANDING')
  })

  it('等第 tag type 對應 GRADE_TAG（優等 → success）', () => {
    const wrapper = mountCard({ ...baseSummary, grade: 'OUTSTANDING' })
    const tag = wrapper.find('[data-test="grade-tag"]')
    expect(tag.attributes('data-type')).toBe('success')
  })
})
