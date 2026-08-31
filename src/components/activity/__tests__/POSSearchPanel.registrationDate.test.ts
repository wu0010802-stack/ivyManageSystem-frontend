import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import POSSearchPanel from '../POSSearchPanel.vue'

// 業主（2026-08-17）：園方收費期晚於報名日——報名後隔一段時間才開始收費。
// 因此舊的「只看逾期」開關（報名滿 14 天未結清＝逾期）語意根本不成立：
// 尚未到收費期的報名會被標成逾期，且開啟後其餘未結清報名整批消失、櫃台漏收。
// 開關已整條移除（含後端 overdue_only），改以中性的報名日期讓櫃台自行判斷。

const slotStub = (tag = 'div') => ({ template: `<${tag}><slot /></${tag}>` })

// created_at 為 UTC ISO；此值於 Asia/Taipei 為 2026-08-01 10:00
function outstandingReg(id = 101, createdAt = '2026-08-01T02:00:00+00:00') {
  return {
    id,
    class_name: '大班',
    courses: [{ name: '兒童美術', price: 4500 }],
    supplies: [],
    created_at: createdAt,
    total_amount: 4500,
    paid_amount: 0,
    owed: 4500,
  }
}

function mountPanel(registrations = [outstandingReg(101), outstandingReg(102)]) {
  return mount(POSSearchPanel, {
    props: {
      mode: 'by-student',
      searchQuery: '王',
      isRefundMode: false,
      groups: [
        {
          student_key: '王小明|大班',
          student_name: '王小明',
          class_name: '大班',
          birthday: '2020-03-05',
          group_owed_total: 4500 * registrations.length,
          registrations,
        },
      ],
    },
    global: {
      directives: { loading: {} },
      stubs: {
        'el-card': slotStub(),
        'el-scrollbar': slotStub(),
        'el-radio-group': slotStub(),
        'el-radio-button': slotStub('span'),
        'el-select': slotStub(),
        'el-check-tag': slotStub('span'),
        'el-input': true,
        'el-option': true,
        'el-switch': true,
        'el-alert': true,
        'el-checkbox': true,
        'el-button': true,
        'el-tag': true,
      },
    },
  })
}

describe('POSSearchPanel 報名日期（取代「只看逾期」開關）', () => {
  it('不再渲染「只看逾期」開關', () => {
    const wrapper = mountPanel()

    expect(wrapper.html()).not.toContain('只看逾期')
    expect(wrapper.find('.pos-panel__filters').exists()).toBe(false)
  })

  it('每筆報名顯示台北時區的報名日期', () => {
    const wrapper = mountPanel()

    const dates = wrapper.findAll('.pos-reg__date')
    expect(dates).toHaveLength(2)
    expect(dates[0].text()).toBe('8/01 報名')
  })

  it('報名日期為中性資訊，不帶逾期／催繳語意', () => {
    // 40 天前報名也只顯示日期：收費期由園方另行認定，系統不得代為判逾期
    const wrapper = mountPanel([outstandingReg(101, '2026-07-01T02:00:00+00:00')])

    const date = wrapper.get('.pos-reg__date')
    expect(date.text()).toBe('7/01 報名')
    expect(wrapper.html()).not.toContain('逾期')
  })

  it('created_at 缺值時不渲染日期，不顯示 Invalid Date', () => {
    const reg = outstandingReg(101)
    // @ts-expect-error 刻意測試後端未回 created_at 的降級路徑
    reg.created_at = null
    const wrapper = mountPanel([reg])

    expect(wrapper.find('.pos-reg__date').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('Invalid Date')
  })

  it('日期 key 格式化重用單例 Intl.DateTimeFormat，建構次數不隨報名列數增加（2026-08-21 效能修復）', () => {
    // 修復前 extractDateKey 每筆報名都會 new 一次 Intl.DateTimeFormat（被
    // registeredOnLabel 逐列呼叫），12 列會遠高於 2 列；改用 format.ts 的
    // module 級單例後，建構次數只剩與列數無關的既有呼叫（如 taipeiToday()），
    // 兩次掛載應相等。
    // vi.spyOn 對建構子的預設 call-through 在此環境不保留原型鏈（formatToParts
    // 遺失），改用手動替換 + Reflect.construct 轉呼叫原生實作、計數。
    const OriginalDateTimeFormat = Intl.DateTimeFormat
    const countConstructions = (fn: () => void): number => {
      let count = 0
      // @ts-expect-error 測試用途暫時覆寫全域建構子以計數，finally 內還原
      Intl.DateTimeFormat = function (...args: unknown[]) {
        count += 1
        return Reflect.construct(OriginalDateTimeFormat, args)
      }
      try {
        fn()
      } finally {
        Intl.DateTimeFormat = OriginalDateTimeFormat
      }
      return count
    }

    const many = Array.from({ length: 12 }, (_, i) =>
      outstandingReg(300 + i, `2026-08-${String((i % 27) + 1).padStart(2, '0')}T02:00:00+00:00`))

    const fewCount = countConstructions(() => {
      mountPanel([outstandingReg(101), outstandingReg(102)])
    })
    const manyCount = countConstructions(() => {
      mountPanel(many)
    })

    expect(manyCount).toBeGreaterThan(0) // 確認替換有攔到呼叫，非假陽性
    expect(manyCount).toBe(fewCount)
  })
})
