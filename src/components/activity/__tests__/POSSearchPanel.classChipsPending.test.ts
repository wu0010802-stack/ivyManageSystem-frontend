import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import POSSearchPanel from '../POSSearchPanel.vue'

// ①更快速找到繳費的學生（2026-08-16）：班級改用可點快選 chips（原本是下拉選單），
// 待審核報名（系統比對非自動成功）在搜尋結果標紅提示，避免現場漏收。

const slotStub = (tag = 'div') => ({ template: `<${tag}><slot /></${tag}>` })

function flatGroup(overrides: Record<string, unknown> = {}) {
  return {
    student_key: '王小明|大班',
    student_name: '王小明',
    class_name: '大班',
    birthday: '2020-03-05',
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

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(POSSearchPanel, {
    props: {
      mode: 'by-student',
      searchQuery: '',
      classroomOptions: ['玫瑰', '百合'],
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
        'el-option': true,
        'el-switch': true,
        'el-alert': true,
        'el-checkbox': true,
        'el-button': true,
        'el-check-tag': {
          props: ['checked'],
          emits: ['change'],
          template:
            '<span class="pos-search__class-chip" :class="{ checked }" @click="$emit(\'change\', !checked)"><slot /></span>',
        },
      },
    },
  })
}

describe('POSSearchPanel：班級快選 chips', () => {
  it('顯示「全部」加每個班級一個 chip', () => {
    const wrapper = mountPanel()
    const chips = wrapper.findAll('.pos-search__class-chip')
    expect(chips.length).toBe(3) // 全部 + 玫瑰 + 百合
    expect(chips[0].text()).toBe('全部')
    expect(chips[1].text()).toBe('玫瑰')
    expect(chips[2].text()).toBe('百合')
  })

  it('點擊班級 chip 觸發 update:classroomFilter', async () => {
    const wrapper = mountPanel()
    const chips = wrapper.findAll('.pos-search__class-chip')
    await chips[1].trigger('click')
    expect(wrapper.emitted('update:classroomFilter')?.[0]).toEqual(['玫瑰'])
  })

  it('已選班級再點一次視為取消（回全部）', async () => {
    const wrapper = mountPanel({ classroomFilter: '玫瑰' })
    const chips = wrapper.findAll('.pos-search__class-chip')
    await chips[1].trigger('click')
    expect(wrapper.emitted('update:classroomFilter')?.[0]).toEqual([''])
  })

  it('點擊「全部」chip 清空班級篩選', async () => {
    const wrapper = mountPanel({ classroomFilter: '玫瑰' })
    const chips = wrapper.findAll('.pos-search__class-chip')
    await chips[0].trigger('click')
    expect(wrapper.emitted('update:classroomFilter')?.[0]).toEqual([''])
  })

  it('未選任何班級時「全部」chip 為 checked', () => {
    const wrapper = mountPanel()
    const chips = wrapper.findAll('.pos-search__class-chip')
    expect(chips[0].classes()).toContain('checked')
  })
})

describe('POSSearchPanel：待審核報名標籤', () => {
  it('待審核報名顯示紅色標籤與待確認金額', () => {
    const wrapper = mountPanel({
      groups: [
        flatGroup({
          pending_review: true,
          pending_amount: 1500,
          total_amount: 0,
          owed: 0,
        }),
      ],
    })
    expect(wrapper.text()).toContain('待審核')
    expect(wrapper.text()).toContain('1,500')
  })

  it('一般報名不顯示待審核標籤', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).not.toContain('待審核')
  })
})
