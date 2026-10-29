import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// 資安稽核 2026-10-29 P3：後端把職位標準底薪、年級目標、考勤政策、職稱節慶等級等
// 「算錢基準」設定寫入改成除 SETTINGS_WRITE 外還要金流簽核（ACTIVITY_PAYMENT_APPROVE，
// 後端 utils/finance_guards.require_salary_config_finance_approve；PUT /config/bonus
// 早就如此）。前端若只看 SETTINGS_WRITE 就開放編輯，使用者會填完整張表才吃 403。
//
// 此 gate 擋整類：「元件呼叫金流簽核守衛的設定寫入 wrapper，卻沒有任何
// ACTIVITY_PAYMENT_APPROVE 權限判斷」。後端新增同類守衛時，把對應 wrapper 加進
// FINANCE_GUARDED_CONFIG_WRITERS（後端權威清單見
// tests/test_salary_config_endpoints_finance_guard_2026_10_29.py）。

const FINANCE_GUARDED_CONFIG_WRITERS = [
  'updateBonusConfig', // PUT /config/bonus
  'updateGradeTargets', // PUT /config/grade-targets
  'updatePositionSalary', // PUT /config/position-salary
  'updateAttendancePolicy', // PUT /config/attendance-policy
  'createTitle', // POST /config/titles（帶 bonus_grade 時）
  'updateTitle', // PUT /config/titles/{id}（改名稱或 bonus_grade 時）
]

const APPROVE_CHECK = /hasPermission\(\s*['"]ACTIVITY_PAYMENT_APPROVE['"]\s*\)/

function collectFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === '_generated') continue
      out.push(...collectFiles(full))
    } else if (/\.(vue|ts)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) {
      out.push(full)
    }
  }
  return out
}

describe('金流簽核守衛的設定寫入：前端呼叫端必檢查 ACTIVITY_PAYMENT_APPROVE', () => {
  const files = collectFiles('src').filter((f) => !f.startsWith(join('src', 'api')))

  it('wrapper 仍存在於 src/api/config.ts（改名時同步本清單）', () => {
    const api = readFileSync('src/api/config.ts', 'utf8')
    for (const name of FINANCE_GUARDED_CONFIG_WRITERS) {
      expect(api, `src/api/config.ts 找不到 ${name}`).toMatch(new RegExp(`export const ${name}\\b`))
    }
  })

  it('呼叫端皆含 ACTIVITY_PAYMENT_APPROVE 權限判斷', () => {
    const offenders: string[] = []
    let callSites = 0
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      const used = FINANCE_GUARDED_CONFIG_WRITERS.filter((n) => new RegExp(`\\b${n}\\s*\\(`).test(src))
      if (used.length === 0) continue
      callSites += 1
      if (!APPROVE_CHECK.test(src)) offenders.push(`${f}（${used.join(', ')}）`)
    }
    // 防空轉：至少要掃到 BonusConfigPanel／StandardSalaryTab／JobTitleGradeTab
    expect(callSites).toBeGreaterThanOrEqual(3)
    expect(offenders, '以下檔案呼叫金流簽核守衛的設定寫入卻未檢查金流簽核權限').toEqual([])
  })
})
