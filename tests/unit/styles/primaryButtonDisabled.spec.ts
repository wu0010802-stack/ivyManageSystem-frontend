/**
 * tests/unit/styles/primaryButtonDisabled.spec.ts
 *
 * main.css 以 !important 覆寫實心 primary 鈕底色；若沒排除 .is-disabled，
 * EP 的停用底色（--el-button-disabled-bg-color）會被蓋掉，停用鈕看起來跟可按時
 * 一模一樣（2026-10-12 預編班審查：有 10 項阻擋時「發布」仍像可按）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf-8')

describe('main.css 實心 primary 鈕覆寫', () => {
  it('每一條帶 !important 的 .el-button--primary 底色覆寫都排除 .is-disabled', () => {
    const rules = [...css.matchAll(/([^{}]*\.el-button--primary[^{}]*)\{([^}]*)\}/g)]
      .filter(([, , body]) => /background-color:[^;]*!important/.test(body))
    expect(rules.length).toBeGreaterThan(0)
    for (const [, selector] of rules) {
      for (const part of selector.split(',')) {
        if (!part.includes('.el-button--primary')) continue
        expect(part, part.trim()).toContain(':not(.is-disabled)')
      }
    }
  })

  it('停用的實心 primary 改用中性底色（不是淡主色），停用時不比可按的一般鈕搶眼', () => {
    const rule = css.match(/\.el-button--primary\.is-disabled:not\(\.is-plain\):not\(\.is-link\):not\(\.is-text\)\s*\{([^}]*)\}/)
    expect(rule, '缺少停用 primary 的中性樣式').not.toBeNull()
    expect(rule![1]).toContain('--el-button-disabled-bg-color: var(--el-fill-color-light)')
    expect(rule![1]).toContain('--el-button-disabled-text-color: var(--el-text-color-placeholder)')
  })
})
