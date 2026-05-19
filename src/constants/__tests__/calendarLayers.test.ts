import { describe, it, expect } from 'vitest'
import {
  CALENDAR_LAYERS,
  LAYER_LABELS,
  LAYER_COLORS,
} from '../calendarLayers'

describe('calendar layers constants', () => {
  it('exposes exactly 6 layers in fixed order', () => {
    expect(CALENDAR_LAYERS).toEqual([
      'event',
      'holiday',
      'leave',
      'activity',
      'appraisal',
      'meeting',
    ])
  })

  it('every layer has a Chinese label', () => {
    for (const layer of CALENDAR_LAYERS) {
      expect(LAYER_LABELS[layer]).toMatch(/[一-鿿]/)
    }
  })

  it('every layer has a fallback color matching backend default', () => {
    expect(LAYER_COLORS.event).toBe('#10b981')
    expect(LAYER_COLORS.holiday).toBe('#f59e0b')
    expect(LAYER_COLORS.leave).toBe('#0ea5e9')
    expect(LAYER_COLORS.activity).toBe('#ec4899')
    expect(LAYER_COLORS.appraisal).toBe('#dc2626')
    expect(LAYER_COLORS.meeting).toBe('#8b5cf6')
  })
})
