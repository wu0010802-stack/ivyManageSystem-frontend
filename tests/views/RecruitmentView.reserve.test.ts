import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const src = fs.readFileSync(
  path.resolve(__dirname, '../../src/views/RecruitmentView.vue'),
  'utf-8',
)

describe('RecruitmentView reserve wiring', () => {
  it('wires @reserve and ReserveSeatDialog', () => {
    expect(src).toMatch(/@reserve="openReserveDialog"/)
    expect(src).toContain("import ReserveSeatDialog from '@/components/recruitment/ReserveSeatDialog.vue'")
    expect(src).toContain('<ReserveSeatDialog')
  })
  it('onReserved reloads the detail list', () => {
    expect(src).toMatch(/function onReserved\(\)\s*\{[\s\S]*fetchDetail\(\)/)
  })
})
