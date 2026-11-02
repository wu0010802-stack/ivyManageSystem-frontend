import { describe, it, expect } from 'vitest'
import { compareStudentNo } from '@/utils/studentNo'

describe('compareStudentNo（day-qa F17）', () => {
  it('學號依自然順序排序，不受位數影響', () => {
    const nos = ['115-大-106', '115-大-15', '115-大-01', '115-大-8', '115-大-99']
    expect([...nos].sort(compareStudentNo)).toEqual(['115-大-01', '115-大-8', '115-大-15', '115-大-99', '115-大-106'])
  })

  it('沒有學號的排最後', () => {
    expect(['', '115-大-2', null as unknown as string].sort(compareStudentNo)).toEqual(['115-大-2', '', null])
  })
})
