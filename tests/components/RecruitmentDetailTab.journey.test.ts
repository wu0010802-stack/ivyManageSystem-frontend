import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
const src = fs.readFileSync(path.resolve(__dirname, '../../src/components/recruitment/RecruitmentDetailTab.vue'), 'utf-8')
describe('RecruitmentDetailTab 歷程', () => {
  it('has journey button + emit', () => {
    expect(src).toContain("$emit('journey', row)")
    expect(src).toMatch(/'journey':\s*\[row: Record<string, unknown>\]/)
  })
})
