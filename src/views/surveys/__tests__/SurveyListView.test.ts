/**
 * SurveyListView（2026-09-15 UI/UX 改版）：
 * 一次載入後純前端篩選、顯示狀態四態（含前端推導的「已截止」）、進行中排最前、
 * 操作依狀態出現、發布確認帶推播人數、空狀態帶建立入口、點列進詳情。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import ElementPlus, { ElMessageBox } from 'element-plus'

const hasPermissionMock = vi.fn(() => true)
vi.mock('@/utils/auth', () => ({
  hasPermission: (...a: unknown[]) => hasPermissionMock(...a),
}))

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}))

const listSurveysMock = vi.fn()
const publishSurveyMock = vi.fn()
const closeSurveyMock = vi.fn()
const deleteSurveyMock = vi.fn()
vi.mock('@/api/surveys', () => ({
  listSurveys: (...a: unknown[]) => listSurveysMock(...a),
  publishSurvey: (...a: unknown[]) => publishSurveyMock(...a),
  closeSurvey: (...a: unknown[]) => closeSurveyMock(...a),
  deleteSurvey: (...a: unknown[]) => deleteSurveyMock(...a),
}))

const isMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile, cleanup: () => {} }),
}))

vi.mock('@/utils/format', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/format')>()),
  todayTaipeiISO: () => '2026-09-15',
}))

import View from '../SurveyListView.vue'

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: '秋季戶外教學',
    event_date: '2026-10-01',
    reply_deadline: '2026-09-20',
    audience_type: 'all',
    status: 'published',
    replied_count: 10,
    denominator: 40,
    ...overrides,
  }
}

const FIXTURE = [
  row({ id: 1, title: '畢業旅行', status: 'closed', replied_count: 40 }),
  row({ id: 2, title: '聖誕晚會', status: 'draft', replied_count: 0 }),
  row({ id: 3, title: '親子運動會', reply_deadline: '2026-09-12', replied_count: 30 }),
  row({ id: 4, title: '秋季戶外教學', reply_deadline: '2026-09-20' }),
]

function mountView() {
  return mount(View, { global: { plugins: [ElementPlus] }, attachTo: document.body })
}

function rowTexts(w: ReturnType<typeof mountView>): string[] {
  return w.findAll('.el-table__body .survey-row').map((tr) => tr.text())
}

describe('SurveyListView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isMobile.value = false
    hasPermissionMock.mockReturnValue(true)
    listSurveysMock.mockResolvedValue({ data: { items: FIXTURE } })
  })

  it('一次載入（不帶 status 參數），進行中排最前、其後已截止／草稿／已結束', async () => {
    const w = mountView()
    await flushPromises()

    expect(listSurveysMock).toHaveBeenCalledTimes(1)
    expect(listSurveysMock).toHaveBeenCalledWith()
    const texts = rowTexts(w)
    expect(texts).toHaveLength(4)
    expect(texts[0]).toContain('秋季戶外教學')
    expect(texts[0]).toContain('進行中')
    expect(texts[0]).toContain('剩 5 天')
    expect(texts[1]).toContain('親子運動會')
    expect(texts[1]).toContain('已截止')
    expect(texts[1]).toContain('已過 3 天')
    expect(texts[2]).toContain('聖誕晚會')
    expect(texts[2]).toContain('草稿')
    expect(texts[3]).toContain('畢業旅行')
    expect(texts[3]).toContain('已結束')
    w.unmount()
  })

  it('狀態篩選段落帶計數', async () => {
    const w = mountView()
    await flushPromises()

    const toolbar = w.text()
    expect(toolbar).toContain('全部 4')
    expect(toolbar).toContain('進行中 1')
    expect(toolbar).toContain('已截止 1')
    expect(toolbar).toContain('草稿 1')
    expect(toolbar).toContain('已結束 1')
    w.unmount()
  })

  it('操作依狀態出現：草稿＝編輯／發布／刪除、進行中＝編輯／結束、已截止＝結束、已結束無動作', async () => {
    const w = mountView()
    await flushPromises()

    const rows = w.findAll('.el-table__body .survey-row')
    const buttonsOf = (i: number) => rows[i].findAll('button').map((b) => b.text())
    expect(buttonsOf(0)).toEqual(['編輯', '結束調查'])
    expect(buttonsOf(1)).toEqual(['結束調查'])
    expect(buttonsOf(2)).toEqual(['編輯', '發布', '刪除'])
    expect(buttonsOf(3)).toEqual([])
    w.unmount()
  })

  it('無 SURVEYS_WRITE：沒有建立鈕、沒有操作欄', async () => {
    hasPermissionMock.mockReturnValue(false)
    const w = mountView()
    await flushPromises()

    expect(w.find('[data-test="survey-create"]').exists()).toBe(false)
    expect(w.findAll('.el-table__body .survey-row button')).toHaveLength(0)
    w.unmount()
  })

  it('發布確認訊息帶推播對象人數，確認後呼叫 publish 並重新載入', async () => {
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    publishSurveyMock.mockResolvedValue({ data: {} })
    const w = mountView()
    await flushPromises()

    const draftRow = w.findAll('.el-table__body .survey-row')[2]
    await draftRow.findAll('button').find((b) => b.text() === '發布')!.trigger('click')
    await flushPromises()

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    const [message, title] = confirmSpy.mock.calls[0] as unknown as [string, string]
    expect(message).toContain('40 位學生')
    expect(message).toContain('無法再修改')
    expect(title).toContain('聖誕晚會')
    expect(publishSurveyMock).toHaveBeenCalledWith(2)
    expect(listSurveysMock).toHaveBeenCalledTimes(2)
    // 操作鈕上有 @click.stop，不可一併觸發列點擊導頁
    expect(pushMock).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
    w.unmount()
  })

  it('點列進詳情', async () => {
    const w = mountView()
    await flushPromises()

    await w.findAll('.el-table__body .survey-row')[0].trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'survey-detail', params: { id: 4 } })
    w.unmount()
  })

  it('搜尋標題即打即濾，篩無結果顯示提示而非空白', async () => {
    const w = mountView()
    await flushPromises()

    const input = w.find('.admin-list-toolbar input, input[placeholder="搜尋調查標題"]')
    await input.setValue('運動')
    await flushPromises()
    expect(rowTexts(w)).toHaveLength(1)
    expect(rowTexts(w)[0]).toContain('親子運動會')

    await input.setValue('不存在的調查')
    await flushPromises()
    expect(rowTexts(w)).toHaveLength(0)
    expect(w.text()).toContain('沒有符合條件的調查')
    w.unmount()
  })

  it('完全沒有調查時空狀態說明流程並提供建立入口', async () => {
    listSurveysMock.mockResolvedValue({ data: { items: [] } })
    const w = mountView()
    await flushPromises()

    expect(w.text()).toContain('還沒有任何調查')
    const cta = w.find('[data-test="survey-create-empty"]')
    expect(cta.exists()).toBe(true)
    await cta.trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'survey-new' })
    w.unmount()
  })

  it('手機改卡片：標題帶狀態、卡片可點進詳情、草稿有發布鈕', async () => {
    isMobile.value = true
    const w = mountView()
    await flushPromises()

    expect(w.find('.el-table').exists()).toBe(false)
    const cards = w.findAll('.alc-card')
    expect(cards).toHaveLength(4)
    expect(cards[0].text()).toContain('秋季戶外教學')
    expect(cards[0].text()).toContain('進行中')
    expect(cards[2].findAll('button').map((b) => b.text())).toEqual(['編輯', '發布'])

    await cards[0].trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'survey-detail', params: { id: 4 } })
    w.unmount()
  })
})
