import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '5' } }),
}))

const getStatusMock = vi.fn()
const fillMock = vi.fn()
const remindMock = vi.fn()
vi.mock('@/api/surveys', () => ({
  getPortalSurveyClassStatus: (...a: unknown[]) => getStatusMock(...a),
  portalFillResponse: (...a: unknown[]) => fillMock(...a),
  portalRemindSurvey: (...a: unknown[]) => remindMock(...a),
}))

import View from '../PortalSurveyDetailView.vue'

function classStatusFixture(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      survey: {
        id: 5,
        title: '秋季戶外教學',
        status: 'published',
        reply_deadline: '2099-12-31',
        event_date: '2099-12-01',
        fee_note: null,
        ...overrides,
      },
      questions: [
        { id: 1, question_text: '是否需要素食餐盒', question_type: 'single_choice', options: ['是', '否'], is_required: true, sort_order: 1 },
      ],
      replied: [
        {
          student_id: 100, student_name: '王小明', classroom_name: '向日葵班',
          attending: true, answers: { '1': '是' }, note: null,
          is_proxy: false, submitted_by_user_id: 9, updated_at: '2026-08-01T10:00:00',
        },
      ],
      not_replied: [
        { student_id: 200, name: '陳小華', classroom_name: '向日葵班' },
      ],
    },
  }
}

function mountView() {
  return mount(View, { global: { plugins: [ElementPlus] } })
}

describe('PortalSurveyDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('渲染已回覆／未回覆摘要', async () => {
    getStatusMock.mockResolvedValue(classStatusFixture())
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('已回覆 1 / 未回覆 1')
    w.unmount()
  })

  it('published 且未過截止 → 一鍵提醒可按；closed → disabled', async () => {
    getStatusMock.mockResolvedValue(classStatusFixture())
    const w = mountView()
    await flushPromises()
    const btn = w.findAll('button').find(b => b.text() === '一鍵提醒')
    expect(btn).toBeTruthy()
    expect(btn!.attributes('disabled')).toBeUndefined()
    w.unmount()
  })

  it('closed 調查 → 一鍵提醒 disabled', async () => {
    getStatusMock.mockResolvedValue(classStatusFixture({ status: 'closed' }))
    const w = mountView()
    await flushPromises()
    const btn = w.findAll('button').find(b => b.text() === '一鍵提醒')
    expect(btn!.attributes('disabled')).toBeDefined()
    w.unmount()
  })

  it('已過截止 → 一鍵提醒 disabled', async () => {
    getStatusMock.mockResolvedValue(classStatusFixture({ reply_deadline: '2020-01-01' }))
    const w = mountView()
    await flushPromises()
    const btn = w.findAll('button').find(b => b.text() === '一鍵提醒')
    expect(btn!.attributes('disabled')).toBeDefined()
    w.unmount()
  })

  it('代填送出以正確參數呼叫 portalFillResponse', async () => {
    getStatusMock.mockResolvedValue(classStatusFixture())
    fillMock.mockResolvedValue({ data: {} })
    const w = mountView()
    await flushPromises()
    const vm = w.vm as unknown as {
      openFillDialog: (studentId: number, name: string, existing?: unknown) => void
      onFillSubmit: () => Promise<void>
      fillForm: { attending: boolean; answers: Record<string, unknown>; note: string }
    }
    vm.openFillDialog(200, '陳小華')
    vm.fillForm.answers = { '1': '否' }
    vm.fillForm.note = '幫忙代填'
    await vm.onFillSubmit()
    expect(fillMock).toHaveBeenCalledWith(5, 200, {
      attending: true,
      answers: { '1': '否' },
      note: '幫忙代填',
    })
    w.unmount()
  })
})
