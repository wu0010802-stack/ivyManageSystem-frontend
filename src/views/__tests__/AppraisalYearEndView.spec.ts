import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const replace = vi.fn()
let mockQuery: Record<string, unknown> = {}
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mockQuery }),
  useRouter: () => ({ replace }),
}))

const hasPermission = vi.fn()
vi.mock('@/utils/auth', () => ({
  hasPermission: (...a: unknown[]) => hasPermission(...a),
}))

import AppraisalYearEndView from '../AppraisalYearEndView.vue'

const stubs = {
  AppraisalManagementView: { name: 'AppraisalManagementView', template: '<div class="stub-appraisal" />' },
  YearEndListView: { name: 'YearEndListView', template: '<div class="stub-year-end" />' },
  AppraisalPayoutView: { name: 'AppraisalPayoutView', template: '<div class="stub-payout" />' },
  ExceptionCenterView: { name: 'ExceptionCenterView', template: '<div class="stub-exceptions" />' },
  ElSegmented: {
    name: 'ElSegmented',
    props: ['modelValue', 'options'],
    emits: ['change'],
    template: '<div class="stub-seg" />',
  },
  ElEmpty: { name: 'ElEmpty', template: '<div class="stub-empty" />' },
  YearEndRulesPanel: { name: 'YearEndRulesPanel', template: '<div class="stub-year-end-rules" />' },
}

function mountWith(perms: string[], query: Record<string, unknown> = {}) {
  hasPermission.mockImplementation((p: string) => perms.includes(p))
  mockQuery = query
  replace.mockClear()
  return mount(AppraisalYearEndView, { global: { stubs } })
}

describe('AppraisalYearEndView shell', () => {
  beforeEach(() => vi.clearAllMocks())

  it('只渲染有權限的 section（只有 YEAR_END_READ → 年終獎金 + 例外中心[OR]）', () => {
    const w = mountWith(['YEAR_END_READ'])
    const seg = w.findComponent({ name: 'ElSegmented' })
    // 例外中心對 APPRAISAL_READ / YEAR_END_READ 為 OR 語意，YEAR_END_READ 單獨持有即可見
    expect(seg.props('options')).toEqual([
      { label: '年終獎金', value: 'year-end' },
      { label: '例外中心', value: 'exceptions' },
    ])
    expect(w.find('.stub-year-end').exists()).toBe(true)
    expect(w.find('.stub-appraisal').exists()).toBe(false)
    expect(w.find('.stub-payout').exists()).toBe(false)
  })

  it('缺 section query → 落第一個可用並 replace 修正', () => {
    mountWith(['YEAR_END_READ'])
    expect(replace).toHaveBeenCalledWith({ query: { section: 'year-end' } })
  })

  it('deep link ?section=payout + APPRAISAL_FINALIZE → 顯示 payout', () => {
    const w = mountWith(['APPRAISAL_FINALIZE'], { section: 'payout' })
    expect(w.find('.stub-payout').exists()).toBe(true)
    expect(replace).not.toHaveBeenCalled()
  })

  it('全權限 deep link ?section=payout（非首位）→ 顯示 payout 且不 replace', () => {
    const w = mountWith(['SETTINGS_READ', 'YEAR_END_READ', 'APPRAISAL_FINALIZE'], { section: 'payout' })
    expect(w.find('.stub-payout').exists()).toBe(true)
    expect(w.find('.stub-appraisal').exists()).toBe(false)
    expect(replace).not.toHaveBeenCalled()
  })

  it('?section 指向無權限 section → fallback 第一個可用', () => {
    mountWith(['YEAR_END_READ'], { section: 'payout' })
    expect(replace).toHaveBeenCalledWith({ query: { section: 'year-end' } })
  })

  it('完全無權限 → 隱藏切換器、顯示 el-empty', () => {
    const w = mountWith([])
    expect(w.find('.stub-seg').exists()).toBe(false)
    expect(w.find('.stub-empty').exists()).toBe(true)
  })

  it('切離 appraisal 時清掉 tab query', async () => {
    // 考核分頁可見性已對齊內層 API（APPRAISAL_READ）
    const w = mountWith(['APPRAISAL_READ', 'YEAR_END_READ'], { section: 'appraisal', tab: 'settings' })
    replace.mockClear()
    w.findComponent({ name: 'ElSegmented' }).vm.$emit('change', 'year-end')
    await nextTick()
    expect(replace).toHaveBeenCalledWith({ query: { section: 'year-end' } })
  })

  it('切離 appraisal 時一併清掉 cycle/view query（歷史週期內嵌明細殘留）', async () => {
    const w = mountWith(
      ['APPRAISAL_READ', 'YEAR_END_READ'],
      { section: 'appraisal', tab: 'history', cycle: '4', view: 'kanban' },
    )
    replace.mockClear()
    w.findComponent({ name: 'ElSegmented' }).vm.$emit('change', 'year-end')
    await nextTick()
    expect(replace).toHaveBeenCalledWith({ query: { section: 'year-end' } })
  })

  it('SETTINGS_READ → 出現「年終規則」section 並可渲染', () => {
    const w = mountWith(['SETTINGS_READ'], { section: 'year-end-rules' })
    const seg = w.findComponent({ name: 'ElSegmented' })
    const opts = seg.props('options') as { label: string; value: string }[]
    expect(opts.some((o) => o.value === 'year-end-rules' && o.label === '年終規則')).toBe(true)
    expect(w.find('.stub-year-end-rules').exists()).toBe(true)
  })

  it('只有 YEAR_END_READ（無 SETTINGS_READ）→ 不出現年終規則 section', () => {
    const w = mountWith(['YEAR_END_READ'])
    const seg = w.findComponent({ name: 'ElSegmented' })
    const opts = seg.props('options') as { label: string; value: string }[]
    expect(opts.some((o) => o.value === 'year-end-rules')).toBe(false)
  })

  // 例外中心：唯讀彙整考核/年終待人工處理事項，任一方 READ 權限即可見（OR）
  it('只有 APPRAISAL_READ → 出現「例外中心」section 並可渲染', () => {
    const w = mountWith(['APPRAISAL_READ'], { section: 'exceptions' })
    const seg = w.findComponent({ name: 'ElSegmented' })
    const opts = seg.props('options') as { label: string; value: string }[]
    expect(opts.some((o) => o.value === 'exceptions' && o.label === '例外中心')).toBe(true)
    expect(w.find('.stub-exceptions').exists()).toBe(true)
  })

  it('只有 YEAR_END_READ → 亦出現「例外中心」section（OR 語意）', () => {
    const w = mountWith(['YEAR_END_READ'], { section: 'exceptions' })
    const seg = w.findComponent({ name: 'ElSegmented' })
    const opts = seg.props('options') as { label: string; value: string }[]
    expect(opts.some((o) => o.value === 'exceptions')).toBe(true)
    expect(w.find('.stub-exceptions').exists()).toBe(true)
  })

  it('完全無 APPRAISAL_READ / YEAR_END_READ → 不出現「例外中心」section', () => {
    const w = mountWith(['SETTINGS_READ'])
    const seg = w.findComponent({ name: 'ElSegmented' })
    const opts = seg.props('options') as { label: string; value: string }[]
    expect(opts.some((o) => o.value === 'exceptions')).toBe(false)
  })
})
