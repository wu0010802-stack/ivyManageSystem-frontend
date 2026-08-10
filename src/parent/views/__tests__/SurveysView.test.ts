/**
 * SurveysView 三態測試：載入中（skeleton）/ 錯誤（inline error+retry）/ 成功。
 * Task 17 brief Step 5，照 FeesView.threestates.test.ts 模式。
 *
 * 併同審查修復（round 2）補測：
 *  - 深連結命中／找不到卡片
 *  - 送出成功後 sheet 不會被深連結邏輯重新開啟（fix #1 的守衛測試）
 *  - pill 狀態改用元件 props 斷言，避免「不參加」子字串吃掉「參加」斷言（fix #2）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const listMock = vi.fn()
const getSurveyMock = vi.fn()
const submitMock = vi.fn()

vi.mock('@/parent/api/surveys', () => ({
  listParentSurveys: (...args: unknown[]) => listMock(...args),
  getParentSurvey: (...args: unknown[]) => getSurveyMock(...args),
  submitSurveyResponse: (...args: unknown[]) => submitMock(...args),
}))

const { routeParams } = vi.hoisted(() => ({ routeParams: {} as Record<string, string> }))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: routeParams }),
  useRouter: () => ({ push: vi.fn() }),
}))

const toastMock = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() }
vi.mock('@/parent/utils/toast', () => ({ toast: toastMock }))

const STUBS = {
  PullToRefresh: { template: '<div class="ptr"><slot /></div>' },
  SurveyFillSheet: true,
}

const SUCCESS_CARDS = {
  data: {
    items: [
      {
        survey_id: 1,
        title: '校外教學意願調查',
        event_date: '2026-09-01',
        location: '動物園',
        fee_note: '每人 300 元',
        reply_deadline: '2026-08-20',
        status: 'published',
        is_open: true,
        student_id: 1,
        student_name: '小明',
        my_response: null,
      },
      {
        survey_id: 2,
        title: '園遊會參加調查',
        event_date: '2026-07-01',
        location: null,
        fee_note: null,
        reply_deadline: '2026-06-20',
        status: 'published',
        is_open: false,
        student_id: 1,
        student_name: '小明',
        my_response: null,
      },
    ],
  },
}

beforeEach(() => {
  listMock.mockReset()
  getSurveyMock.mockReset()
  submitMock.mockReset()
  toastMock.success.mockReset()
  toastMock.error.mockReset()
  toastMock.warn.mockReset()
  toastMock.info.mockReset()
  for (const k of Object.keys(routeParams)) delete routeParams[k]
})

describe('SurveysView 三態（Task 17）', () => {
  it('載入中：loading=true 且無卡片時顯示 SkeletonBlock', async () => {
    listMock.mockReturnValue(new Promise(() => {}))

    const SurveysView = (await import('@/parent/views/SurveysView.vue')).default
    const w = mount(SurveysView, { global: { stubs: STUBS } })
    await flushPromises()

    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(true)
    w.unmount()
  })

  it('fetch 失敗：顯示 MobileErrorRetry 且按「重試」會重新呼叫 fetch', async () => {
    listMock
      .mockRejectedValueOnce({ displayMessage: '網路錯誤' })
      .mockResolvedValueOnce(SUCCESS_CARDS)

    const SurveysView = (await import('@/parent/views/SurveysView.vue')).default
    const w = mount(SurveysView, { global: { stubs: STUBS } })
    await flushPromises()

    const errComp = w.findComponent({ name: 'MobileErrorRetry' })
    expect(errComp.exists()).toBe(true)
    expect(listMock).toHaveBeenCalledTimes(1)

    await errComp.find('button').trigger('click')
    await flushPromises()

    expect(listMock).toHaveBeenCalledTimes(2)
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)
    w.unmount()
  })

  it('成功載入：渲染卡片與 pill 文案（含「已截止未回覆」）', async () => {
    listMock.mockResolvedValue(SUCCESS_CARDS)

    const SurveysView = (await import('@/parent/views/SurveysView.vue')).default
    const w = mount(SurveysView, { global: { stubs: STUBS } })
    await flushPromises()

    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(false)
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)

    // 預設 tab=pending：is_open && !my_response → 「待回覆」
    expect(w.text()).toContain('校外教學意願調查')
    expect(w.text()).toContain('待回覆')

    // 切到「已回覆」tab：!is_open && !my_response → 「已截止未回覆」
    await w.findComponent({ name: 'M3SegmentedButton' }).vm.$emit('update:modelValue', 'done')
    await flushPromises()
    expect(w.text()).toContain('園遊會參加調查')
    expect(w.text()).toContain('已截止未回覆')

    w.unmount()
  })

  it('已回覆 attending=true/false → pill props 分別為「參加」／「不參加」（元件層斷言，避免子字串誤判）', async () => {
    listMock.mockResolvedValue({
      data: {
        items: [
          { ...SUCCESS_CARDS.data.items[0], is_open: true, my_response: { attending: true, answers: {}, note: null } },
          { ...SUCCESS_CARDS.data.items[1], is_open: true, my_response: { attending: false, answers: {}, note: null } },
        ],
      },
    })

    const SurveysView = (await import('@/parent/views/SurveysView.vue')).default
    const w = mount(SurveysView, { global: { stubs: STUBS } })
    await flushPromises()

    await w.findComponent({ name: 'M3SegmentedButton' }).vm.$emit('update:modelValue', 'done')
    await flushPromises()

    const pillLabels = w.findAllComponents({ name: 'StatusPill' }).map((c) => c.props('label'))
    const pillTones = w.findAllComponents({ name: 'StatusPill' }).map((c) => c.props('tone'))
    expect(pillLabels).toEqual(['參加', '不參加'])
    expect(pillTones).toEqual(['ok', 'neutral'])

    w.unmount()
  })

  it('已截止的卡片不可點開填寫（canFill=false，不綁 openFill，避免死路型 400）', async () => {
    listMock.mockResolvedValue(SUCCESS_CARDS)

    const SurveysView = (await import('@/parent/views/SurveysView.vue')).default
    const w = mount(SurveysView, { global: { stubs: STUBS } })
    await flushPromises()

    await w.findComponent({ name: 'M3SegmentedButton' }).vm.$emit('update:modelValue', 'done')
    await flushPromises()

    // done tab 只剩已截止未回覆那張（is_open=false）
    const closedCard = w.findAll('.survey-card').find((el) => el.text().includes('園遊會參加調查'))
    expect(closedCard).toBeTruthy()
    expect((closedCard!.element as HTMLButtonElement).disabled).toBe(true)

    await closedCard!.trigger('click')
    await flushPromises()
    expect(getSurveyMock).not.toHaveBeenCalled()

    w.unmount()
  })

  it('深連結命中：載入完成後自動開啟對應卡片的填寫 sheet（僅一次）', async () => {
    routeParams.surveyId = '1'
    listMock.mockResolvedValue(SUCCESS_CARDS)
    getSurveyMock.mockResolvedValue({
      data: {
        survey_id: 1,
        title: '校外教學意願調查',
        fee_note: null,
        event_date: null,
        location: null,
        reply_deadline: '2026-08-20',
        questions: [],
      },
    })

    const SurveysView = (await import('@/parent/views/SurveysView.vue')).default
    const w = mount(SurveysView, { global: { stubs: STUBS } })
    await flushPromises()

    expect(getSurveyMock).toHaveBeenCalledWith(1)
    const sheet = w.findComponent({ name: 'SurveyFillSheet' })
    expect(sheet.props('modelValue')).toBe(true)

    w.unmount()
  })

  it('深連結找不到卡片：toast.info 提示、不爆錯、不開 sheet', async () => {
    routeParams.surveyId = '999'
    listMock.mockResolvedValue(SUCCESS_CARDS)

    const SurveysView = (await import('@/parent/views/SurveysView.vue')).default
    const w = mount(SurveysView, { global: { stubs: STUBS } })
    await flushPromises()

    expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining('找不到'))
    expect(getSurveyMock).not.toHaveBeenCalled()
    const sheet = w.findComponent({ name: 'SurveyFillSheet' })
    expect(sheet.props('modelValue')).toBe(false)

    w.unmount()
  })

  it('深連結進入後送出成功：sheet 關閉且不會被重新彈開（fix #1 守衛）', async () => {
    routeParams.surveyId = '1'
    listMock.mockResolvedValue(SUCCESS_CARDS)
    getSurveyMock.mockResolvedValue({
      data: {
        survey_id: 1,
        title: '校外教學意願調查',
        fee_note: null,
        event_date: null,
        location: null,
        reply_deadline: '2026-08-20',
        questions: [],
      },
    })
    submitMock.mockResolvedValue({ data: { attending: true, answers: {}, note: null } })

    const SurveysView = (await import('@/parent/views/SurveysView.vue')).default
    const w = mount(SurveysView, { global: { stubs: STUBS } })
    await flushPromises()

    const sheet = w.findComponent({ name: 'SurveyFillSheet' })
    expect(sheet.props('modelValue')).toBe(true)

    // sheet 填好表單後送出
    await sheet.vm.$emit('update:form-data', { attending: true, answers: {}, note: '' })
    await sheet.vm.$emit('submit')
    await flushPromises()

    expect(submitMock).toHaveBeenCalledTimes(1)
    // fetchData 因送出成功被重呼叫（第二次 listParentSurveys），但深連結 guard 已消耗，
    // sheet 不應被重新開啟
    expect(listMock).toHaveBeenCalledTimes(2)
    expect(w.findComponent({ name: 'SurveyFillSheet' }).props('modelValue')).toBe(false)

    w.unmount()
  })
})
