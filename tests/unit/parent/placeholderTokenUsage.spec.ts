import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * --pt-text-placeholder（light #9ca3af，白底僅 2.54:1）只准用在輸入框 placeholder。
 *
 * 2026-10 盤點到 17 處把它當資訊文字（繳費週期、收據提示、空狀態、監護人關係、
 * 用藥提示、關閉鈕圖示…），長輩幾乎看不見；一律改 --pt-text-muted（m3
 * on-surface-variant，白底 9.4:1）。此守衛擋住同類誤用再出現：主色位置（第一個
 * var）是 placeholder token 的 color 宣告，選擇器必須是 ::placeholder 類。
 * `var(--m3-on-surface-variant, var(--pt-text-placeholder))` 這種永不生效的 fallback 不算。
 */
const root = resolve(__dirname, '../../../src/parent')

describe('--pt-text-placeholder 不得當資訊文字色', () => {
  it('只出現在 ::placeholder／:placeholder-shown 規則', () => {
    const offenders: string[] = []
    for (const entry of readdirSync(root, { recursive: true }) as string[]) {
      const file = String(entry)
      if (!file.endsWith('.vue') && !file.endsWith('.css')) continue
      if (file.endsWith('styles/globals.css')) continue
      const src = readFileSync(resolve(root, file), 'utf-8')
      const styleStart = file.endsWith('.vue') ? src.indexOf('<style') : 0
      if (styleStart < 0) continue
      for (const m of src.slice(styleStart).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/(?:^|[;\s])color:\s*var\(--pt-text-placeholder\b/.test(m[2])) continue
        const selector = m[1].trim().split('\n').pop() ?? ''
        if (!/placeholder/.test(selector)) offenders.push(`${file} ${selector}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
