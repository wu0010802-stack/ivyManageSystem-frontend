import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import OverviewTab from '@/components/student/tabs/OverviewTab.vue'

// 模擬 Element Plus 元件
const ElIcon = {
  name: 'ElIcon',
  props: ['size'],
  template: '<span class="el-icon"><slot /></span>',
}
const ElCard = {
  name: 'ElCard',
  template: '<div class="el-card"><slot name="header" /><slot /></div>',
}
const ElDescriptions = {
  name: 'ElDescriptions',
  template: '<div><slot /></div>',
}
const ElDescriptionsItem = {
  name: 'ElDescriptionsItem',
  props: ['label'],
  template: '<div><slot /></div>',
}
const ElEmpty = {
  name: 'ElEmpty',
  template: '<div class="el-empty"></div>',
}
const ElButton = {
  name: 'ElButton',
  template: '<button><slot /></button>',
}
const ElTag = {
  name: 'ElTag',
  template: '<span class="el-tag"><slot /></span>',
}

const globalConfig = {
  components: {
    ElIcon,
    ElCard,
    ElDescriptions,
    ElDescriptionsItem,
    ElEmpty,
    ElButton,
    ElTag,
  },
  stubs: {
    Calendar: true,
    Money: true,
    User: true,
    Warning: true,
    ArrowRight: true,
  },
}

// profile 使用元件實際讀取的 key（attendance_summary / fee_summary / incident_summary）
const profile = {
  attendance_summary: {
    total_records: 5,
    by_status: {
      出席: 3,
      缺席: 1,
      病假: 1,
      事假: 0,
    },
  },
  fee_summary: { total_due: 10000, total_paid: 5000, outstanding: 5000 },
  guardians: [{ name: 'P1', phone: '0900', is_primary: true }],
  incident_summary: [],
  basic: {},
  lifecycle: {},
}

function makeWrapper() {
  return mount(OverviewTab, {
    props: { profile },
    global: globalConfig,
  })
}

describe('OverviewTab a11y', () => {
  it('每個 stat-card 都有 role=button 與 tabindex=0', () => {
    const wrapper = makeWrapper()
    const cards = wrapper.findAll('.stat-card')
    expect(cards.length).toBe(4)
    cards.forEach((card) => {
      expect(card.attributes('role')).toBe('button')
      expect(card.attributes('tabindex')).toBe('0')
      expect(card.attributes('aria-label')).toBeTruthy()
    })
  })

  it('stat-card 按 Enter 會 emit goto-tab', async () => {
    const wrapper = makeWrapper()
    const card = wrapper.find('.stat-card--primary')
    await card.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('goto-tab')?.[0]).toEqual(['attendance'])
  })

  it('stat-card 按 Space 會 emit goto-tab', async () => {
    const wrapper = makeWrapper()
    const card = wrapper.find('.stat-card--success')
    await card.trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('goto-tab')?.[0]).toEqual(['fees'])
  })
})
