import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

// ── 模擬 vue-router（view 用 useRoute 取 query.token）──────────────────────
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

// ── 模擬 API ──────────────────────────────────────────────────────────────
vi.mock('@/api/activityPublic', () => ({
  publicQueryByToken: vi.fn(),
  publicQueryRegistration: vi.fn(),
  publicUpdateRegistration: vi.fn(),
  publicConfirmPromotion: vi.fn(),
  publicDeclinePromotion: vi.fn(),
  getPublicBootstrap: vi.fn().mockResolvedValue({
    data: { courses: [], supplies: [], classes: [], course_videos: {} },
  }),
  getPublicCoursesAvailability: vi.fn().mockResolvedValue({ data: {} }),
}))

import {
  publicQueryByToken,
  publicUpdateRegistration,
  getPublicBootstrap,
} from '@/api/activityPublic'

vi.mock('@/utils/arrayUtils', () => ({
  toggleArrayItem: (arr: string[], item: string) => {
    const i = arr.indexOf(item)
    if (i >= 0) arr.splice(i, 1)
    else arr.push(item)
  },
}))

function mockBootstrap({
  courses = [] as Array<{ name: string; price: number }>,
  supplies = [] as Array<{ name: string; price: number }>,
  classes = ['大班'],
  registrationTime,
}: {
  courses?: Array<{ name: string; price: number }>
  supplies?: Array<{ name: string; price: number }>
  classes?: string[]
  registrationTime?: {
    is_open?: boolean
    open_at?: string | null
    close_at?: string | null
  }
} = {}) {
  vi.mocked(getPublicBootstrap).mockResolvedValue({
    data: {
      courses,
      supplies,
      classes,
      course_videos: {},
      registration_time: registrationTime,
    },
  })
}

const mountView = async (): Promise<VueWrapper> => {
  const ActivityPublicQueryView = (await import('../ActivityPublicQueryView.vue')).default
  return mount(ActivityPublicQueryView, {
    global: {
      stubs: ['router-link', 'router-view'],
    },
  })
}

/** 切到 token 模式、填入合法查詢碼與手機後觸發查詢（同 waitlist 測試慣例） */
async function triggerTokenQuery(wrapper: VueWrapper) {
  const tabs = wrapper.findAll('.mode-tab')
  await tabs[0].trigger('click')

  const vm = wrapper.vm as unknown as {
    queryForm: { token: string; parent_phone: string }
    $nextTick: () => Promise<void>
  }
  vm.queryForm.token = 'TESTTOKEN123'
  vm.queryForm.parent_phone = '0912345678'
  await vm.$nextTick()

  await wrapper.find('[data-test="query-submit"]').trigger('click')
  await new Promise((r) => setTimeout(r, 0))
}

const LOCK_HINT =
  '此筆報名已完成付款，為保障金流與資料一致性，無法於前台直接修改，如需異動請聯繫校方協助處理。'

const seedPaidRegistration = (overrides: Record<string, unknown> = {}) => {
  vi.mocked(publicQueryByToken).mockResolvedValue({
    data: {
      id: 1,
      name: '王小明',
      birthday: '2020-01-01',
      class_name: '大班',
      parent_phone: '0912345678',
      courses: [{ course_id: 1, name: '美術', status: 'enrolled', price: 3000 }],
      supplies: [{ name: '舞鞋', price: 500 }],
      total_amount: 3500,
      paid_amount: 3500,
      is_paid: true,
      ...overrides,
    },
  })
}

describe('ActivityPublicQueryView — 已付款訂單整單唯讀鎖定（is_paid=true）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBootstrap({
      courses: [
        { name: '美術', price: 3000 },
        { name: '陶藝', price: 2000 },
      ],
      supplies: [{ name: '舞鞋', price: 500 }],
    })
  })

  it('鎖定提示文字出現，編輯表單控制項與儲存按鈕不渲染', async () => {
    seedPaidRegistration()

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    // 鎖定提示
    expect(wrapper.find('[data-test="payment-locked-hint"]').exists()).toBe(true)
    expect(wrapper.text()).toContain(LOCK_HINT)

    // 編輯區特有控制項全數不渲染
    expect(wrapper.find('.input-select').exists()).toBe(false)
    expect(wrapper.find('#editNewPhone').exists()).toBe(false)
    expect(wrapper.findAll('.course-item input[type="checkbox"]')).toHaveLength(0)

    // 動作按鈕（儲存修改 / 取消）不渲染
    expect(wrapper.find('.action-buttons').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('儲存修改')

    // 費用預覽與 canMutate 提示不渲染
    expect(wrapper.find('.fee-preview').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('您可以修改以下資料')
  })

  it('既有資料（姓名/生日/班級/手機/課程/用品）以純文字呈現', async () => {
    seedPaidRegistration()

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    const summary = wrapper.find('[data-test="payment-locked-summary"]')
    expect(summary.exists()).toBe(true)

    const txt = summary.text()
    expect(txt).toContain('王小明')
    expect(txt).toContain('2020-01-01')
    expect(txt).toContain('大班')
    expect(txt).toContain('0912345678')
    expect(txt).toContain('美術')
    expect(txt).toContain('舞鞋')

    // 摘要內不得出現任何表單控制項
    expect(summary.findAll('input')).toHaveLength(0)
    expect(summary.findAll('select')).toHaveLength(0)
  })

  it('supplies 舊資料為 string 時仍以文字呈現（容錯）', async () => {
    seedPaidRegistration({ supplies: ['畫具組'] })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    expect(wrapper.find('[data-test="payment-locked-summary"]').text()).toContain('畫具組')
  })
})

describe('ActivityPublicQueryView — is_paid=false 既有可編輯行為不受影響（回歸）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBootstrap({
      courses: [
        { name: '美術', price: 3000 },
        { name: '陶藝', price: 2000 },
      ],
      supplies: [{ name: '舞鞋', price: 500 }],
    })
  })

  it('編輯表單、費用預覽與儲存按鈕照常渲染，鎖定提示不出現', async () => {
    seedPaidRegistration({ is_paid: false, paid_amount: 1000 })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    expect(wrapper.find('[data-test="payment-locked-hint"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="payment-locked-summary"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain(LOCK_HINT)

    // 既有可編輯 UI 原樣
    expect(wrapper.text()).toContain('您可以修改以下資料')
    expect(wrapper.findAll('.course-item input[type="checkbox"]').length).toBeGreaterThan(0)
    expect(wrapper.find('#editNewPhone').exists()).toBe(true)
    expect(wrapper.find('.action-buttons').exists()).toBe(true)
    expect(wrapper.text()).toContain('儲存修改')
    expect(wrapper.find('.fee-preview').exists()).toBe(true)
  })

  it('is_paid 欄位缺漏（舊後端）視同未鎖定', async () => {
    seedPaidRegistration({ is_paid: undefined })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    expect(wrapper.find('[data-test="payment-locked-hint"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('儲存修改')
  })

  it('待審核候補明示課程費須待審核結果，不把目前 0 元當成最終應繳', async () => {
    seedPaidRegistration({
      is_paid: false,
      paid_amount: 0,
      total_amount: 0,
      school_year: 114,
      semester: 2,
      courses: [{
        course_id: 9,
        name: '鋼琴',
        status: 'pending_review_waitlist',
        price: 1200,
      }],
      supplies: [],
      field_state: {
        identity_editable: true,
        class_editable: true,
        review_state: 'school_review',
      },
    })
    mockBootstrap({
      courses: [{ name: '鋼琴', price: 1200 }],
      classes: ['大班'],
    })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    const note = wrapper.get('[data-test="pending-review-pricing-note"]')
    expect(note.text()).toContain('審核結果')
    expect(note.text()).toContain('實際應繳')
    expect(wrapper.text()).toContain('目前已確定應繳')
  })

  it('查詢後搜尋欄被改動，儲存仍使用命中結果的原始手機與 token', async () => {
    seedPaidRegistration({
      is_paid: false,
      paid_amount: 0,
      query_token_required: true,
      // v3（4c58baa4）起 editorReady 依 school_year/semester 判斷 catalog 是否已
      // 載入對應學期，缺此二欄會讓 editorReady 永遠為 false → saveBlocked 誤鎖，
      // 儲存按鈕被 disabled、click 不觸發 handler（此為本測試失敗根因，非儲存
      // mutation 邏輯本身的 bug）。
      school_year: 113,
      semester: 1,
    })
    vi.mocked(publicUpdateRegistration).mockResolvedValue({
      data: {
        id: 1,
        name: '王小明',
        birthday: '2020-01-01',
        class_name: '大班',
        courses: [{ course_id: 1, name: '美術', status: 'enrolled', price: 3000 }],
        supplies: [{ name: '舞鞋', price: 500 }],
        total_amount: 3500,
        paid_amount: 0,
        is_paid: false,
        query_token_required: true,
      },
    })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)
    const vm = wrapper.vm as unknown as {
      queryForm: { token: string; parent_phone: string }
      $nextTick: () => Promise<void>
    }
    vm.queryForm.token = 'TOKEN_CHANGED_AFTER_QUERY'
    vm.queryForm.parent_phone = '0987654321'
    await vm.$nextTick()

    const save = wrapper.findAll('.action-buttons button').find((button) =>
      button.text().includes('儲存修改'),
    )
    expect(save).toBeDefined()
    await save!.trigger('click')
    await flushPromises()

    expect(publicUpdateRegistration).toHaveBeenCalledWith(expect.objectContaining({
      parent_phone: '0912345678',
      query_token: 'TESTTOKEN123',
    }))
  })
})

describe('ActivityPublicQueryView — 報名截止後唯讀', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('close_at 已過期時顯示截止提示與唯讀摘要，不渲染儲存控制項', async () => {
    mockBootstrap({
      courses: [{ name: '美術', price: 3000 }],
      supplies: [{ name: '舞鞋', price: 500 }],
      registrationTime: {
        is_open: true,
        open_at: null,
        close_at: '2000-01-01T00:00:00Z',
      },
    })
    seedPaidRegistration({ is_paid: false, paid_amount: 0 })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    expect(wrapper.find('[data-test="registration-closed-hint"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('報名已截止')
    expect(wrapper.find('[data-test="payment-locked-summary"]').exists()).toBe(true)
    expect(wrapper.find('.action-buttons').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('儲存修改')
  })
})

describe('ActivityPublicQueryView — is_paid=true 時候補相關區塊不受鎖定影響', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBootstrap({ courses: [{ name: '美術', price: 3000 }] })
  })

  it('候補中課程的位次摘要照常顯示', async () => {
    seedPaidRegistration({
      courses: [
        { course_id: 1, name: '美術', status: 'enrolled', price: 3000 },
        {
          course_id: 2,
          name: '陶藝',
          status: 'waitlist',
          waitlist_position: 2,
          waitlist_total: 6,
        },
      ],
    })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    // 鎖定生效
    expect(wrapper.find('[data-test="payment-locked-hint"]').exists()).toBe(true)

    // 候補位次摘要獨立於鎖定判斷之外，照常渲染
    const summary = wrapper.find('[data-test="waitlist-summary"]')
    expect(summary.exists()).toBe(true)
    expect(summary.text()).toContain('陶藝')
    expect(summary.text()).toMatch(/第\s*2\s*位/)
    expect(summary.text()).toMatch(/共\s*6\s*位/)
  })

  it('待審核候補在唯讀摘要顯示審核語意，不冒用正式候補順位', async () => {
    seedPaidRegistration({
      courses: [
        {
          course_id: 4,
          name: '直排輪',
          status: 'pending_review_waitlist',
          waitlist_position: 1,
          waitlist_total: 2,
        },
      ],
    })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    const lockedSummary = wrapper.get('[data-test="payment-locked-summary"]')
    expect(lockedSummary.text()).toContain('直排輪')
    expect(lockedSummary.text()).toContain('待審核候補')
    expect(wrapper.text()).not.toMatch(/目前第\s*1\s*位/)
  })

  it('唯讀課程摘要只有正式課程顯示金額，其餘狀態明示未計費', async () => {
    seedPaidRegistration({
      courses: [
        { course_id: 1, name: '美術', status: 'enrolled', price: 3000 },
        { course_id: 2, name: '足球', status: 'promoted_pending', price: 2800 },
        { course_id: 3, name: '鋼琴', status: 'pending_review', price: 2600 },
        {
          course_id: 4,
          name: '直排輪',
          status: 'pending_review_waitlist',
          price: 2400,
        },
        { course_id: 5, name: '陶藝', status: 'waitlist', price: 2200 },
      ],
    })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    const rows = wrapper
      .get('[data-test="payment-locked-summary"]')
      .findAll('.readonly-list')[0]
      .findAll('li')
      .map((row) => row.text())

    expect(rows).toEqual([
      expect.stringMatching(/美術.*\$3000.*正式/),
      expect.stringMatching(/足球.*未計費.*待家長確認/),
      expect.stringMatching(/鋼琴.*未計費.*待審核/),
      expect.stringMatching(/直排輪.*未計費.*待審核候補/),
      expect.stringMatching(/陶藝.*未計費.*候補/),
    ])
    expect(rows.slice(1).join(' ')).not.toMatch(/\$(?:2800|2600|2400|2200)/)
  })

  it('候補已升正式待確認的確認/放棄按鈕照常顯示（非目標範圍）', async () => {
    seedPaidRegistration({
      courses: [
        { course_id: 1, name: '美術', status: 'enrolled', price: 3000 },
        {
          course_id: 3,
          name: '足球',
          status: 'promoted_pending',
          confirm_deadline: '2099-12-31T23:59:00+08:00',
        },
      ],
    })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    expect(wrapper.find('[data-test="payment-locked-hint"]').exists()).toBe(true)

    // 候補轉正確認卡片仍照常渲染，確認/放棄操作不被付款鎖定擋下
    expect(wrapper.text()).toContain('您有候補已升為正式')
    const actionTexts = wrapper.findAll('.promotion-card-actions button').map((b) => b.text())
    expect(actionTexts.some((t) => t.includes('確認參加'))).toBe(true)
    expect(actionTexts.some((t) => t.includes('放棄此位'))).toBe(true)
  })
})
