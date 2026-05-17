import { describe, it, expect } from 'vitest'
import { reactive, ref } from 'vue'
import { useLeaveHintFormatter } from '@/composables/useLeaveHintFormatter'

function setup({ form: f = {}, breakdown = [], mode = 'morning' } = {}) {
  const form = reactive({ start_date: '', end_date: '', ...f })
  const calcBreakdown = ref(breakdown)
  const leaveMode = ref(mode)
  return useLeaveHintFormatter({ form, calcBreakdown, leaveMode })
}

describe('useLeaveHintFormatter — calcTooltipHtml', () => {
  it('空 breakdown → 空字串', () => {
    const { calcTooltipHtml } = setup()
    expect(calcTooltipHtml.value).toBe('')
  })

  it('workday non-custom 模式：列出日期、星期、時數、合計', () => {
    // 2026-05-18 是週一
    const { calcTooltipHtml } = setup({
      breakdown: [
        { date: '2026-05-18', type: 'workday', hours: 8 },
        { date: '2026-05-19', type: 'workday', hours: 4 },
      ],
    })
    const html = calcTooltipHtml.value
    expect(html).toContain('2026-05-18（一）8h')
    expect(html).toContain('2026-05-19（二）4h')
    expect(html).toContain('合計 = 12h')
  })

  it('holiday：顯示節日名稱與 0h', () => {
    const { calcTooltipHtml } = setup({
      breakdown: [
        { date: '2026-01-01', type: 'holiday', holiday_name: '元旦' },
      ],
    })
    const html = calcTooltipHtml.value
    expect(html).toContain('元旦 0h')
    expect(html).toContain('合計 = 0h')
  })

  it('weekend / 其他類型：顯示「週末 0h」', () => {
    const { calcTooltipHtml } = setup({
      breakdown: [{ date: '2026-05-17', type: 'weekend' }],
    })
    expect(calcTooltipHtml.value).toContain('週末 0h')
  })

  it('custom 模式單日：依 start/end time 重算（扣中午 12-13 午休 1h）', () => {
    // 09:00-18:00 9hr - 1hr 午休 = 8h
    const { calcTooltipHtml } = setup({
      mode: 'custom',
      form: { start_date: '2026-05-18 09:00', end_date: '2026-05-18 18:00' },
      breakdown: [
        { date: '2026-05-18', type: 'workday', hours: 8, work_start: '09:00', work_end: '18:00' },
      ],
    })
    const html = calcTooltipHtml.value
    expect(html).toContain('8h')
    expect(html).toContain('09:00–18:00')
    expect(html).toContain('合計 = 8h')
  })

  it('custom 模式：start time 晚於 work_start 時，取較晚者', () => {
    // 10:00-12:00 = 2h，無午休重疊
    const { calcTooltipHtml } = setup({
      mode: 'custom',
      form: { start_date: '2026-05-18 10:00', end_date: '2026-05-18 12:00' },
      breakdown: [
        { date: '2026-05-18', type: 'workday', hours: 2, work_start: '09:00', work_end: '18:00' },
      ],
    })
    expect(calcTooltipHtml.value).toContain('10:00–12:00')
    expect(calcTooltipHtml.value).toContain('2h')
  })

  it('custom 模式：dayStart >= dayEnd → 該日 hours=0', () => {
    const { calcTooltipHtml } = setup({
      mode: 'custom',
      form: { start_date: '2026-05-18 18:00', end_date: '2026-05-18 09:00' },
      breakdown: [
        { date: '2026-05-18', type: 'workday', hours: 0, work_start: '09:00', work_end: '18:00' },
      ],
    })
    expect(calcTooltipHtml.value).toContain('0h')
  })
})

describe('useLeaveHintFormatter — officeHoursWarning', () => {
  it('非 custom 模式 → 空字串', () => {
    const { officeHoursWarning } = setup({
      form: { start_date: '2026-05-18 06:00', end_date: '2026-05-18 22:00' },
      mode: 'morning',
    })
    expect(officeHoursWarning.value).toBe('')
  })

  it('start 早於 09:00 → 警示', () => {
    const { officeHoursWarning } = setup({
      mode: 'custom',
      form: { start_date: '2026-05-18 07:30', end_date: '2026-05-18 12:00' },
    })
    expect(officeHoursWarning.value).toContain('07:30')
    expect(officeHoursWarning.value).toContain('09:00')
  })

  it('end 晚於 18:00 → 警示', () => {
    const { officeHoursWarning } = setup({
      mode: 'custom',
      form: { start_date: '2026-05-18 10:00', end_date: '2026-05-18 19:00' },
    })
    expect(officeHoursWarning.value).toContain('19:00')
    expect(officeHoursWarning.value).toContain('18:00')
  })

  it('start/end 都在預設範圍內 → 空字串', () => {
    const { officeHoursWarning } = setup({
      mode: 'custom',
      form: { start_date: '2026-05-18 10:00', end_date: '2026-05-18 17:00' },
    })
    expect(officeHoursWarning.value).toBe('')
  })

  it('start 與 end 都越界 → 兩條警示以「；」串接', () => {
    const { officeHoursWarning } = setup({
      mode: 'custom',
      form: { start_date: '2026-05-18 07:00', end_date: '2026-05-18 20:00' },
    })
    expect(officeHoursWarning.value).toContain('；')
  })

  it('start_date 或 end_date 缺 → 空字串', () => {
    const { officeHoursWarning } = setup({
      mode: 'custom',
      form: { start_date: '', end_date: '' },
    })
    expect(officeHoursWarning.value).toBe('')
  })
})
