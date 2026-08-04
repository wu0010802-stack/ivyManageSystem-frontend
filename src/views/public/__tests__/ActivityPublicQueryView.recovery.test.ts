/**
 * 「忘記查詢碼」三欄唯讀查詢流程（2026-08-04）。
 *
 * 業主裁定：姓名＋班級＋手機是熟人圈容易取得的資訊，三欄比對成功**只能檢視**，
 * 畫面永遠不顯示查詢碼；查詢碼（＝完整編修權限）只在報名有留 email 時寄到該
 * 信箱。本檔守住唯讀 hydrate（canMutate=false 整套鎖定 UI 生效）與提示分流。
 */
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/api/activityPublic', () => ({
  publicQueryByToken: vi.fn(),
  publicQueryByIdentity: vi.fn(),
  publicUpdateRegistration: vi.fn(),
  publicConfirmPromotion: vi.fn(),
  publicDeclinePromotion: vi.fn(),
  getPublicBootstrap: vi.fn(),
  getPublicCoursesAvailability: vi.fn(),
}))

import {
  getPublicBootstrap,
  getPublicCoursesAvailability,
  publicQueryByIdentity,
  publicQueryByToken,
} from '@/api/activityPublic'
import ActivityPublicQueryView from '../ActivityPublicQueryView.vue'

// 後端三欄端點出口一律強制 query_token_required=true（唯讀鎖第 1 層）
const REGISTRATION_DETAIL = {
  id: 7,
  name: '王小明',
  birthday: '',
  class_name: '大象班',
  school_year: 115,
  semester: 1,
  parent_phone: '0912345678',
  courses: [{ name: '圍棋', course_id: 1, price: 3000, status: 'enrolled' }],
  supplies: [],
  total_amount: 3000,
  paid_amount: 0,
  payment_status: 'unpaid',
  remark: '',
  query_token_required: true,
  is_paid: false,
  field_state: {
    class_source: 'student_record',
    class_editable: false,
    review_state: 'confirmed',
    identity_editable: false,
  },
}

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

    expect(publicQueryByIdentity).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('請完整填寫三項資料')
  })
})

describe('唯讀查詢結果', () => {
  it('比對成功載入唯讀明細：不呼叫查詢碼端點、查詢欄不被填入任何 token', async () => {
    vi.mocked(publicQueryByIdentity).mockResolvedValue({
      data: {
        registration: REGISTRATION_DETAIL,
        token_email_sent: false,
        masked_email: null,
      },
    } as never)
    const wrapper = await mountAndOpenRecovery()
    await fillRecoveryForm(wrapper)

    await wrapper.find('[data-test="recovery-submit"]').trigger('click')
    await flushPromises()

    expect(publicQueryByIdentity).toHaveBeenCalledWith({
      name: '王小明',
      class: '大象班',
      parent_phone: '0912345678',
      _hp: '',
    })
    // 唯讀契約：不接查詢碼流程、查詢欄保持空白（畫面上沒有任何 token 可抄）
    expect(publicQueryByToken).not.toHaveBeenCalled()
    expect((wrapper.find('#searchToken').element as HTMLInputElement).value).toBe('')
    // 結果已載入且鎖成僅供檢視（鎖定提示＋儲存鍵 disabled＝canMutate=false 生效）
    expect(wrapper.text()).toContain('圍棋')
    expect(wrapper.text()).toContain('此報名需使用「報名時取得的查詢連結」才能修改')
    const saveBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('儲存修改'))
    expect(saveBtn).toBeTruthy()
    expect(saveBtn!.attributes('disabled')).toBeDefined()
    // 面板收合，持久提示顯示「僅供檢視」
    expect(wrapper.find('#recoveryPanel').exists()).toBe(false)
    const notice = wrapper.find('[data-test="identity-query-notice"]')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toContain('僅供檢視')
    expect(notice.text()).toContain('聯繫校方')
  })

  it('有留 email：提示查詢碼已寄到遮罩信箱', async () => {
    vi.mocked(publicQueryByIdentity).mockResolvedValue({
      data: {
        registration: REGISTRATION_DETAIL,
        token_email_sent: true,
        masked_email: 'p***@example.com',
      },
    } as never)
    const wrapper = await mountAndOpenRecovery()
    await fillRecoveryForm(wrapper)

    await wrapper.find('[data-test="recovery-submit"]').trigger('click')
    await flushPromises()

    const notice = wrapper.find('[data-test="identity-query-notice"]')
    expect(notice.text()).toContain('p***@example.com')
    expect(notice.text()).toContain('僅供檢視')
    expect((wrapper.find('#searchToken').element as HTMLInputElement).value).toBe('')
  })

  it('改用查詢碼重新查詢時清掉三欄提示', async () => {
    vi.mocked(publicQueryByIdentity).mockResolvedValue({
      data: {
        registration: REGISTRATION_DETAIL,
        token_email_sent: false,
        masked_email: null,
      },
    } as never)
    vi.mocked(publicQueryByToken).mockResolvedValue({
      data: { ...REGISTRATION_DETAIL, query_token_required: true },
    } as never)
    const wrapper = await mountAndOpenRecovery()
    await fillRecoveryForm(wrapper)
    await wrapper.find('[data-test="recovery-submit"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="identity-query-notice"]').exists()).toBe(true)

    await wrapper.find('#searchToken').setValue('a-valid-token-from-email')
    await wrapper.find('#searchPhone').setValue('0912345678')
    await wrapper.find('[data-test="query-submit"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="identity-query-notice"]').exists()).toBe(false)
  })

  it('比對失敗顯示通用訊息，不透露是哪一欄不符', async () => {
    vi.mocked(publicQueryByIdentity).mockRejectedValue({
      response: { data: { detail: '查無對應報名，請確認三項資料是否與報名時一致' } },
    })
    const wrapper = await mountAndOpenRecovery()
    await fillRecoveryForm(wrapper, { name: '王大明' })

    await wrapper.find('[data-test="recovery-submit"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('查無對應報名，請確認三項資料是否與報名時一致')
    expect(wrapper.find('[data-test="identity-query-notice"]').exists()).toBe(false)
    expect(publicQueryByToken).not.toHaveBeenCalled()
  })
})
