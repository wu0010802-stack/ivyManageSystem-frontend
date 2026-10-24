import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const script = resolve(process.cwd(), 'scripts/check-shared-constants.mjs')
const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'ivy-shared-const-'))
  dirs.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content, 'utf8')
  }
  return root
}

const FE_FILES = {
  'src/constants/laborCompliance.ts': 'export const MINIMUM_MONTHLY_WAGE = 29500\nexport const MINIMUM_HOURLY_WAGE = 196\n',
  'src/constants/pos.ts': 'export const REFUND_APPROVAL_THRESHOLD = 1000\n',
  'src/constants/activity.ts':
    'export const GRADE_TARGET_BONUS = 1000\nexport const FIELD_RULES = { voidReasonMin: 5, refundReasonMin: 15, unlockReasonMin: 10 }\n',
}

// 後端 2026-10-22 起基本工資改年度表，常數取表尾一列（services/salary/minimum_wage.py）
const wageTable = (lastRow: string) => `MINIMUM_WAGE_TABLE: Tuple[Tuple[date, int, int], ...] = (
    (date(2025, 1, 1), 28590, 190),
    ${lastRow}
)

MINIMUM_MONTHLY_WAGE = MINIMUM_WAGE_TABLE[-1][1]
MINIMUM_HOURLY_WAGE = MINIMUM_WAGE_TABLE[-1][2]
`

function backend(minimumWageSource: string): string {
  return tree({
    'services/salary/minimum_wage.py': minimumWageSource,
    'utils/activity_constants.py':
      'REFUND_APPROVAL_THRESHOLD = 1000\nGRADE_TARGET_BONUS = 1000\nMIN_VOID_REASON_LENGTH = 5\nMIN_REFUND_REASON_LENGTH = 15\n',
    'schemas/activity_admin.py': '_UNLOCK_REASON_MIN_LENGTH = 10\n',
  })
}

function run(beRoot: string) {
  const feRoot = tree(FE_FILES)
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, IVY_FRONTEND_DIR: feRoot, IVY_BACKEND_DIR: beRoot },
  })
}

describe('check-shared-constants 後端年度表引用', () => {
  it('後端常數寫成 TABLE[-1][i] 時取表尾一列比對，值相同即通過', () => {
    const r = run(backend(wageTable('(date(2026, 1, 1), 29500, 196),')))
    expect(r.stdout).toContain('BE MINIMUM_MONTHLY_WAGE=29500')
    expect(r.stdout).toContain('BE MINIMUM_HOURLY_WAGE=196')
    expect(r.status).toBe(0)
  })

  it('表尾一列與前端不同時判漂移', () => {
    const r = run(backend(wageTable('(date(2027, 1, 1), 30300, 202),')))
    expect(r.stdout).toContain('[DRIFT] 基本工資（月薪）')
    expect(r.stdout).toContain('BE MINIMUM_MONTHLY_WAGE=30300')
    expect(r.status).toBe(1)
  })

  it('引用的表不存在時視為解析失敗（fail closed）', () => {
    const r = run(backend('MINIMUM_MONTHLY_WAGE = OTHER_TABLE[-1][1]\nMINIMUM_HOURLY_WAGE = OTHER_TABLE[-1][2]\n'))
    expect(r.stdout).toContain('BE MINIMUM_MONTHLY_WAGE=null')
    expect(r.status).toBe(1)
  })

  it('直接寫數字的舊格式仍可解析', () => {
    const r = run(backend('MINIMUM_MONTHLY_WAGE = 29_500\nMINIMUM_HOURLY_WAGE = 196\n'))
    expect(r.status).toBe(0)
  })
})
