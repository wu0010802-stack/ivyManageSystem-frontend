/**
 * SurveysView 三態測試：載入中（skeleton）/ 錯誤（inline error+retry）/ 成功。
 * Task 17 brief Step 5，照 FeesView.threestates.test.ts 模式。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const listMock = vi.fn()

vi.mock('@/parent/api/surveys', () => ({
  listParentSurveys: (...args: unknown[]) => listMock(...args),
  getParentSurvey: vi.fn(),
  submitSurveyResponse: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/parent/utils/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

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

  it('成功載入：渲染卡片與四種 pill 文案（含「已截止未回覆」）', async () => {
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

  it('已回覆 attending=true/false → pill 顯示「參加」／「不參加」', async () => {
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

    expect(w.text()).toContain('參加')
    expect(w.text()).toContain('不參加')

    w.unmount()
  })
})
