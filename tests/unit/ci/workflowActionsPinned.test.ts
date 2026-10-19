/**
 * F33（2026-10-19）：GitHub Actions 的 `uses:` 必須釘完整 40 字元 commit SHA。
 * 浮動 tag（@v7）可被上游（或竊得維護者權限者）改指向任意 commit，對
 * `pull_request_target`＋`contents: write` 的 dependabot-auto-merge 尤其致命。
 * SHA 之後須附 `# vX.Y.Z` 註解，讓人與 Dependabot 看得出版本。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const DIR = resolve(process.cwd(), '.github/workflows')
const files = readdirSync(DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))

describe('F33：workflow uses: 一律釘完整 commit SHA', () => {
  it('至少掃到 ci.yml 與 dependabot-auto-merge.yml', () => {
    expect(files).toEqual(expect.arrayContaining(['ci.yml', 'dependabot-auto-merge.yml']))
  })

  it.each(files)('%s 的每個 uses: 都是 owner/repo@<40 hex> # vX.Y.Z', (file) => {
    const lines = readFileSync(resolve(DIR, file), 'utf-8').split('\n')
    const uses = lines.filter((l) => /^\s*(-\s*)?uses:/.test(l))
    expect(uses.length).toBeGreaterThan(0)
    const bad = uses.filter(
      (l) => !/uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40}\s+#\s*v\d+\.\d+\.\d+\b/.test(l),
    )
    expect(bad).toEqual([])
  })
})
