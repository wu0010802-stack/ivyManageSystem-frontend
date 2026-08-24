import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import POSSearchPanel from '../POSSearchPanel.vue'

// STATE-04：待審核報名（課程 status='pending_review'／'promoted_pending'，
// registration.total_amount 因此為 0）會被後端 outstanding 清單刻意放行，讓收銀員
// 「看得見人」防漏收；但 POST /pos/checkout 對收款是**結構性拒收**——
// `total_amount_pre <= 0` 直接 400「無應繳金額，無法收款」。
//
// 舊版 UI 讓這一列可勾、可輸入金額、可送出：櫃台收了家長的現金才吃到 400，
// 現金已在手上、系統零紀錄，畫面也沒說下一步該去哪。
//
// 修法＝兩端對「能不能收款」給同一個答案：收款模式下 `total_amount <= 0` 的列
// 不可勾選，並就地說明原因與下一步。退費模式（守衛是 amount <= paid，與 total
// 無關）與一般未結清報名的行為不得改變。

const slotStub = (tag = 'div') => ({ template: `<${tag}><slot /></${tag}>` })

function flatGroup(overrides: Record<string, unknown> = {}) {
  return {
    student_key: '王小明|大班',
    student_name: '王小明',
    class_name: '大班',
    group_owed_total: 2000,
    registrations: [
      {
        id: 101,
        class_name: '大班',
        courses: [{ name: '美術' }],
        supplies: [],
        total_amount: 2000,
        paid_amount: 0,
        owed: 2000,
        pending_review: false,
        pending_amount: 0,
        ...overrides,
      },
    ],
  }
}

/** 待審核且完全未計費的報名（後端 total=0 → 收款必 400） */
const PENDING_ONLY = {
  pending_review: true,
  pending_amount: 1200,
  total_amount: 0,
  paid_amount: 0,
  owed: 0,
}

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(POSSearchPanel, {
    props: {
      mode: 'by-student',
      searchQuery: '',
      classroomOptions: [],
      groups: [flatGroup()],
      ...props,
    },
    global: {
      directives: { loading: {} },
      stubs: {
        'el-card': slotStub(),
        'el-scrollbar': slotStub(),
        'el-radio-group': slotStub(),
        'el-radio-button': slotStub('span'),
        'el-input': true,
        'el-alert': true,
        'el-checkbox': true,
        'el-button': true,
        'el-tag': slotStub('span'),
        'el-check-tag': slotStub('span'),
      },
    },
  })
}

function checkboxes(wrapper: ReturnType<typeof mountPanel>) {
  return wrapper.findAll('el-checkbox-stub')
}

// el-checkbox 被 stub 成 `<el-checkbox-stub disabled="true|false">`，
// 兩種狀態都會印出屬性，所以一律比對字串而非 toBeDefined。
function isDisabled(el: { attributes: (k: string) => string | undefined }) {
  return el.attributes('disabled') === 'true'
}

describe('POSSearchPanel：待審核報名在收款模式不可勾選（STATE-04）', () => {
  it('收款模式：待審核（total=0）列的 checkbox 為 disabled', () => {
    const wrapper = mountPanel({ groups: [flatGroup(PENDING_ONLY)] })
    expect(isDisabled(checkboxes(wrapper)[0])).toBe(true)
  })

  it('收款模式：點擊待審核列不得觸發 toggle（現金已收才吃 400 的來源）', async () => {
    const wrapper = mountPanel({ groups: [flatGroup(PENDING_ONLY)] })
    await wrapper.find('.pos-reg').trigger('click')
    expect(wrapper.emitted('toggle')).toBeUndefined()
  })

  it('收款模式：待審核列就地說明原因與下一步（不是只變灰）', () => {
    const wrapper = mountPanel({ groups: [flatGroup(PENDING_ONLY)] })
    const text = wrapper.text()
    expect(text).toContain('審核')
    expect(text).toContain('報名管理')
    expect(text).toContain('才能收款')
  })

  it('收款模式：tag 保留「待確認 NT$X」（防漏收資訊）但不讀成「請收這個數字」', () => {
    const wrapper = mountPanel({ groups: [flatGroup(PENDING_ONLY)] })
    const tag = wrapper.find('.pos-reg__pending-tag')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toContain('待確認')
    expect(tag.text()).toContain('1,200')
    // 同一顆 tag 上就要講清楚現在收不了，不能只留一個金額
    expect(tag.text()).toContain('尚不可收款')
  })

  it('一般未結清報名不受影響：可勾選、點擊照樣 toggle', async () => {
    const wrapper = mountPanel()
    expect(isDisabled(checkboxes(wrapper)[0])).toBe(false)
    await wrapper.find('.pos-reg').trigger('click')
    expect(wrapper.emitted('toggle')?.length).toBe(1)
  })

  it('待審核但已有計費金額（混合報名）仍可收款：不得誤擋', async () => {
    const wrapper = mountPanel({
      groups: [
        flatGroup({
          pending_review: true,
          pending_amount: 1200,
          total_amount: 800,
          paid_amount: 0,
          owed: 800,
        }),
      ],
    })
    expect(isDisabled(checkboxes(wrapper)[0])).toBe(false)
    await wrapper.find('.pos-reg').trigger('click')
    expect(wrapper.emitted('toggle')?.length).toBe(1)
  })

  it('退費模式：total=0 但已繳 > 0 的報名照舊可勾選（行為不得改變）', async () => {
    const wrapper = mountPanel({
      isRefundMode: true,
      groups: [
        flatGroup({
          pending_review: true,
          pending_amount: 1200,
          total_amount: 0,
          paid_amount: 1500,
          owed: 0,
        }),
      ],
    })
    expect(isDisabled(checkboxes(wrapper)[0])).toBe(false)
    await wrapper.find('.pos-reg').trigger('click')
    expect(wrapper.emitted('toggle')?.length).toBe(1)
  })

  it('退費模式：不顯示「才能收款」的收款指引（那是收款模式的話）', () => {
    const wrapper = mountPanel({
      isRefundMode: true,
      groups: [
        flatGroup({
          pending_review: true,
          pending_amount: 1200,
          total_amount: 0,
          paid_amount: 1500,
          owed: 0,
        }),
      ],
    })
    expect(wrapper.text()).not.toContain('才能收款')
  })

  it('依日期模式：收款模式下 total=0 的列同樣不可勾選', async () => {
    const wrapper = mountPanel({
      mode: 'by-registration',
      registrations: [
        {
          id: 501,
          student_name: '林小美',
          class_name: '中班',
          course_names: '陶土',
          total_amount: 0,
          paid_amount: 0,
          created_at: '2026-08-01T02:00:00Z',
        },
      ],
    })
    // 點到該日才會列出當日報名
    const cell = wrapper.findAll('.pos-cal__cell').find((c) => c.text().includes('1 筆'))
    expect(cell).toBeTruthy()
    await cell!.trigger('click')
    const row = wrapper.find('.pos-reg--solo')
    expect(row.exists()).toBe(true)
    expect(isDisabled(row.find('el-checkbox-stub'))).toBe(true)
    await row.trigger('click')
    expect(wrapper.emitted('toggle')).toBeUndefined()
  })
})
