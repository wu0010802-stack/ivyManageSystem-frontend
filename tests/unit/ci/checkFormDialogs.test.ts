import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const script = resolve(process.cwd(), 'scripts/check-form-dialogs.mjs')
const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'ivy-form-dialogs-'))
  dirs.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content, 'utf8')
  }
  return root
}

function run(root: string): string {
  return execFileSync(process.execPath, [script, '--list', '--root', root], { encoding: 'utf8', stdio: 'pipe' })
}

describe('check-form-dialogs 四指標偵測', () => {
  it('A：含 el-dialog＋el-form 但無 FormDialog 的檔案計 1；用了 FormDialog 不計', () => {
    const root = fixture({
      'src/views/RawView.vue': '<el-dialog v-model="v" width="480px"><el-form label-width="90px"><el-form-item /></el-form></el-dialog>',
      'src/views/GoodView.vue': '<FormDialog v-model="v"><el-form label-position="top"><el-form-item /></el-form></FormDialog>',
      'src/views/ConfirmOnly.vue': '<el-dialog v-model="v" width="420px">確定嗎？</el-dialog>',
    })
    const out = run(root)
    expect(out).toMatch(/A=1\b/)
    expect(out).toContain('src/views/RawView.vue')
    expect(out).not.toContain('GoodView.vue')
  })

  it('B／C：dialog 檔內 label-width 與硬寫 px 寬度逐次計數（純確認框不計 B）', () => {
    const root = fixture({
      'src/views/RawView.vue': '<el-dialog v-model="v" width="480px"><el-form label-width="90px"><el-form-item /></el-form></el-dialog><el-dialog width="360px"><el-form label-width="80px" /></el-dialog>',
    })
    const out = run(root)
    expect(out).toMatch(/B=2\b/)
    expect(out).toMatch(/C=2\b/)
  })

  it('D：新增主鈕 type=success 與文字「＋」各計一次', () => {
    const root = fixture({
      'src/views/Btn.vue': '<el-button type="success" @click="open">新增申領</el-button><el-button type="primary">＋ 新增事件</el-button><el-button type="success" size="small">核准</el-button>',
    })
    expect(run(root)).toMatch(/D=2\b/)
  })

  it('排除 portal／parent／__tests__ 路徑', () => {
    const root = fixture({
      'src/views/portal/P.vue': '<el-dialog><el-form /></el-dialog>',
      'src/parent/X.vue': '<el-dialog><el-form /></el-dialog>',
      'src/views/__tests__/T.vue': '<el-dialog><el-form /></el-dialog>',
    })
    expect(run(root)).toMatch(/A=0\b/)
  })
})
