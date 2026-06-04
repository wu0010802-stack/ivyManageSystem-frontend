import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
const src = fs.readFileSync(path.resolve(__dirname, '../../src/views/RecruitmentView.vue'), 'utf-8')
describe('RecruitmentView 歷程抽屜', () => {
  it('wires @journey + JourneyTimeline drawer', () => {
    expect(src).toMatch(/@journey="openJourney"/)
    expect(src).toContain('JourneyTimeline')
  })
})
