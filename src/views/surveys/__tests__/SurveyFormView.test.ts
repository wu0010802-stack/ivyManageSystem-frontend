/**
 * SurveyFormView 補償控制測試（whole-branch review 第 6 項）。
 *
 * /surveys/:id/edit 是動態路由，manifest 權限層對「有參數段的路徑」只能字面比對，
 * 表達不出 SURVEYS_WRITE 門檻（見 manifest.ts 該模組註解）。本頁因此自行在
 * `<script setup>` 頂層以 `authorized` 旗標補償：無 SURVEYS_WRITE 者導回列表、
 * 不渲染表單、也不得發出 getClassrooms/getSurvey 請求。這是目前唯一釘住此不變式
 * 的測試——在此之前完全沒有測試涵蓋。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const hasPermissionMock = vi.fn(() => true)
vi.mock('@/utils/auth', () => ({
  hasPermission: (...a: unknown[]) => hasPermissionMock(...a),
}))

const { routeParams, routeQuery } = vi.hoisted(() => ({
  routeParams: {} as Record<string, string>,
  routeQuery: {} as Record<string, string>,
}))
const replaceMock = vi.fn()
const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRoute: () => ({ params: routeParams, query: routeQuery }),
  useRouter: () => ({ replace: replaceMock, push: pushMock, back: vi.fn() }),
}))

const getSurveyMock = vi.fn()
const createSurveyMock = vi.fn()
const updateSurveyMock = vi.fn()
vi.mock('@/api/surveys', () => ({
  getSurvey: (...a: unknown[]) => getSurveyMock(...a),
  createSurvey: (...a: unknown[]) => createSurveyMock(...a),
  updateSurvey: (...a: unknown[]) => updateSurveyMock(...a),
}))

const getClassroomsMock = vi.fn()
vi.mock('@/api/classrooms', () => ({
  getClassrooms: (...a: unknown[]) => getClassroomsMock(...a),
}))

import View from '../SurveyFormView.vue'

function mountView() {
  return mount(View, { global: { plugins: [ElementPlus] } })
}

function surveyFixture(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      title: '秋季戶外教學',
      description: '',
      event_date: '2099-10-01',
      location: '動物園',
      fee_note: null,
      audience_type: 'all',
      classroom_ids: [],
      reply_deadline: '2099-09-20',
      questions: [
        { id: 1, question_text: '選擇車次', question_type: 'single_choice', options: ['早班', '晚班'], is_required: true, sort_order: 0 },
      ],
      status: 'draft',
      ...overrides,
    },
  }
}

describe('SurveyFormView（whole-branch review 第 6 項）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasPermissionMock.mockReturnValue(true)
    getClassroomsMock.mockResolvedValue({ data: [] })
    for (const k of Object.keys(routeParams)) delete routeParams[k]
    for (const k of Object.keys(routeQuery)) delete routeQuery[k]
  })

  it('無 SURVEYS_WRITE：不渲染表單、導回列表、不發任何 api 請求', async () => {
    hasPermissionMock.mockReturnValue(false)

    const w = mountView()
    await flushPromises()

    expect(w.find('.survey-form').exists()).toBe(false)
    expect(replaceMock).toHaveBeenCalledWith({ name: 'surveys' })
    expect(getClassroomsMock).not.toHaveBeenCalled()
    expect(getSurveyMock).not.toHaveBeenCalled()
    w.unmount()
  })

  it('有 SURVEYS_WRITE：渲染表單並發出 getClassrooms 請求', async () => {
    hasPermissionMock.mockReturnValue(true)

    const w = mountView()
    await flushPromises()

    expect(w.find('.survey-form').exists()).toBe(true)
    expect(replaceMock).not.toHaveBeenCalled()
    expect(getClassroomsMock).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('published 調查：鎖定結構，不顯示新增題目按鈕列', async () => {
    routeParams.id = '5'
    getSurveyMock.mockResolvedValue(surveyFixture({ status: 'published' }))

    const w = mountView()
    await flushPromises()

    expect(getSurveyMock).toHaveBeenCalledWith(5)
    expect(w.find('.add-question-bar').exists()).toBe(false)
    // published 未全鎖：儲存按鈕仍在（locked 僅 closed 時才隱藏送出鈕）
    expect(w.findAll('button').some((b) => b.text().includes('儲存'))).toBe(true)
    w.unmount()
  })

  it('draft 調查：可新增題目（沒有鎖定結構）', async () => {
    routeParams.id = '6'
    getSurveyMock.mockResolvedValue(surveyFixture({ status: 'draft' }))

    const w = mountView()
    await flushPromises()

    expect(w.find('.add-question-bar').exists()).toBe(true)
    w.unmount()
  })

  describe('複製調查（/surveys/new?copy=<id>）', () => {
    function inputValue(w: ReturnType<typeof mountView>, placeholder: string): string {
      const el = w.findAll('input').find((i) => i.attributes('placeholder') === placeholder)
      return (el!.element as HTMLInputElement).value
    }

    it('載入來源調查預填：標題加「（複本）」、日期清空、仍是建立模式', async () => {
      routeQuery.copy = '9'
      getSurveyMock.mockResolvedValue(surveyFixture({ status: 'closed' }))

      const w = mountView()
      await flushPromises()

      expect(getSurveyMock).toHaveBeenCalledWith(9)
      expect(inputValue(w, '例如：秋季戶外教學參加調查')).toBe('秋季戶外教學（複本）')
      expect(inputValue(w, '例如：宜蘭綠色博覽會園區')).toBe('動物園')
      expect(w.findAll('input').filter((i) => i.attributes('placeholder') === '選擇日期')
        .map((i) => (i.element as HTMLInputElement).value)).toEqual(['', ''])
      // 來源是 closed 也不能把複本鎖住：建立模式、可新增題目、送出鈕是「建立草稿」
      expect(w.find('.add-question-bar').exists()).toBe(true)
      expect(w.find('[data-test="submit"]').text()).toBe('建立草稿')
      expect(w.find('.page-header').text()).toContain('複製自「秋季戶外教學」')
      w.unmount()
    })

    it('送出走建立（POST）而非更新來源調查', async () => {
      routeQuery.copy = '9'
      getSurveyMock.mockResolvedValue(surveyFixture({ reply_deadline: '2099-09-20' }))
      createSurveyMock.mockResolvedValue({ data: { id: 31 } })

      const w = mountView()
      await flushPromises()
      // 複本截止日已清空：直接送出會被擋
      await w.find('[data-test="submit"]').trigger('click')
      await flushPromises()
      expect(createSurveyMock).not.toHaveBeenCalled()
      expect(w.find('[data-test="form-errors"]').text()).toContain('請填寫回覆截止日')

      const deadline = w.findAll('input').filter((i) => i.attributes('placeholder') === '選擇日期')[1]
      await deadline.setValue('2099-12-01')
      await deadline.trigger('change')
      await flushPromises()
      await w.find('[data-test="submit"]').trigger('click')
      await flushPromises()
      expect(updateSurveyMock).not.toHaveBeenCalled()
      expect(createSurveyMock).toHaveBeenCalledTimes(1)
      expect(createSurveyMock.mock.calls[0][0]).toMatchObject({
        title: '秋季戶外教學（複本）', event_date: null, reply_deadline: '2099-12-01',
      })
      expect(pushMock).toHaveBeenCalledWith({ name: 'survey-detail', params: { id: 31 } })
      w.unmount()
    })

    it('來源載入失敗：提示錯誤、留在空白建立表單，不導走', async () => {
      routeQuery.copy = '9'
      getSurveyMock.mockRejectedValue(new Error('404'))

      const w = mountView()
      await flushPromises()

      expect(w.find('.survey-form').exists()).toBe(true)
      expect(replaceMock).not.toHaveBeenCalled()
      expect(inputValue(w, '例如：秋季戶外教學參加調查')).toBe('')
      w.unmount()
    })
  })
})
