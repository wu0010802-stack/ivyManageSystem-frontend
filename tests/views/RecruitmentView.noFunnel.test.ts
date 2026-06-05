import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const src = fs.readFileSync(
  path.resolve(__dirname, '../../src/views/RecruitmentView.vue'),
  'utf-8',
)

describe('RecruitmentView 移除漏斗 tab', () => {
  it('no funnel tab / FunnelBoard import', () => {
    expect(src).not.toMatch(/name="funnel"/)
    expect(src).not.toContain('FunnelBoard')
  })
  it('keeps overview funnel_snapshot stats (非看板)', () => {
    expect(src).toContain('funnel_snapshot')
  })
})
