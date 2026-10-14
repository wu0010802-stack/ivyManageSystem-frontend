import { describe, it, expect } from 'vitest'
import { EVENT_TYPES, eventTypeColor, eventTypeDef, eventTypeLabel } from '../calendarEventTypes'

describe('calendarEventTypes', () => {
  it('保留 5 個正規事件類型且順序固定', () => {
    expect(EVENT_TYPES.map((t) => t.value)).toEqual([
      'meeting', 'activity', 'holiday', 'makeup_workday', 'general',
    ])
  })

  it('eventTypeColor 回傳對應顏色', () => {
    expect(eventTypeColor('holiday')).toBe('#e6a23c')
    expect(eventTypeColor('meeting')).toBe('#409eff')
  })

  it('eventTypeColor 對未知/undefined 回退灰色', () => {
    expect(eventTypeColor('nope')).toBe('#909399')
    expect(eventTypeColor(undefined)).toBe('#909399')
  })

  it('eventTypeDef 回傳 label + color，未知回 undefined', () => {
    expect(eventTypeDef('activity')).toEqual({ value: 'activity', label: '活動', color: '#67c23a' })
    expect(eventTypeDef('nope')).toBeUndefined()
  })

  it('eventTypeLabel 回中文名稱，未知／缺省不露內部代碼', () => {
    expect(eventTypeLabel('meeting')).toBe('會議')
    expect(eventTypeLabel('makeup_workday')).toBe('補班日')
    expect(eventTypeLabel('school_trip')).toBe('其他')
    expect(eventTypeLabel(undefined, '活動')).toBe('活動')
  })
})
