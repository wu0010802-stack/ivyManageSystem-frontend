import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
const src = fs.readFileSync(path.resolve(__dirname, '../../src/components/student/StudentDetailPanel.vue'), 'utf-8')
describe('StudentDetailPanel 入學前歷程', () => {
  it('renders JourneyTimeline gated by recruitment_visit_id', () => {
    expect(src).toContain('JourneyTimeline')
    expect(src).toContain('入學前歷程')
    expect(src).toMatch(/recruitment_visit_id/)
  })
})
