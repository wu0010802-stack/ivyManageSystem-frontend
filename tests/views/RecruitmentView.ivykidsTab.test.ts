import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
const src = fs.readFileSync(path.resolve(__dirname, '../../src/views/RecruitmentView.vue'), 'utf-8')
describe('RecruitmentView 官網報名 tab', () => {
  it('has ivykids tab using RecruitmentIvykidsTab', () => {
    expect(src).toMatch(/name="ivykids"/)
    expect(src).toContain('RecruitmentIvykidsTab')
  })
})
