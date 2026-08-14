import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import POSSearchPanel from '../POSSearchPanel.vue'

// 稽核（2026-08-06）：依學生分組表頭原本硬寫「欠 NT$X」。退費模式下後端
// （GET /pos/outstanding-by-student?filter=refundable）回的 group_owed_total 語意是
// 「已繳／可退金額」，櫃台會看到已繳清的學生標著紅色「欠 4,500」而誤判。
// 表頭標籤與配色必須與上方「待退合計」對齊。

const slotStub = (tag = 'div') => ({ template: `<${tag}><slot /></${tag}>` })

// 2026-08-14 清單密度調整後標籤語意有兩個承載點：多筆報名走群組表頭
// （.pos-group__owed），單筆報名攤平成一列後改由 .pos-reg__owed 帶標籤。
// 兩邊都要驗，否則任一邊退化回「欠」都不會有人發現。

// fixture 依 PosOutstandingGroupOut / PosOutstandingRegistrationItemOut 的真實形狀：
// 退費模式母體為 filter=refundable（paid > 0），已繳清的學生 owed=0、
// group_owed_total = 底下各列 paid_amount 加總。
function refundableReg(id = 101, name = '兒童美術') {
  return {
    id,
    class_name: '大班',
    courses: [{ name, price: 4500 }],
    supplies: [],
    created_at: '2026-08-01T02:00:00+00:00',
    total_amount: 4500,
    paid_amount: 4500,
    owed: 0,
  }
}

// 多筆報名 → 保留群組表頭，合計掛在表頭
function refundableGroup() {
  return {
    student_key: '王小明|2020-03-05',
    student_name: '王小明',
    class_name: '大班',
    birthday: '2020-03-05',
    group_owed_total: 4500,
    registrations: [refundableReg(101), refundableReg(102, '兒童律動')],
  }
}

// 收款模式母體為 filter=outstanding（owed > 0）：同一位學生尚未繳費的形狀。
function outstandingGroup() {
  const g = refundableGroup()
  for (const r of g.registrations) {
    r.paid_amount = 0
    r.owed = 4500
  }
  return g
}

// 單筆報名 → 攤平成一列，標籤改掛在 .pos-reg__owed
function flatGroup(isRefundMode: boolean) {
  const g = isRefundMode ? refundableGroup() : outstandingGroup()
  g.registrations = [g.registrations[0]]
  return g
}

function mountPanel(isRefundMode: boolean, flat = false) {
  const g = flat
    ? flatGroup(isRefundMode)
    : isRefundMode
      ? refundableGroup()
      : outstandingGroup()
  return mount(POSSearchPanel, {
    props: {
      mode: 'by-student',
      searchQuery: '王',
      isRefundMode,
      groups: [g],
    },
    global: {
      directives: { loading: {} },
      stubs: {
        'el-card': slotStub(),
        'el-scrollbar': slotStub(),
        'el-radio-group': slotStub(),
        'el-radio-button': slotStub('span'),
        'el-select': slotStub(),
        'el-input': true,
        'el-option': true,
        'el-switch': true,
        'el-alert': true,
        'el-checkbox': true,
        'el-button': true,
      },
    },
  })
}

describe('POSSearchPanel 依學生分組表頭金額標籤', () => {
  it('退費模式表頭不寫「欠」，改為與「待退合計」一致的「可退」', () => {
    const wrapper = mountPanel(true)

    const head = wrapper.get('.pos-group__owed')
    expect(head.text()).not.toContain('欠')
    expect(head.text()).toContain('可退')
    expect(head.text()).toContain('NT$4,500')

    // 與同畫面合計文案對齊，避免兩處互相矛盾
    expect(wrapper.get('.pos-panel__summary').text()).toContain('待退合計')
  })

  it('退費模式表頭不套欠款警示紅配色', () => {
    const wrapper = mountPanel(true)

    expect(wrapper.get('.pos-group__owed').classes()).toContain('pos-group__owed--refund')
  })

  it('收款模式維持「欠」與警示配色', () => {
    const wrapper = mountPanel(false)

    const head = wrapper.get('.pos-group__owed')
    expect(head.text()).toContain('欠')
    expect(head.text()).toContain('NT$4,500')
    expect(head.classes()).not.toContain('pos-group__owed--refund')
    expect(wrapper.get('.pos-panel__summary').text()).toContain('待收合計')
  })

  // 單筆報名攤平後沒有群組表頭，同一個語意改由列上的金額承載
  it('攤平列：退費模式標「可退」並沿用可退配色', () => {
    const owed = mountPanel(true, true).get('.pos-reg__owed')

    expect(owed.text()).not.toContain('欠')
    expect(owed.text()).toContain('可退')
    expect(owed.classes()).toContain('pos-reg__owed--refund')
  })

  it('攤平列：收款模式標「欠」且不套可退配色', () => {
    const owed = mountPanel(false, true).get('.pos-reg__owed')

    expect(owed.text()).toContain('欠')
    expect(owed.classes()).not.toContain('pos-reg__owed--refund')
  })
})
