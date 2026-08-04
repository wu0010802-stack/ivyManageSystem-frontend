/**
 * 「忘記查詢碼」找回流程（2026-08-04）。
 *
 * 生日欄移除後查詢碼是唯一自助途徑，而 email 為選填 → 沒填的家長忘記查詢碼即
 * 完全查不到。本檔守住兩條投遞路徑的 UI 分流與「不得把查詢碼顯示在寄信路徑」。
 */
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/api/activityPublic', () => ({
  publicQueryByToken: vi.fn(),
  publicRecoverQueryToken: vi.fn(),
  publicUpdateRegistration: vi.fn(),
  publicConfirmPromotion: vi.fn(),
  publicDeclinePromotion: vi.fn(),
  getPublicBootstrap: vi.fn(),
  getPublicCoursesAvailability: vi.fn(),
}))

import {
  getPublicBootstrap,
  getPublicCoursesAvailability,
  publicQueryByToken,
  publicRecoverQueryToken,
} from '@/api/activityPublic'
import ActivityPublicQueryView from '../ActivityPublicQueryView.vue'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPublicBootstrap).mockResolvedValue({
    data: {
      courses: [{ name: '圍棋', price: 3000 }],
      supplies: [],
      classes: ['大象班', '長頸鹿班'],
      course_videos: {},
    },
  } as never)
  vi.mocked(getPublicCoursesAvailability).mockResolvedValue({ data: {} } as never)
  vi.mocked(publicQueryByToken).mockResolvedValue({
    data: {
      id: 7,
      name: '王小明',
      birthday: '',
      class_name: '大象班',
      school_year: 115,
      semester: 1,
      courses: [],
      supplies: [],
      total_amount: 0,
      paid_amount: 0,
    },
  } as never)
})

async function mountAndOpenRecovery() {
  const wrapper = mount(ActivityPublicQueryView)
  await flushPromises()
  await wrapper.find('[data-test="recovery-toggle"]').trigger('click')
  return wrapper
}

async function fillRecoveryForm(
  wrapper: Awaited<ReturnType<typeof mountAndOpenRecovery>>,
  { name = '王小明', className = '大象班', phone = '0912345678' } = {},
) {
  await wrapper.find('#recoveryName').setValue(name)
  await wrapper.find('#recoveryClass').setValue(className)
  await wrapper.find('#recoveryPhone').setValue(phone)
}

describe('忘記查詢碼入口', () => {
  it('預設收合，點擊後展開三欄表單', async () => {
    const wrapper = mount(ActivityPublicQueryView)
    await flushPromises()

    expect(wrapper.find('#recoveryPanel').exists()).toBe(false)

    await wrapper.find('[data-test="recovery-toggle"]').trigger('click')

    expect(wrapper.find('#recoveryPanel').exists()).toBe(true)
    expect(wrapper.find('#recoveryName').exists()).toBe(true)
    expect(wrapper.find('#recoveryClass').exists()).toBe(true)
    expect(wrapper.find('#recoveryPhone').exists()).toBe(true)
    // 班級走下拉，選項來自 bootstrap，家長不需要記得班名的確切寫法
    expect(wrapper.findAll('#recoveryClass option').map((o) => o.text())).toContain('大象班')
  })

  it('展開時沿用上方已填的手機，家長不必重打', async () => {
    const wrapper = mount(ActivityPublicQueryView)
    await flushPromises()
    await wrapper.find('#searchPhone').setValue('0955666777')

    await wrapper.find('[data-test="recovery-toggle"]').trigger('click')

    expect((wrapper.find('#recoveryPhone').element as HTMLInputElement).value).toBe('0955666777')
  })

  it('三欄未填完不送出請求', async () => {
    const wrapper = await mountAndOpenRecovery()
    await wrapper.find('#recoveryName').setValue('王小明')

    await wrapper.find('[data-test="recovery-submit"]').trigger('click')
    await flushPromises()

    expect(publicRecoverQueryToken).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('請完整填寫三項資料')
  })
})

describe('投遞路徑分流', () => {
  it('沒留 email：查詢碼填回查詢欄並自動查詢', async () => {
    vi.mocked(publicRecoverQueryToken).mockResolvedValue({
      data: { delivery: 'shown', query_token: 'recovered-token-123', masked_email: null },
    } as never)
    const wrapper = await mountAndOpenRecovery()
    await fillRecoveryForm(wrapper)

    await wrapper.find('[data-test="recovery-submit"]').trigger('click')
    await flushPromises()

    expect(publicRecoverQueryToken).toHaveBeenCalledWith({
      name: '王小明',
      class: '大象班',
      parent_phone: '0912345678',
      _hp: '',
    })
    expect((wrapper.find('#searchToken').element as HTMLInputElement).value).toBe(
      'recovered-token-123',
    )
    expect(publicQueryByToken).toHaveBeenCalledWith('recovered-token-123', '0912345678')
    // 找回後面板收合，避免家長以為還要再送一次
    expect(wrapper.find('#recoveryPanel').exists()).toBe(false)
  })

  it('有留 email：只顯示遮罩信箱，畫面不得出現查詢碼、不自動查詢', async () => {
    vi.mocked(publicRecoverQueryToken).mockResolvedValue({
      data: { delivery: 'email', query_token: null, masked_email: 'p***@example.com' },
    } as never)
    const wrapper = await mountAndOpenRecovery()
    await fillRecoveryForm(wrapper)

    await wrapper.find('[data-test="recovery-submit"]').trigger('click')
    await flushPromises()

    const sent = wrapper.find('[data-test="recovery-sent"]')
    expect(sent.exists()).toBe(true)
    expect(sent.text()).toContain('p***@example.com')
    expect((wrapper.find('#searchToken').element as HTMLInputElement).value).toBe('')
    expect(publicQueryByToken).not.toHaveBeenCalled()
  })

  it('比對失敗顯示通用訊息，不透露是哪一欄不符', async () => {
    vi.mocked(publicRecoverQueryToken).mockRejectedValue({
      response: { data: { detail: '查無對應報名，請確認三項資料是否與報名時一致' } },
    })
    const wrapper = await mountAndOpenRecovery()
    await fillRecoveryForm(wrapper, { name: '王大明' })

    await wrapper.find('[data-test="recovery-submit"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('查無對應報名，請確認三項資料是否與報名時一致')
    expect(wrapper.find('[data-test="recovery-sent"]').exists()).toBe(false)
    expect(publicQueryByToken).not.toHaveBeenCalled()
  })
})
