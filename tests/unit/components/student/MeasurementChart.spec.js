import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// Stub LineChart (vue-chartjs) — only assert prop reactivity, not chart.js internals.
vi.mock('@/composables/useChartJs', () => ({
  LineChart: {
    name: 'LineChart',
    props: ['data', 'options'],
    template: '<div class="line-chart-stub" />',
  },
}))

import MeasurementChart from '@/components/student/MeasurementChart.vue'

const heightData = [
  { x: '2026-04-01', y: '99.50' },
  { x: '2026-05-01', y: '100.00' },
]
const weightData = [{ x: '2026-05-01', y: '20.00' }]

describe('MeasurementChart', () => {
  it('renders LineChart with sorted height series when data present', () => {
    const wrapper = mount(MeasurementChart, {
      props: {
        data: { height: heightData, weight: [] },
        metric: 'height',
      },
    })

    const stub = wrapper.findComponent({ name: 'LineChart' })
    expect(stub.exists()).toBe(true)
    expect(stub.props('data').labels).toEqual(['2026-04-01', '2026-05-01'])
    expect(stub.props('data').datasets[0].data).toEqual([99.5, 100])
    expect(stub.props('data').datasets[0].label).toBe('身高 (cm)')
    expect(stub.props('data').datasets[0].borderColor).toBe('#0d9053')
  })

  it('shows empty placeholder (no LineChart) when metric series is empty', () => {
    const wrapper = mount(MeasurementChart, {
      props: {
        data: { height: [], weight: weightData },
        metric: 'height',
      },
    })

    expect(wrapper.findComponent({ name: 'LineChart' }).exists()).toBe(false)
    expect(wrapper.text()).toContain('尚無 身高 (cm) 紀錄')
  })

  it('updates LineChart data when metric prop changes', async () => {
    const wrapper = mount(MeasurementChart, {
      props: {
        data: { height: heightData, weight: weightData },
        metric: 'height',
      },
    })

    const stub = wrapper.findComponent({ name: 'LineChart' })
    expect(stub.props('data').datasets[0].label).toBe('身高 (cm)')

    await wrapper.setProps({ metric: 'weight' })
    expect(stub.props('data').datasets[0].label).toBe('體重 (kg)')
    expect(stub.props('data').datasets[0].data).toEqual([20])
  })
})
