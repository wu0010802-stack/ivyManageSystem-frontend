/**
 * 健康紀錄「歷次量測明細」。
 *
 * 這頁原本只畫成長曲線，逐筆紀錄（含曲線畫不出的頭圍與視力）
 * 後端一直有但前端沒接（api/childMeasurements.ts 舊 TODO）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const chartMock = vi.fn()
const listMock = vi.fn()
vi.mock('@/parent/api/childMeasurements', () => ({
  fetchChildMeasurementChart: (...a: unknown[]) => chartMock(...a),
  fetchChildMeasurements: (...a: unknown[]) => listMock(...a),
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { studentId: '1' } }),
}))
vi.mock('@/composables/useChartJs', () => ({
  LineChart: { name: 'LineChart', template: '<div class="line-chart-stub" />' },
}))

const toastError = vi.fn()
vi.mock('@/parent/utils/toast', () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn(), warn: vi.fn() },
}))

import ChildMeasurementsView from '@/parent/views/ChildMeasurementsView.vue'

const chartPayload = {
  data: {
    height: [{ x: '2026-08-01', y: '105.2' }],
    weight: [{ x: '2026-08-01', y: '17.4' }],
  },
}

beforeEach(() => {
  toastError.mockReset()
  chartMock.mockReset().mockResolvedValue(chartPayload)
  listMock.mockReset().mockResolvedValue({ data: { items: [] } })
})

async function mountView() {
  const w = mount(ChildMeasurementsView)
  await flushPromises()
  return w
}

describe('ChildMeasurementsView 歷次紀錄', () => {
  it('曲線與清單同時載入', async () => {
    const w = await mountView()
    expect(chartMock).toHaveBeenCalledWith(1, 24)
    expect(listMock).toHaveBeenCalledWith(1, { months: 24 })
    w.unmount()
  })

  it('逐筆渲染日期與各項量測值', async () => {
    listMock.mockResolvedValue({
      data: {
        items: [
          {
            id: 1,
            measured_on: '2026-08-01',
            height_cm: '105.2',
            weight_kg: '17.4',
            head_circumference_cm: '50.1',
            vision_left: '1.0',
            vision_right: '0.9',
            note: '發育良好',
          },
        ],
      },
    })

    const w = await mountView()
    const row = w.find('.record')

    expect(row.text()).toContain('2026 年 8 月 1 日')
    expect(row.text()).toContain('105.2 cm')
    expect(row.text()).toContain('17.4 kg')
    expect(row.text()).toContain('50.1 cm')
    expect(row.text()).toContain('1.0 / 0.9')
    expect(row.text()).toContain('發育良好')
    w.unmount()
  })

  it('後端沒填的欄位不佔位', async () => {
    listMock.mockResolvedValue({
      data: {
        items: [
          {
            id: 2,
            measured_on: '2026-07-01',
            height_cm: '104.0',
            weight_kg: null,
            head_circumference_cm: null,
            vision_left: null,
            vision_right: null,
            note: null,
          },
        ],
      },
    })

    const w = await mountView()
    expect(w.findAll('.record-chip').length).toBe(1)
    expect(w.find('.record-note').exists()).toBe(false)
    w.unmount()
  })

  it('沒有量測紀錄時顯示引導文案', async () => {
    const w = await mountView()
    expect(w.text()).toContain('園所完成量測後會出現在這裡')
    w.unmount()
  })

  it('清單失敗不連累曲線（各自容錯）', async () => {
    listMock.mockRejectedValue({ displayMessage: '壞掉了' })

    const w = await mountView()

    // 曲線資料仍然套用
    expect(w.find('.line-chart-stub').exists()).toBe(true)
    // 清單失敗不該彈出錯誤（曲線才是這頁主體）
    expect(toastError).not.toHaveBeenCalled()
    w.unmount()
  })
})
