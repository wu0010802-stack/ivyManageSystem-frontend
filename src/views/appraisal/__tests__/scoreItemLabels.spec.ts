import { describe, expect, it } from 'vitest'

import {
  AUTO_ITEM_CODES,
  ITEM_CODE_LABELS,
  MANUAL_DELTA_RANGES,
} from '../scoreItemLabels'
import {
  MANUAL_ITEM_CODES,
  MANUAL_LABEL,
} from '../composables/useManualEventEntry'

const NEW_CODES = [
  'ABSENTEEISM',
  'STUDENT_WITHDRAWAL',
  'STUDENT_REINSTATE',
  'TRIAL_LEAVE',
  'CLASS_TRANSFER',
  'EXAM_RESULT',
  'RECRUIT_SCORE',
  'SUPERVISOR_SCORE',
  'EXCELLENCE_NOMINATION',
] as const

describe('scoreItemLabels 規章對齊（2026-06-11 spec）', () => {
  it('九個新 code 都有標籤', () => {
    for (const code of NEW_CODES)
      expect(ITEM_CODE_LABELS[code as keyof typeof ITEM_CODE_LABELS]).toBeTruthy()
  })

  it('auto 集合含學生來源自動項，其餘新項歸手填', () => {
    expect(AUTO_ITEM_CODES.has('ABSENTEEISM')).toBe(true)
    expect(AUTO_ITEM_CODES.has('STUDENT_REINSTATE')).toBe(true)
    expect(AUTO_ITEM_CODES.has('CHILD_ACCIDENT')).toBe(true)
    expect(AUTO_ITEM_CODES.has('SPED')).toBe(true)
    expect(AUTO_ITEM_CODES.has('TRIAL_LEAVE')).toBe(true)
    for (const code of NEW_CODES.filter(
      (c) => c !== 'ABSENTEEISM' && c !== 'STUDENT_REINSTATE' && c !== 'TRIAL_LEAVE',
    )) {
      expect(MANUAL_ITEM_CODES).toContain(code)
      expect(MANUAL_LABEL[code]).toBeTruthy()
    }
  })

  it('MANUAL_DELTA 範圍與後端 aprreg01 規則一致', () => {
    expect(MANUAL_DELTA_RANGES.CHILD_ACCIDENT).toEqual({ min: -10, max: 0 })
    expect(MANUAL_DELTA_RANGES.EXAM_RESULT).toEqual({ min: -10, max: 10 })
    expect(MANUAL_DELTA_RANGES.RECRUIT_SCORE).toEqual({ min: 0, max: 20 })
    expect(MANUAL_DELTA_RANGES.SUPERVISOR_SCORE).toEqual({ min: 0, max: 10 })
  })
})
