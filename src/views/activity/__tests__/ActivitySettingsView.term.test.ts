/**
 * 報名設定頁「開放學期」欄位（2026-07-31）。
 *
 * Bug：課程與用品有學期，報名與通知設定沒有，前台未帶學期參數時只能依系統日期
 * 推算當期 → 管理員在 7 月建好下學期課程並開放報名，前台卻顯示上一學期的清單。
 * 修法是把學期存進報名設定，這裡守住表單載入與送出兩端不漏欄位。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import ElementPlus from 'element-plus'

const mockRoute = reactive<{ query: Record<string, unknown> }>({ query: {} })
vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return {
    ...actual,
    ElMessage: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
    // 儲存確認框直接放行，測試聚焦在送出的 payload
    ElMessageBox: { confirm: vi.fn().mockResolvedValue('confirm') },
  }
})

// 課程與用品併入本頁後（2026-07-31），報名設定 tab 要 ACTIVITY_WRITE 才渲染。
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

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
  updateRegistrationTime,
  getWaitlistPromotedEmailTemplate,
  getRegistrationSuccessEmailTemplate,
} from '@/api/activity'
import ActivitySettingsView from '../ActivitySettingsView.vue'

const EMPTY_TEMPLATE = {
  subject: null,
  body: null,
  subject_default: '預設主旨',
  body_default: '預設內文',
  email_enabled: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  // 預設 tab 已改為「課程管理」，本檔聚焦報名設定表單，一律顯式帶 tab=registration
  mockRoute.query = { tab: 'registration' }
  vi.mocked(getWaitlistPromotedEmailTemplate).mockResolvedValue({
    data: { ...EMPTY_TEMPLATE },
  } as never)
  vi.mocked(getRegistrationSuccessEmailTemplate).mockResolvedValue({
    data: { ...EMPTY_TEMPLATE },
  } as never)
  vi.mocked(updateRegistrationTime).mockResolvedValue({ data: { message: 'ok' } } as never)
})

async function mountWithSettings(data: Record<string, unknown>) {
  vi.mocked(getRegistrationTime).mockResolvedValue({ data } as never)
  const wrapper = mount(ActivitySettingsView, {
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  return wrapper
}

async function savedPayload(wrapper: ReturnType<typeof mount>) {
  const buttons = wrapper.findAll('button')
  const saveBtn = buttons.find((b) => b.text().includes('儲存設定'))
  expect(saveBtn).toBeDefined()
  await saveBtn!.trigger('click')
  await flushPromises()
  expect(updateRegistrationTime).toHaveBeenCalledTimes(1)
  return vi.mocked(updateRegistrationTime).mock.calls[0][0]
}

describe('ActivitySettingsView 開放學期', () => {
  it('載入既有學期後原樣送回（不會在往返中被清成 null）', async () => {
    const wrapper = await mountWithSettings({
      school_year: 115,
      semester: 1,
    })

    const payload = await savedPayload(wrapper)
    expect(payload.school_year).toBe(115)
    expect(payload.semester).toBe(1)
  })

  it('後端未設定學期時送出 null，維持依系統日期推算當期的舊行為', async () => {
    const wrapper = await mountWithSettings({})

    const payload = await savedPayload(wrapper)
    expect(payload.school_year).toBeNull()
    expect(payload.semester).toBeNull()
  })

  it('選單顯示已儲存的學期，即使它不在當期前後一期的預設選項內', async () => {
    const wrapper = await mountWithSettings({
      school_year: 100,
      semester: 2,
    })

    expect(wrapper.text()).toContain('100 學年度 下學期')
  })
})
