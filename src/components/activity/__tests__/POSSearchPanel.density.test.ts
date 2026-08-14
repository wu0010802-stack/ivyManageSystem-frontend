import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import POSSearchPanel from '../POSSearchPanel.vue'

/**
 * 清單密度（2026-08-14）。舊版每位學生固定兩層：群組表頭（姓名／班級／「欠 NT$X」）
 * 外面再包一列報名（課程 chip／「應繳 X · 已繳 0」／「NT$X」）。絕大多數學生只報
 * 一門課，於是同一個數字在同一張卡出現三次，而「已繳 NT$0」對未繳的人零資訊量。
 *
 * 兩條規則：
 * - 只有一筆報名 → 攤平成單列（姓名與金額同行、品項在下），不再有群組表頭
 * - 已繳 = 0 → 不印應繳／已繳那行；已繳 > 0（部分繳費）才印，讓這種人自然凸顯
 */

const slotStub = (tag = 'div') => ({ template: `<${tag}><slot /></${tag}>` })

function reg(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    class_name: '蒙德里安',
    courses: [{ name: '舞蹈', price: 4400 }],
    supplies: [],
    created_at: '2026-08-01T02:00:00+00:00',
    total_amount: 4400,
    paid_amount: 0,
    owed: 4400,
    ...overrides,
  }
}

function group(overrides: Record<string, unknown> = {}) {
  return {
    student_key: '林睦玄|蒙德里安',
    student_name: '林睦玄',
    class_name: '蒙德里安',
    birthday: '',
    group_owed_total: 4400,
    registrations: [reg()],
    ...overrides,
  }
}

function mountPanel(groups: Record<string, unknown>[], isRefundMode = false) {
  return mount(POSSearchPanel, {
    props: { mode: 'by-student', searchQuery: '', isRefundMode, groups },
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

describe('單筆報名攤平成一列', () => {
  it('不再渲染群組表頭（那層卡只是把同一個數字再印一次）', () => {
    const wrapper = mountPanel([group()])

    expect(wrapper.find('.pos-group__head').exists()).toBe(false)
    expect(wrapper.findAll('.pos-reg')).toHaveLength(1)
  })

  it('攤平列自己帶姓名與班級，否則收銀員不知道在收誰的錢', () => {
    const row = mountPanel([group()]).get('.pos-reg')

    expect(row.text()).toContain('林睦玄')
    expect(row.text()).toContain('蒙德里安')
    expect(row.text()).toContain('舞蹈')
  })

  it('攤平列的金額帶「欠」標籤，金額只出現一次', () => {
    const wrapper = mountPanel([group()])
    const owed = wrapper.get('.pos-reg__owed')

    expect(owed.text()).toContain('欠')
    expect(owed.text()).toContain('NT$4,400')
    // 整列只該出現一次金額（舊版是表頭 + 列 + meta 共三次）
    const occurrences = wrapper.get('.pos-reg').text().split('NT$4,400').length - 1
    expect(occurrences).toBe(1)
  })

  it('退費模式攤平列標籤是「可退」，不是「欠」', () => {
    const refundGroup = group({
      group_owed_total: 4400,
      registrations: [reg({ paid_amount: 4400, owed: 0 })],
    })
    const owed = mountPanel([refundGroup], true).get('.pos-reg__owed')

    expect(owed.text()).not.toContain('欠')
    expect(owed.text()).toContain('可退')
    expect(owed.text()).toContain('NT$4,400')
  })

  it('生日仍看得到（有值時併進班級那行，遮罩時不留空欄）', () => {
    const withBirthday = group({ birthday: '2020-01-01' })
    expect(mountPanel([withBirthday]).get('.pos-reg').text()).toContain('2020-01-01')

    const masked = group({ birthday: '' })
    expect(mountPanel([masked]).get('.pos-reg').text()).not.toContain('生日')
  })
})

describe('多筆報名保留群組結構', () => {
  const multi = group({
    student_key: '陳大同|蒙德里安',
    student_name: '陳大同',
    group_owed_total: 8800,
    registrations: [
      reg({ id: 201, courses: [{ name: '舞蹈', price: 4400 }] }),
      reg({ id: 202, courses: [{ name: '美術', price: 4400 }] }),
    ],
  })

  it('渲染群組表頭並顯示合計', () => {
    const wrapper = mountPanel([multi])
    const head = wrapper.get('.pos-group__head')

    expect(head.text()).toContain('陳大同')
    expect(head.text()).toContain('NT$8,800')
    expect(wrapper.findAll('.pos-reg')).toHaveLength(2)
  })

  it('各列不重複印學生姓名（表頭已經有了）', () => {
    const rows = mountPanel([multi]).findAll('.pos-reg')

    for (const row of rows) {
      expect(row.text()).not.toContain('陳大同')
    }
  })
})

describe('已繳金額只在部分繳費時顯示', () => {
  it('已繳 = 0 不印應繳／已繳（欠款金額就是應繳）', () => {
    const wrapper = mountPanel([group()])

    expect(wrapper.find('.pos-reg__meta').exists()).toBe(false)
  })

  it('已繳 > 0 才印，讓部分繳費的人在清單裡凸顯出來', () => {
    const partial = group({
      group_owed_total: 1400,
      registrations: [reg({ paid_amount: 3000, owed: 1400 })],
    })
    const meta = mountPanel([partial]).get('.pos-reg__meta')

    expect(meta.text()).toContain('NT$4,400')
    expect(meta.text()).toContain('NT$3,000')
  })

  it('退費模式同樣只在有部分繳費語意時才多印一行', () => {
    // 退費母體 paid > 0 是常態，不該每列都掛 meta
    const fullyPaid = group({
      registrations: [reg({ paid_amount: 4400, owed: 0 })],
    })
    expect(mountPanel([fullyPaid], true).find('.pos-reg__meta').exists()).toBe(false)
  })
})
