import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessage } from 'element-plus'

vi.mock('@/api/activity', () => ({
  getRegistrationTime: vi.fn(),
  updateRegistrationTime: vi.fn(),
  uploadActivityPoster: vi.fn(),
  getWaitlistPromotedEmailTemplate: vi.fn(),
  updateWaitlistPromotedEmailTemplate: vi.fn(),
  testSendWaitlistPromotedEmail: vi.fn(),
}))

import {
  getRegistrationTime,
  getWaitlistPromotedEmailTemplate,
  updateWaitlistPromotedEmailTemplate,
  testSendWaitlistPromotedEmail,
} from '@/api/activity'
import ActivitySettingsView from '../ActivitySettingsView.vue'

const TEMPLATE_RES = {
  subject: null,
  body: null,
  subject_default: '【義華幼兒園】候補已直升為正式報名（{student_name}）',
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
