import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// @ts-expect-error TODO(ts-strict): scripts/ 下的 .mjs 無型別宣告，此為建置工具共用模組
import { extractIconNames } from '../../../scripts/lib/parent-icon-names.mjs'

/**
 * 自架 Material Symbols 子集字型守衛。
 *
 * 家長端圖示字型是 build 進 repo 的子集 woff2（src/parent/assets/fonts/），
 * 新增 icon 用法卻忘記跑 `npm run gen:parent-icons` 的話，該 icon 不在字型裡，
 * prod 會 render 成 ligature 原文（LIFF 跑版事故 2026-08-12/13 的根因型態）。
 * 這裡用與 gen script 同一份抽取器比對 manifest，保證掃描結果一致。
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const fontDir = path.join(repoRoot, 'src/parent/assets/fonts')

describe('家長端 icon 子集字型', () => {
  it('字型檔與 manifest 存在', () => {
    expect(fs.existsSync(path.join(fontDir, 'material-symbols-rounded-subset.woff2'))).toBe(true)
    expect(fs.existsSync(path.join(fontDir, 'material-symbols-manifest.json'))).toBe(true)
  })

  it('原始碼用到的 icon 名都在 manifest 內（否則跑 npm run gen:parent-icons 重產）', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(fontDir, 'material-symbols-manifest.json'), 'utf8'),
    ) as { candidates: string[] }
    const known = new Set(manifest.candidates)
    const missing = extractIconNames(repoRoot).filter((n: string) => !known.has(n))
    expect(
      missing,
      `以下 icon 名不在子集字型 manifest 裡，會在 prod render 成 ligature 原文：`
      + `${missing.join(', ')}\n請執行 npm run gen:parent-icons 重產字型後一併 commit`,
    ).toEqual([])
  })
})
