import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import OverviewSummaryCard from '@/components/gov-reports/OverviewSummaryCard.vue'

// ── El 元件 mock ──────────────────────────────────────────────────────────

const ElCard = defineComponent({
  name: 'ElCard',
  props: ['shadow'],
  setup(_, { slots }) {
    return () => h('div', { class: 'el-card' }, slots.default?.())
  },
})

const globalConfig = {
  components: { ElCard },
}

// ── 測試資料 ───────────────────────────────────────────────────────────────

const overview = {
  total_students: 28,
  by_age_group: { '2-3': 0, '3-4': 8, '4-5': 12, '5-6': 8 },
  disadvantaged_pct: 7.14,
  disability_pct: 3.57,
  indigenous_pct: 0,
  foreign_pct: 0,
  total_expected_days: 1300,
  total_actual_days: 1238,
  total_attendance_rate_pct: 95.23,
}

// ── 測試 ───────────────────────────────────────────────────────────────────

describe('OverviewSummaryCard', () => {
  it('renders total students count', () => {
    const wrapper = mount(OverviewSummaryCard, {
      props: { overview, snapshotDate: '2026-05-31', generatedAt: '2026-06-01T10:23', generatedBy: 'test' },
      global: globalConfig,
    })
    expect(wrapper.text()).toContain('28')
    expect(wrapper.text()).toContain('總人數')
  })

  it('renders age group distribution', () => {
    const wrapper = mount(OverviewSummaryCard, {
      props: { overview, snapshotDate: null, generatedAt: null, generatedBy: null },
      global: globalConfig,
    })
    expect(wrapper.text()).toContain('4-5 歲')
    expect(wrapper.text()).toContain('12')
  })

  it('renders total attendance rate', () => {
    const wrapper = mount(OverviewSummaryCard, {
      props: { overview, snapshotDate: null, generatedAt: null, generatedBy: null },
      global: globalConfig,
    })
    expect(wrapper.text()).toContain('95.23%')
  })

  it('shows dash for null metadata fields', () => {
    const wrapper = mount(OverviewSummaryCard, {
      props: { overview, snapshotDate: null, generatedAt: null, generatedBy: null },
      global: globalConfig,
    })
    const produceSection = wrapper.find('.produce-info')
    expect(produceSection.exists()).toBe(true)
    // null → '-' 共 3 個欄位
    const text = produceSection.text()
    expect(text).toContain('-')
  })

  it('renders snapshot date and generatedBy when provided', () => {
    const wrapper = mount(OverviewSummaryCard, {
      props: { overview, snapshotDate: '2026-05-31', generatedAt: '2026-06-01T10:23', generatedBy: '王主任' },
      global: globalConfig,
    })
    expect(wrapper.text()).toContain('2026-05-31')
    expect(wrapper.text()).toContain('王主任')
  })
})
