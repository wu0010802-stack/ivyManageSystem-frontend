import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// el-table 的 cell slot 在 jsdom 無法可靠渲染（會量測 DOM 尺寸 = 0），
// 故以結構性斷言驗證守衛條件與 emit 宣告（與其他 wiring 測試一致）。
const src = fs.readFileSync(
  path.resolve(__dirname, '../../src/components/recruitment/RecruitmentDetailTab.vue'),
  'utf-8',
)

describe('RecruitmentDetailTab 保留座位', () => {
  it('保留座位仍受 canWrite 與 has_deposit 雙重把關', () => {
    // 2026-09-06 起「保留座位」移進操作欄的「更多」下拉：canWrite 掛在 el-dropdown
    // 上（沒有寫權限整個下拉不出現），has_deposit 掛在該選項上。守衛條件不變，
    // 只是拆成兩層。
    expect(src).toMatch(/<el-dropdown v-if="canWrite"/)
    expect(src).toMatch(/<el-dropdown-item v-if="row\.has_deposit" command="reserve"/)
    expect(src).toContain("emit('reserve', row)")
  })

  it('label switches between 保留座位 / 變更座位 by provisional_grade_id', () => {
    expect(src).toMatch(/row\.provisional_grade_id \? '變更座位' : '保留座位'/)
  })

  it("declares 'reserve' emit", () => {
    expect(src).toMatch(/'reserve':\s*\[row: Record<string, unknown>\]/)
  })

  it('退預繳／退註冊同樣在下拉內，已退出的不再顯示', () => {
    expect(src).toMatch(/v-if="!row\.withdrawn_at && \(row\.has_deposit \|\| row\.enrolled\)"/)
    expect(src).toMatch(/row\.enrolled \? '退註冊' : '退預繳'/)
    expect(src).toContain("emit('withdraw', row)")
  })
})
