import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// Mock all echarts sub-packages used by MeasurementChart.vue
const fakeChart = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() }

vi.mock('echarts/core', () => ({
  init: vi.fn(() => fakeChart),
  use: vi.fn(),
}))

vi.mock('echarts/charts', () => ({
  LineChart: {},
}))

vi.mock('echarts/components', () => ({
  GridComponent: {},
  LegendComponent: {},
  TitleComponent: {},
  TooltipComponent: {},
}))

vi.mock('echarts/renderers', () => ({
  CanvasRenderer: {},
}))

import * as echarts from 'echarts/core'
import MeasurementChart from '@/components/student/MeasurementChart.vue'

const heightData = [{ x: '2026-05-01', y: '100.00' }]
const weightData = [{ x: '2026-05-01', y: '20.00' }]

describe('MeasurementChart', () => {
  it('initialises echarts on mount and disposes on unmount', () => {
    echarts.init.mockClear()
    fakeChart.dispose.mockClear()

    const wrapper = mount(MeasurementChart, {
      props: {
        data: { height: heightData, weight: [] },
        metric: 'height',
      },
      attachTo: document.body,
    })

    expect(echarts.init).toHaveBeenCalled()
    wrapper.unmount()
    expect(fakeChart.dispose).toHaveBeenCalled()
  })

  it('re-renders (setOption called again) when metric prop changes', async () => {
    fakeChart.setOption.mockClear()

    const wrapper = mount(MeasurementChart, {
      props: {
        data: { height: heightData, weight: weightData },
        metric: 'height',
      },
      attachTo: document.body,
    })

    const callsAfterMount = fakeChart.setOption.mock.calls.length
    expect(callsAfterMount).toBeGreaterThan(0)

    await wrapper.setProps({ metric: 'weight' })
    expect(fakeChart.setOption.mock.calls.length).toBeGreaterThan(callsAfterMount)

    wrapper.unmount()
  })
})
