import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const createdDirs: string[] = []
const script = resolve(process.cwd(), 'scripts/check-audit-allowlist.mjs')

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('npm audit allowlist gate', () => {
  it('npm audit 回傳 error 物件時必須 fail closed', () => {
    const binDir = mkdtempSync(join(tmpdir(), 'ivy-audit-bin-'))
    createdDirs.push(binDir)
    const fakeNpm = join(binDir, 'npm')
    writeFileSync(
      fakeNpm,
      '#!/bin/sh\nprintf \'%s\\n\' \'{"error":{"code":"EAUDITNOLOCK","summary":"missing lockfile"}}\'\nexit 1\n',
      'utf8',
    )
    chmodSync(fakeNpm, 0o755)

    expect(() =>
      execFileSync(process.execPath, [script], {
        encoding: 'utf8',
        env: { ...process.env, PATH: binDir },
        stdio: 'pipe',
      }),
    ).toThrow()
  })
})
