import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

function setMobile(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches, media: '(max-width: 767.98px)', onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })
}

const sample = {
  id: 7,
  student_name: '陳品妍',
  semester: '2026上',
  assessment_type: '期中',
  domain: '語文',
  rating: '優',
  content: '能完整說出繪本故事的起承轉合',
  assessment_date: '2026-10-08',
}

vi.mock('@/api/studentAssessments', () => ({
  getMyClassAssessments: vi.fn(() => Promise.resolve({ data: { items: [sample], total: 1 } })),
  createPortalAssessment: vi.fn(() => Promise.resolve({ data: {} })),
}))

vi.mock('@/api/portal', () => ({
  getMyStudents: vi.fn(() => Promise.resolve({
    data: { classrooms: [{ classroom_id: 1, classroom_name: '向日葵班', students: [] }] },
  })),
}))

import PortalAssessmentView from '@/views/portal/PortalAssessmentView.vue'

const stubs = {
  AdminListCards: {
    name: 'AdminListCards',
    props: ['items', 'columns', 'rowKey'],
    template: '<div class="alc-stub" :data-count="items.length"><slot name="title" :item="items[0]||{}"/></div>',
  },
}

describe('PortalAssessmentView 手機卡片視圖', () => {
  beforeEach(() => setMobile(false))

  it('桌機渲染 el-table、不渲染 AdminListCards', async () => {
    setMobile(false)
    const w = mount(PortalAssessmentView, { global: { plugins: [ElementPlus], stubs } })
    await flushPromises()
    expect(w.find('.el-table').exists()).toBe(true)
    expect(w.find('.alc-stub').exists()).toBe(false)
    w.unmount()
  })

  it('手機改渲染 AdminListCards（不再是只看得到前 4 欄的寬表格）', async () => {
    setMobile(true)
    const w = mount(PortalAssessmentView, { global: { plugins: [ElementPlus], stubs } })
    await flushPromises()
    const cards = w.findComponent({ name: 'AdminListCards' })
    expect(cards.exists()).toBe(true)
    expect(w.find('.el-table').exists()).toBe(false)
    expect(cards.props('rowKey')).toBe('id')
    // 評等與評量內容在卡片內可見（桌機表格需橫向捲動才看得到的兩欄）
    const labels = (cards.props('columns') as { label: string }[]).map(c => c.label)
    expect(labels).toEqual(expect.arrayContaining(['評等', '評量內容']))
    expect(w.find('.alc-stub').text()).toContain('陳品妍')
    w.unmount()
  })
})
