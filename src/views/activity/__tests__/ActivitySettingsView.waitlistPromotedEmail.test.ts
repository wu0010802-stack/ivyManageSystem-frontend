import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import ElementPlus, { ElMessage } from 'element-plus'

const mockRoute = reactive<{ query: Record<string, unknown> }>({ query: {} })
const routerReplace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: vi.fn(), replace: routerReplace, back: vi.fn() }),
}))

vi.mock('@/api/activity', () => ({
  getRegistrationTime: vi.fn(),
  updateRegistrationTime: vi.fn(),
  uploadActivityPoster: vi.fn(),
  getWaitlistPromotedEmailTemplate: vi.fn(),
  updateWaitlistPromotedEmailTemplate: vi.fn(),
  testSendWaitlistPromotedEmail: vi.fn(),
  getRegistrationSuccessEmailTemplate: vi.fn(),
  updateRegistrationSuccessEmailTemplate: vi.fn(),
  testSendRegistrationSuccessEmail: vi.fn(),
}))

import {
  getRegistrationTime,
  getWaitlistPromotedEmailTemplate,
  updateWaitlistPromotedEmailTemplate,
  testSendWaitlistPromotedEmail,
  getRegistrationSuccessEmailTemplate,
  updateRegistrationSuccessEmailTemplate,
  testSendRegistrationSuccessEmail,
} from '@/api/activity'
import ActivitySettingsView from '../ActivitySettingsView.vue'

const TEMPLATE_RES = {
  subject: null,
  body: null,
  subject_default: '【義華幼兒園】候補已直升為正式報名（{student_name}）',
  body_default: '{student_name} 家長您好...',
  email_enabled: true,
}

const SUCCESS_TEMPLATE_RES = {
  subject: null,
  body: null,
  subject_default: '【義華幼兒園】課後才藝報名資料已送出（{student_name}）',
  body_default: '{student_name} 家長您好...',
  email_enabled: true,
}

function mountView() {
  return mount(ActivitySettingsView, {
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
  })
}

beforeEach(() => {
  mockRoute.query = {}
  vi.mocked(getRegistrationTime).mockResolvedValue({ data: { is_open: false } } as never)
  vi.mocked(getWaitlistPromotedEmailTemplate).mockResolvedValue({
    data: { ...TEMPLATE_RES },
  } as never)
  vi.mocked(updateWaitlistPromotedEmailTemplate).mockResolvedValue({
    data: { ...TEMPLATE_RES, subject: '自訂主旨', body: '自訂內文' },
  } as never)
  vi.mocked(testSendWaitlistPromotedEmail).mockResolvedValue({
    data: { message: '測試信已寄出至 staff@example.com' },
  } as never)
  vi.mocked(getRegistrationSuccessEmailTemplate).mockResolvedValue({
    data: { ...SUCCESS_TEMPLATE_RES },
  } as never)
  vi.mocked(updateRegistrationSuccessEmailTemplate).mockResolvedValue({
    data: { ...SUCCESS_TEMPLATE_RES, subject: '自訂主旨', body: '自訂內文' },
  } as never)
  vi.mocked(testSendRegistrationSuccessEmail).mockResolvedValue({
    data: { message: '測試信已寄出至 staff@example.com' },
  } as never)
  vi.spyOn(ElMessage, 'success').mockImplementation((() => {}) as never)
  vi.spyOn(ElMessage, 'error').mockImplementation((() => {}) as never)
  vi.spyOn(ElMessage, 'warning').mockImplementation((() => {}) as never)
})

describe('ActivitySettingsView — 候補直升正式通知信樣板', () => {
  it('掛載時載入樣板設定並顯示區塊標題', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(getWaitlistPromotedEmailTemplate).toHaveBeenCalled()
    expect(wrapper.text()).toContain('候補直升正式通知信樣板')
  })

  it('email 未啟用時顯示警告提示', async () => {
    vi.mocked(getWaitlistPromotedEmailTemplate).mockResolvedValueOnce({
      data: { ...TEMPLATE_RES, email_enabled: false },
    } as never)
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('尚未啟用 Email 寄送')
  })

  it('測試寄送：未輸入信箱時警告、不呼叫 API', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('[data-test="waitlist-email-test-send-btn"]').trigger('click')
    await flushPromises()

    expect(testSendWaitlistPromotedEmail).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith('請輸入測試收件信箱')
  })

  it('測試寄送成功：帶入目前表單內容並顯示成功訊息', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper
      .find('[data-test="waitlist-email-test-send-input"]')
      .setValue('staff@example.com')
    await wrapper.find('[data-test="waitlist-email-test-send-btn"]').trigger('click')
    await flushPromises()

    expect(testSendWaitlistPromotedEmail).toHaveBeenCalledWith({
      to_email: 'staff@example.com',
      subject: undefined,
      body: undefined,
    })
    expect(ElMessage.success).toHaveBeenCalledWith('測試信已寄出至 staff@example.com')
  })

  it('測試寄送失敗：顯示後端回傳的錯誤訊息', async () => {
    vi.mocked(testSendWaitlistPromotedEmail).mockRejectedValueOnce({
      response: { data: { detail: 'Email 寄送未啟用' } },
    })
    const wrapper = mountView()
    await flushPromises()

    await wrapper
      .find('[data-test="waitlist-email-test-send-input"]')
      .setValue('staff@example.com')
    await wrapper.find('[data-test="waitlist-email-test-send-btn"]').trigger('click')
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith('Email 寄送未啟用')
  })

  it('儲存樣板：呼叫 API 帶入表單目前主旨/內文', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper
      .find('[data-test="waitlist-email-body-input"]')
      .setValue('自訂內文')
    await wrapper
      .find('[data-test="waitlist-email-subject-input"]')
      .setValue('自訂主旨')
    await wrapper.find('[data-test="waitlist-email-save-btn"]').trigger('click')
    await flushPromises()

    expect(updateWaitlistPromotedEmailTemplate).toHaveBeenCalledWith({
      subject: '自訂主旨',
      body: '自訂內文',
    })
    expect(ElMessage.success).toHaveBeenCalledWith('樣板已儲存')
  })
})

describe('ActivitySettingsView — 報名成功通知信樣板', () => {
  it('掛載時載入樣板設定並顯示區塊標題', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(getRegistrationSuccessEmailTemplate).toHaveBeenCalled()
    expect(wrapper.text()).toContain('報名成功通知信樣板')
  })

  it('email 未啟用時顯示警告提示', async () => {
    vi.mocked(getRegistrationSuccessEmailTemplate).mockResolvedValueOnce({
      data: { ...SUCCESS_TEMPLATE_RES, email_enabled: false },
    } as never)
    const wrapper = mountView()
    await flushPromises()

    const alerts = wrapper.findAll('.el-alert--warning')
    expect(alerts.length).toBeGreaterThan(0)
  })

  it('測試寄送：未輸入信箱時警告、不呼叫 API', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('[data-test="success-email-test-send-btn"]').trigger('click')
    await flushPromises()

    expect(testSendRegistrationSuccessEmail).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith('請輸入測試收件信箱')
  })

  it('測試寄送成功：帶入目前表單內容並顯示成功訊息', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper
      .find('[data-test="success-email-test-send-input"]')
      .setValue('staff@example.com')
    await wrapper.find('[data-test="success-email-test-send-btn"]').trigger('click')
    await flushPromises()

    expect(testSendRegistrationSuccessEmail).toHaveBeenCalledWith({
      to_email: 'staff@example.com',
      subject: undefined,
      body: undefined,
    })
    expect(ElMessage.success).toHaveBeenCalledWith('測試信已寄出至 staff@example.com')
  })

  it('儲存樣板：呼叫 API 帶入表單目前主旨/內文', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper
      .find('[data-test="success-email-body-input"]')
      .setValue('自訂內文')
    await wrapper
      .find('[data-test="success-email-subject-input"]')
      .setValue('自訂主旨')
    await wrapper.find('[data-test="success-email-save-btn"]').trigger('click')
    await flushPromises()

    expect(updateRegistrationSuccessEmailTemplate).toHaveBeenCalledWith({
      subject: '自訂主旨',
      body: '自訂內文',
    })
    expect(ElMessage.success).toHaveBeenCalledWith('樣板已儲存')
  })
})

describe('ActivitySettingsView — tabs 切換與 query string 同步', () => {
  it('預設顯示報名設定 tab，不帶 query', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('報名開關')
  })

  it('切到候補轉正信 tab 時，query 寫入 tab=waitlistEmail', async () => {
    const wrapper = mountView()
    await flushPromises()

    const tabs = wrapper.findAllComponents({ name: 'ElTabPane' })
    const waitlistPane = tabs.find((t) => t.props('name') === 'waitlistEmail')
    expect(waitlistPane).toBeTruthy()

    // 直接呼叫 tab 元件的 change 事件較脆弱，改為模擬點擊分頁標籤
    const tabLabel = wrapper.findAll('.el-tabs__item').find((el) => el.text() === '候補轉正信模板')
    expect(tabLabel).toBeTruthy()
    await tabLabel!.trigger('click')
    await flushPromises()

    expect(routerReplace).toHaveBeenCalledWith({ query: { tab: 'waitlistEmail' } })
  })

  it('從 query tab=successEmail 進入時，預設開啟報名成功模板 tab', async () => {
    mockRoute.query = { tab: 'successEmail' }
    const wrapper = mountView()
    await flushPromises()

    const activePane = wrapper.find('.el-tab-pane')
    expect(wrapper.vm.$el).toBeTruthy()
    // 標籤本身應標示為 active
    const activeLabel = wrapper.findAll('.el-tabs__item.is-active')[0]
    expect(activeLabel?.text()).toBe('報名成功模板')
    expect(activePane).toBeTruthy()
  })
})
