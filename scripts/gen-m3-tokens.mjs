#!/usr/bin/env node
/**
 * 從 IvyKids source color (#0d9053) 用 Material Color Utilities 算法生成
 * 家長端 M3 tonal palette CSS variables，輸出到 stdout。
 *
 * 使用：
 *   node scripts/gen-m3-tokens.mjs > src/parent/styles/m3-tokens.css
 *
 * 來源色票：#0d9053（IvyKids 深綠，spec §3.1）
 */
import {
  argbFromHex,
  hexFromArgb,
  themeFromSourceColor,
} from '@material/material-color-utilities'

const SOURCE_HEX = '#0d9053'
const argb = argbFromHex(SOURCE_HEX)
const theme = themeFromSourceColor(argb)

function camelToKebab(s) {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}

/**
 * 從 scheme.toJSON() 取出 M3 token，加 `--m3-` 前綴。
 * 補上 surface-container-* 階層（M3 後期新增，scheme JSON 沒帶）。
 */
function schemeToCss(scheme, neutralPalette, isDark) {
  const lines = []
  for (const [k, v] of Object.entries(scheme.toJSON())) {
    lines.push(`  --m3-${camelToKebab(k)}: ${hexFromArgb(v)};`)
  }
  // M3 surface-container tonal hierarchy
  const tones = isDark
    ? { lowest: 4, low: 10, base: 12, high: 17, highest: 22 }
    : { lowest: 100, low: 96, base: 94, high: 92, highest: 90 }
  lines.push(
    `  --m3-surface-container-lowest: ${hexFromArgb(neutralPalette.tone(tones.lowest))};`,
  )
  lines.push(
    `  --m3-surface-container-low: ${hexFromArgb(neutralPalette.tone(tones.low))};`,
  )
  lines.push(
    `  --m3-surface-container: ${hexFromArgb(neutralPalette.tone(tones.base))};`,
  )
  lines.push(
    `  --m3-surface-container-high: ${hexFromArgb(neutralPalette.tone(tones.high))};`,
  )
  lines.push(
    `  --m3-surface-container-highest: ${hexFromArgb(neutralPalette.tone(tones.highest))};`,
  )
  return lines.join('\n')
}

const header = `/**
 * Material 3 color tokens — auto-generated from source color ${SOURCE_HEX}.
 *
 * !! DO NOT EDIT BY HAND !!
 * 重新生成：node scripts/gen-m3-tokens.mjs > src/parent/styles/m3-tokens.css
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §3.1
 * Generator: scripts/gen-m3-tokens.mjs
 */

`

const lightBlock = `:root {\n${schemeToCss(theme.schemes.light, theme.palettes.neutral, false)}\n}\n`
const darkBlock = `:root[data-theme='dark'] {\n${schemeToCss(theme.schemes.dark, theme.palettes.neutral, true)}\n}\n`

const stateAndCommon = `
:root {
  /* State layer alpha — 所有 variant 共用 */
  --m3-state-hover: 0.08;
  --m3-state-focus: 0.12;
  --m3-state-pressed: 0.12;
  --m3-state-dragged: 0.16;
}
`

process.stdout.write(header + lightBlock + '\n' + darkBlock + stateAndCommon)
