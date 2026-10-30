// @vitest-environment node
/**
 * 家長端共用檔 chunk 指派守衛（fe-structure-1 階段 1）。
 *
 * 為什麼需要：vite.config.js 的 manualChunks 有一份 shared-common 釘選清單，凡是
 * 「家長端（src/parent）與管理端／公開頁共用、且 Element Plus-free」的檔都必須明確
 * 指派 chunk。漏 pin 時 Rollup 會把它吸進第一個用到它的 chunk（常是 parent-app），
 * 讓 admin／public 入口靜態橋接整包 parent-app——同型回歸已發生七次，每次都要等
 * `npm run build` 的 check-entry-chunks.mjs 才紅（甚至 staging 部署失敗才發現）。
 *
 * 這裡把檢查提早到單元測試：從 src/parent/** 出發，沿靜態／動態 import 走到所有
 * src/parent 以外的 src 模組（遞移），逐一用「真正的」manualChunks 判定它會落哪個
 * chunk。凡判定為 undefined（交給 Rollup 自行決定）或 admin-core（家長端不得靜態
 * 可達）一律 fail，並列出 import 路徑，提示要補進 SHARED_COMMON_PINS。
 *
 * 另外驗證 SHARED_COMMON_PINS 本身：每條都要指得到實際檔案／目錄（改名後殘留的
 * pin 會讓新路徑默默失守），且被釘的檔不得靜態 import element-plus。
 */
import { describe, expect, it, vi } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

vi.mock('vite-plugin-pwa', () => ({ VitePWA: () => [] }))
import config, { SHARED_COMMON_PINS } from '../../../vite.config.js'

const ROOT = resolve(__dirname, '../../..')
const SRC = join(ROOT, 'src')
const PARENT = join(SRC, 'parent')

type ManualChunks = (id: string) => string | undefined
const manualChunks = (config as { build: { rollupOptions: { output: { manualChunks: ManualChunks } } } })
  .build.rollupOptions.output.manualChunks

// 家長端可以（也應該）落的 chunk；admin-core 由 check-entry-chunks.mjs 對 parent 設為 forbidden。
const FORBIDDEN_FOR_PARENT = new Set(['admin-core'])

const EXTS = ['', '.ts', '.js', '.vue', '/index.ts', '/index.js']
const isTestFile = (f: string) => /(__tests__|\.(test|spec)\.)/.test(f)

function collectFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...collectFiles(full))
    else if (/\.(vue|ts|js)$/.test(e.name) && !e.name.endsWith('.d.ts') && !isTestFile(full)) out.push(full)
  }
  return out
}

// 只取會產生執行期 import 的語句：略過 `import type` / `export type`（編譯後消失）。
const IMPORT_RE =
  /(?:^|[\n;])\s*(?:import|export)\s+(?!type\s)(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

function importsOf(file: string): { spec: string; dynamic: boolean }[] {
  const code = readFileSync(file, 'utf8')
  const out: { spec: string; dynamic: boolean }[] = []
  for (const m of code.matchAll(IMPORT_RE)) out.push({ spec: m[1] ?? m[2], dynamic: m[1] === undefined })
  return out
}

function resolveSpec(spec: string, from: string): string | null {
  const clean = spec.split('?')[0]
  let base: string
  if (clean.startsWith('@/')) base = join(SRC, clean.slice(2))
  else if (clean.startsWith('.')) base = resolve(dirname(from), clean)
  else return null // node_modules：由 vendor／各 feature-lib 規則負責
  for (const ext of EXTS) {
    const p = base + ext
    if (existsSync(p) && statSync(p).isFile()) return p
  }
  return null
}

const rel = (p: string) => relative(ROOT, p)

describe('家長端可達的共用模組都必須有明確 chunk 指派（shared-common pin 守衛）', () => {
  it('src/parent 以外、被家長端遞移 import 的 src 模組，manualChunks 不得回 undefined / admin-core', () => {
    const parentFiles = collectFiles(PARENT)
    expect(parentFiles.length).toBeGreaterThan(50)

    // BFS：reachedBy key = 被「靜態」import 到的非 parent 模組，value = 第一個 importer（報錯用）。
    // 只被 `import()` 動態載入的模組（如 tenantBlocked → TenantBlockedScreen.vue）Rollup
    // 會切成自己的 async chunk，不需要 pin（pin 進 shared-common 反而會讓三端首屏多載）；
    // 但仍沿它往下走，它的靜態依賴照樣要有明確指派。
    const reachedBy = new Map<string, string>()
    const walked = new Set<string>()
    const queue: string[] = []
    const visit = (from: string) => {
      for (const { spec, dynamic } of importsOf(from)) {
        const target = resolveSpec(spec, from)
        if (!target || target.startsWith(PARENT + '/') || !target.startsWith(SRC + '/')) continue
        if (!dynamic && !reachedBy.has(target)) reachedBy.set(target, from)
        if (walked.has(target)) continue
        walked.add(target)
        queue.push(target)
      }
    }
    parentFiles.forEach(visit)
    while (queue.length) visit(queue.shift()!)

    expect(reachedBy.size).toBeGreaterThan(10)

    const offenders: string[] = []
    for (const [mod, importer] of reachedBy) {
      const chunk = manualChunks(mod)
      if (chunk === undefined || FORBIDDEN_FOR_PARENT.has(chunk)) {
        offenders.push(`${rel(mod)} → ${chunk ?? '(未指派)'}（由 ${rel(importer)} import）`)
      }
    }
    expect(
      offenders,
      `以下模組被家長端 import 但沒有明確 chunk 指派（或落在家長端禁區）。\n` +
        `EP-free 的三端共用檔請加進 vite.config.js 的 SHARED_COMMON_PINS：\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('SHARED_COMMON_PINS 每一條都指得到實際檔案或目錄（防改名後殘留失效 pin）', () => {
    const stale = SHARED_COMMON_PINS.filter((p: string) => !existsSync(join(ROOT, p)))
    expect(stale).toEqual([])
  })

  it('SHARED_COMMON_PINS 的檔案不得靜態 import element-plus（否則家長端被迫載 EP）', () => {
    const files = SHARED_COMMON_PINS.flatMap((p: string) => {
      const abs = join(ROOT, p)
      return statSync(abs).isDirectory() ? collectFiles(abs) : [abs]
    })
    const offenders = files.filter((f: string) => /\bfrom\s*['"](element-plus|@element-plus\/[^'"]*)['"]/.test(readFileSync(f, 'utf8')))
    expect(offenders.map(rel)).toEqual([])
  })
})
