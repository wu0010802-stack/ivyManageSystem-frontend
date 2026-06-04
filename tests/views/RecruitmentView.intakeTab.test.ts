import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// 結構性斷言（避免 mount 整個重元件）：名額規劃 tab 與 import 已接上
const src = fs.readFileSync(
  path.resolve(__dirname, '../../src/views/RecruitmentView.vue'),
  'utf-8',
)

describe('RecruitmentView 名額規劃 tab', () => {
  it('has intake tab pane', () => {
    expect(src).toMatch(/name="intake"/)
  })
  it('imports + uses IntakePlanPanel', () => {
    expect(src).toContain("import IntakePlanPanel from '@/components/recruitment/IntakePlanPanel.vue'")
    expect(src).toContain('<IntakePlanPanel')
  })
})
