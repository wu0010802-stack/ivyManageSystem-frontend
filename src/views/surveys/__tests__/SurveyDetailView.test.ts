/**
 * SurveyDetailView（2026-09-15 UI/UX 改版）：
 * 頁首依狀態放生命週期動作、回覆總覽三段、未回覆名單可直接代填、
 * 「題目」頁籤預覽含固定主題目、代填彈窗標籤是「學生」不是「家長姓名」。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'

const hasPermissionMock = vi.fn(() => true)
vi.mock('@/utils/auth', () => ({
  hasPermission: (...a: unknown[]) => hasPermissionMock(...a),
}))

const pushMock = vi.fn()
const replaceMock = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '7' } }),
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}))

const getSurveyMock = vi.fn()
const getSurveyStatsMock = vi.fn()
const getSurveyResponsesMock = vi.fn()
const publishSurveyMock = vi.fn()
const closeSurveyMock = vi.fn()
const deleteSurveyMock = vi.fn()
const remindSurveyMock = vi.fn()
const exportSurveyMock = vi.fn()
const adminFillResponseMock = vi.fn()
vi.mock('@/api/surveys', () => ({
  getSurvey: (...a: unknown[]) => getSurveyMock(...a),
  getSurveyStats: (...a: unknown[]) => getSurveyStatsMock(...a),
  getSurveyResponses: (...a: unknown[]) => getSurveyResponsesMock(...a),
  publishSurvey: (...a: unknown[]) => publishSurveyMock(...a),
  closeSurvey: (...a: unknown[]) => closeSurveyMock(...a),
  deleteSurvey: (...a: unknown[]) => deleteSurveyMock(...a),
  remindSurvey: (...a: unknown[]) => remindSurveyMock(...a),
  exportSurvey: (...a: unknown[]) => exportSurveyMock(...a),
  adminFillResponse: (...a: unknown[]) => adminFillResponseMock(...a),
}))

const getClassroomsMock = vi.fn()
vi.mock('@/api/classrooms', () => ({
  getClassrooms: (...a: unknown[]) => getClassroomsMock(...a),
}))

vi.mock('@/utils/format', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/format')>()),
  todayTaipeiISO: () => '2026-09-15',
}))

import View from '../SurveyDetailView.vue'

function surveyFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    title: '秋季戶外教學',
    description: '請於 9/20 前回覆',
    event_date: '2026-10-01',
    location: '動物園',
    fee_note: '每人 350 元',
    audience_type: 'classrooms',
    classroom_ids: [11, 12],
    reply_deadline: '2026-09-20',
    status: 'published',
    published_at: '2026-09-10T09:00:00',
    questions: [
      { id: 101, question_text: '搭乘遊覽車', question_type: 'single_choice', options: ['是', '否'], is_required: true, sort_order: 0 },
      { id: 102, question_text: '隨行家長人數', question_type: 'number', options: null, is_required: false, sort_order: 1 },
    ],
    ...overrides,
  }
}

function statsFixture(overrides: Record<string, unknown> = {}) {
  return {
    denominator: 40,
    replied_count: 30,
    attending_count: 24,
    reply_rate: 0.75,
    attend_rate: 0.6,
    by_classroom: [
      { classroom_id: 11, classroom_name: '櫻花', replied: 18, total: 20, attending: 15 },
      { classroom_id: 12, classroom_name: '天堂鳥', replied: 12, total: 20, attending: 9 },
    ],
    questions: [
      { question_id: 101, question_text: '搭乘遊覽車', question_type: 'single_choice', option_counts: { 是: 18, 否: 6 } },
      { question_id: 102, question_text: '隨行家長人數', question_type: 'number', sum: 30, avg: 1.25 },
    ],
    not_replied: [
      { student_id: 501, name: '王小明', classroom_id: 12, classroom_name: '天堂鳥' },
      { student_id: 502, name: '陳小華', classroom_id: 12, classroom_name: '天堂鳥' },
    ],
    ...overrides,
  }
}

function setup(survey = surveyFixture(), stats = statsFixture(), responses: unknown[] = []) {
  getSurveyMock.mockResolvedValue({ data: survey })
  getSurveyStatsMock.mockResolvedValue({ data: stats })
  getSurveyResponsesMock.mockResolvedValue({ data: { items: responses } })
}

function mountView() {
  return mount(View, { global: { plugins: [ElementPlus] }, attachTo: document.body })
}

function headerButtons(w: ReturnType<typeof mountView>): string[] {
  return w.findAll('.page-header button').map((b) => b.text())
}

describe('SurveyDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasPermissionMock.mockReturnValue(true)
    getClassroomsMock.mockResolvedValue({ data: [{ id: 11, name: '櫻花' }, { id: 12, name: '天堂鳥' }] })
  })

  it('進行中：頁首有編輯／催覆／結束／匯出，狀態與截止倒數、班級名稱都在', async () => {
    setup()
    const w = mountView()
    await flushPromises()

    expect(w.find('[data-test="survey-status"]').text()).toBe('進行中')
    expect(headerButtons(w)).toEqual(['編輯', '一鍵催覆', '結束調查', '匯出 Excel'])
    expect(w.find('[data-test="action-remind"]').attributes('disabled')).toBeUndefined()
    expect(w.text()).toContain('剩 5 天')
    expect(w.find('[data-test="survey-meta"]').text()).toContain('2 個班級：櫻花、天堂鳥')
    w.unmount()
  })

  it('回覆總覽三段相加等於對象數；各班未回覆多的排前面；選擇題有佔比', async () => {
    setup()
    const w = mountView()
    await flushPromises()

    const overview = w.find('[data-test="overview"]').text()
    expect(overview).toContain('對象 40 位學生')
    expect(overview).toContain('已回覆 30（75%）')
    expect(overview).toContain('參加 24')
    expect(overview).toContain('不參加 6')
    expect(overview).toContain('未回覆 10')

    const classRows = w.findAll('[data-test="classroom-progress"] .el-table__body tr').map((r) => r.text())
    expect(classRows[0]).toContain('天堂鳥')
    expect(classRows[1]).toContain('櫻花')

    const qstats = w.find('[data-test="question-stats"]').text()
    expect(qstats).toContain('以回覆「參加」的 24 位為分母')
    expect(qstats).toContain('18（75%）')
    expect(qstats).toContain('附加題 1')
    expect(qstats).toContain('平均 1.3')
    w.unmount()
  })

  it('未回覆名單每列可代填：彈窗標題「代填回覆」、標籤「學生」，送出帶 student_id 並重新載入', async () => {
    setup()
    adminFillResponseMock.mockResolvedValue({ data: {} })
    const w = mountView()
    await flushPromises()

    const fillButtons = w.findAll('[data-test="fill-not-replied"]')
    expect(fillButtons).toHaveLength(2)
    await fillButtons[0].trigger('click')
    await flushPromises()

    const dialog = document.body.querySelector('.el-dialog') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain('代填回覆')
    expect(dialog.textContent).toContain('學生')
    expect(dialog.textContent).not.toContain('家長姓名')
    expect(dialog.textContent).toContain('王小明')
    expect(dialog.textContent).toContain('天堂鳥')

    // 必填單選未作答會擋下
    const submit = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.includes('送出')) as HTMLButtonElement
    submit.click()
    await flushPromises()
    expect(adminFillResponseMock).not.toHaveBeenCalled()

    const radioYes = Array.from(dialog.querySelectorAll('.el-radio')).find((r) => r.textContent?.trim() === '是') as HTMLElement
    ;(radioYes.querySelector('input') as HTMLInputElement).click()
    await flushPromises()
    submit.click()
    await flushPromises()

    expect(adminFillResponseMock).toHaveBeenCalledWith(7, 501, { attending: true, answers: { '101': '是' }, note: null })
    expect(getSurveyStatsMock).toHaveBeenCalledTimes(2)
    w.unmount()
  })

  it('草稿：預設落在「題目」頁籤、頁首是刪除／編輯／發布並推播、沒有催覆與匯出、預覽含固定主題目', async () => {
    setup(surveyFixture({ status: 'draft', published_at: null }), statsFixture({ replied_count: 0, attending_count: 0, not_replied: [] }))
    const w = mountView()
    await flushPromises()

    expect(w.find('[data-test="survey-status"]').text()).toBe('草稿')
    expect(headerButtons(w)).toEqual(['刪除草稿', '編輯', '發布並推播'])
    expect(w.find('[data-test="action-remind"]').exists()).toBe(false)
    expect(w.find('[data-test="action-export"]').exists()).toBe(false)
    expect(w.find('.el-tabs__item.is-active').text()).toContain('題目')

    const preview = w.find('[data-test="question-preview"]').text()
    expect(preview).toContain('主題目')
    expect(preview).toContain('是否參加')
    expect(preview).toContain('附加題 1')
    expect(preview).toContain('搭乘遊覽車')
    expect(preview).toContain('請於 9/20 前回覆')
    expect(w.find('[data-test="not-replied"]').text()).toContain('發布後才會有對象名單')
    w.unmount()
  })

  it('草稿發布：確認訊息帶對象人數，成功後切到統計並重新載入', async () => {
    setup(surveyFixture({ status: 'draft', published_at: null }))
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    publishSurveyMock.mockResolvedValue({ data: {} })
    const w = mountView()
    await flushPromises()

    await w.find('[data-test="action-publish"]').trigger('click')
    await flushPromises()

    expect(String(confirmSpy.mock.calls[0][0])).toContain('40 位學生')
    expect(publishSurveyMock).toHaveBeenCalledWith(7)
    expect(getSurveyMock).toHaveBeenCalledTimes(2)
    expect(w.find('.el-tabs__item.is-active').text()).toContain('統計')
    confirmSpy.mockRestore()
    w.unmount()
  })

  it('已截止（published 但過截止日）：催覆停用並說明原因，編輯鈕改「編輯／延長截止」', async () => {
    setup(surveyFixture({ reply_deadline: '2026-09-10' }))
    const w = mountView()
    await flushPromises()

    expect(w.find('[data-test="survey-status"]').text()).toBe('已截止')
    expect(w.find('[data-test="action-remind"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-test="action-edit"]').text()).toBe('編輯／延長截止')
    expect(w.find('[data-test="action-close"]').exists()).toBe(true)
    w.unmount()
  })

  it('已結束：只剩匯出；匯出檔名用調查標題', async () => {
    setup(surveyFixture({ status: 'closed' }))
    exportSurveyMock.mockResolvedValue({ data: new Uint8Array([1, 2, 3]) })
    const createObjectURL = vi.fn(() => 'blob:x')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const w = mountView()
    await flushPromises()

    expect(w.find('[data-test="survey-status"]').text()).toBe('已結束')
    expect(headerButtons(w)).toEqual(['匯出 Excel'])

    await w.find('[data-test="action-export"]').trigger('click')
    await flushPromises()
    expect(exportSurveyMock).toHaveBeenCalledWith(7)
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement
    expect(anchor.download).toBe('秋季戶外教學_回覆.xlsx')
    clickSpy.mockRestore()
    w.unmount()
  })

  it('無 SURVEYS_WRITE：頁首只有匯出，未回覆名單沒有代填鈕', async () => {
    hasPermissionMock.mockReturnValue(false)
    setup()
    const w = mountView()
    await flushPromises()

    expect(headerButtons(w)).toEqual(['匯出 Excel'])
    expect(w.findAll('[data-test="fill-not-replied"]')).toHaveLength(0)
    w.unmount()
  })

  it('回覆明細：來源欄區分代填／家長，可依參加篩選', async () => {
    setup(surveyFixture(), statsFixture(), [
      { student_id: 1, student_name: '甲', classroom_name: '櫻花', attending: true, answers: { '101': '是' }, note: null, is_proxy: false, submitted_by_user_id: 9, updated_at: '2026-09-11T10:00:00' },
      { student_id: 2, student_name: '乙', classroom_name: '櫻花', attending: false, answers: {}, note: '出國', is_proxy: true, submitted_by_user_id: 1, updated_at: '2026-09-12T10:00:00' },
    ])
    const w = mountView()
    await flushPromises()

    await w.findAll('.el-tabs__item').find((t) => t.text().includes('回覆明細'))!.trigger('click')
    await flushPromises()
    expect(w.findAll('.el-tabs__item').map((t) => t.text())).toContain('回覆明細 2')
    const table = w.findAll('.el-tab-pane')[1]
    const rows = table.findAll('.el-table__body tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('家長')
    expect(rows[1].text()).toContain('代填')
    expect(rows[1].text()).toContain('出國')

    const noBtn = table.findAll('.el-radio-button').find((b) => b.text() === '不參加')!
    await noBtn.find('input').setValue()
    await flushPromises()
    expect(table.findAll('.el-table__body tr')).toHaveLength(1)
    expect(table.findAll('.el-table__body tr')[0].text()).toContain('乙')
    w.unmount()
  })
})
