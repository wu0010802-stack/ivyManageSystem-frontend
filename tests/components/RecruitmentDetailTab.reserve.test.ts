import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// el-table 的 cell slot 在 jsdom 無法可靠渲染（會量測 DOM 尺寸 = 0），
// 故以結構性斷言驗證 reserve 按鈕的守衛條件與 emit 宣告（與其他 wiring 測試一致）。
const src = fs.readFileSync(
  path.resolve(__dirname, '../../src/components/recruitment/RecruitmentDetailTab.vue'),
  'utf-8',
)

describe('RecruitmentDetailTab 保留座位', () => {
  it('reserve button is gated by canWrite && row.has_deposit', () => {
    expect(src).toMatch(/v-if="canWrite && row\.has_deposit"/)
    expect(src).toContain("$emit('reserve', row)")
  })

  it('label switches between 保留座位 / 變更座位 by provisional_grade_id', () => {
    expect(src).toMatch(/row\.provisional_grade_id \? '變更座位' : '保留座位'/)
  })

  it("declares 'reserve' emit", () => {
    expect(src).toMatch(/'reserve':\s*\[row: Record<string, unknown>\]/)
  })
})
