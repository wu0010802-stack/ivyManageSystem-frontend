/**
 * tests/unit/styles/primaryButtonScope.spec.ts
 *
 * 實心 primary 鈕的新底色（--el-color-primary，後台＝#0277b5，白字 4.87:1）只能套在後台：
 * `ivy-admin` 這個 class 只在 AdminLayout 掛載時才加到 <html>，登入頁、打卡機頁、錯誤頁等 layout 外的頁面
 * 在淺色模式的 --el-color-primary 是 Element Plus 預設 #409eff（白字約 3:1）。新規則帶 !important，
 * 沒限範圍就會蓋掉那些頁面自己的按鈕色，而且比修之前更差。
 * 所以：基底規則（所有頁面）維持 --color-primary／--color-primary-soft，後台另有一組 html.ivy-admin 底下的規則。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '')

interface Rule { parts: string[]; body: string }
// body 不含 { }：@media 之類的外層區塊不會被當成一條規則吃掉裡面的規則
const rules: Rule[] = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  parts: selector.split(',').map((part) => part.trim()),
  body,
}))

const SOLID = '.el-button--primary:not(.is-plain):not(.is-link):not(.is-text):not(.is-disabled)'
const isInteractive = (part: string) => /:(hover|focus)$/.test(part)
const solidRules = rules.filter((r) => r.parts.some((p) => p.includes(SOLID)) && /background-color:[^;]*!important/.test(r.body))
const resting = (scoped: boolean) =>
  solidRules.find((r) => r.parts.every((p) => !isInteractive(p) && p.startsWith('html.ivy-admin ') === scoped))
const interactive = (scoped: boolean) =>
  solidRules.find((r) => r.parts.every((p) => isInteractive(p) && p.startsWith('html.ivy-admin ') === scoped))

describe('main.css 實心 primary 鈕：新底色只套在後台', () => {
  it('基底規則（所有頁面，含登入頁等 layout 外頁面）維持 --color-primary，hover／focus 維持 --color-primary-soft', () => {
    const base = resting(false)
    expect(base, '缺少不限範圍的基底規則').toBeDefined()
    expect(base!.body).toContain('background-color: var(--color-primary) !important')
    expect(base!.body).toContain('border-color: var(--color-primary) !important')
    const hover = interactive(false)
    expect(hover, '缺少不限範圍的 hover／focus 基底規則').toBeDefined()
    expect(hover!.body).toContain('background-color: var(--color-primary-soft) !important')
    expect(hover!.body).toContain('border-color: var(--color-primary-soft) !important')
  })

  it('後台（html.ivy-admin）另有同 selector 規則：底色／邊框 --el-color-primary，hover／focus --brand-primary-hover', () => {
    const admin = resting(true)
    expect(admin, '缺少 html.ivy-admin 底下的規則').toBeDefined()
    expect(admin!.body).toContain('background-color: var(--el-color-primary) !important')
    expect(admin!.body).toContain('border-color: var(--el-color-primary) !important')
    const hover = interactive(true)
    expect(hover, '缺少 html.ivy-admin 底下的 hover／focus 規則').toBeDefined()
    expect(hover!.body).toContain('background-color: var(--brand-primary-hover) !important')
    expect(hover!.body).toContain('border-color: var(--brand-primary-hover) !important')
  })

  it('任何用 --el-color-primary 當實心鈕底色的規則，每個 selector 都在 html.ivy-admin 範圍內', () => {
    const usingElPrimary = solidRules.filter((r) => /(background-color|border-color):\s*var\(--el-color-primary\)/.test(r.body))
    expect(usingElPrimary.length).toBeGreaterThan(0)
    for (const rule of usingElPrimary) {
      for (const part of rule.parts) expect(part, part).toMatch(/^html\.ivy-admin\s/)
    }
  })
})
