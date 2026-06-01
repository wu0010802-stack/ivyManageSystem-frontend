import { describe, it, expect } from 'vitest'
import { EVENT_TYPES, eventTypeColor, eventTypeDef } from '../calendarEventTypes'

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
})
