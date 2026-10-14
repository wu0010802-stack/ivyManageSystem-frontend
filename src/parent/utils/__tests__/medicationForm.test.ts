import { describe, expect, it } from 'vitest'
import { MEDICATION_PHOTO_MAX, nextMedicationSlot } from '../medicationForm'

describe('nextMedicationSlot', () => {
  it('依最後一個時段 +4 小時', () => {
    expect(nextMedicationSlot(['08:00'])).toBe('12:00')
    expect(nextMedicationSlot(['08:00', '12:00'])).toBe('16:00')
    expect(nextMedicationSlot(['07:30'])).toBe('11:30')
  })

  it('超過當天停在 23:59，不繞回凌晨', () => {
    expect(nextMedicationSlot(['22:00'])).toBe('23:59')
  })

  it('與既有時段重複時往後挪', () => {
    expect(nextMedicationSlot(['12:00', '08:00'])).toBe('12:30')
  })

  it('沒有可推算的時段時用 12:00', () => {
    expect(nextMedicationSlot([])).toBe('12:00')
    expect(nextMedicationSlot([''])).toBe('12:00')
  })
})

describe('MEDICATION_PHOTO_MAX', () => {
  it('建立表單與詳情頁共用同一個上限', () => {
    expect(MEDICATION_PHOTO_MAX).toBe(5)
  })
})
