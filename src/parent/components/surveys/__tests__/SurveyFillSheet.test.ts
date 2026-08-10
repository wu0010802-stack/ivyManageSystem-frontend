/**
 * SurveyFillSheet 行為測試（presentational，不打 api）。
 * Task 17 brief Step 1。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const warnMock = vi.fn()
vi.mock('@/parent/utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: (...args: unknown[]) => warnMock(...args), info: vi.fn() },
}))

const STUBS = {
  ParentBottomSheet: { template: '<div><slot /><slot name="footer" /></div>' },
}

const SURVEY = {
  survey_id: 1,
  title: '校外教學意願調查',
  fee_note: '每人 300 元',
  event_date: '2026-09-01',
  location: '動物園',
  reply_deadline: '2026-08-20',
  questions: [
    { id: 1, question_text: '選擇車次', question_type: 'single', options: ['早班', '晚班'], is_required: true },
    { id: 2, question_text: '過敏原', question_type: 'text', options: null, is_required: false },
  ],
}

async function mountSheet(formData: { attending: boolean | null; answers: Record<string, unknown>; note: string }) {
  const SurveyFillSheet = (await import('../SurveyFillSheet.vue')).default
  return mount(SurveyFillSheet, {
    props: {
      modelValue: true,
      survey: SURVEY,
      studentName: '小明',
      formData,
      submitting: false,
    },
    global: { stubs: STUBS },
  })
}

beforeEach(() => {
  warnMock.mockReset()
})

describe('SurveyFillSheet（Task 17）', () => {
  it('選不參加隱藏附加題，emit submit 前 answers 清空', async () => {
    const w = await mountSheet({ attending: false, answers: { 1: '早班' }, note: '' })

    // 附加題區不存在（僅在 attending===true 時渲染）
    expect(w.find('.survey-fill-questions').exists()).toBe(false)

    const submitBtn = w.findAll('button').find((b) => b.text().includes('送出回覆'))
    await submitBtn!.trigger('click')

    const formDataEvents = w.emitted('update:form-data')
    expect(formDataEvents).toBeTruthy()
    const lastFormData = formDataEvents![formDataEvents!.length - 1][0] as { answers: Record<string, unknown> }
    expect(lastFormData.answers).toEqual({})

    expect(w.emitted('submit')).toBeTruthy()
    w.unmount()
  })

  it('參加時必填未答 → toast.warn 且不 emit submit', async () => {
    const w = await mountSheet({ attending: true, answers: {}, note: '' })

    const submitBtn = w.findAll('button').find((b) => b.text().includes('送出回覆'))
    await submitBtn!.trigger('click')

    expect(warnMock).toHaveBeenCalledWith('「選擇車次」為必填')
    expect(w.emitted('submit')).toBeFalsy()
    w.unmount()
  })

  it('參加且答完 → emit submit', async () => {
    const w = await mountSheet({ attending: true, answers: { 1: '早班' }, note: '' })

    const submitBtn = w.findAll('button').find((b) => b.text().includes('送出回覆'))
    await submitBtn!.trigger('click')

    expect(warnMock).not.toHaveBeenCalled()
    expect(w.emitted('submit')).toBeTruthy()
    w.unmount()
  })
})
