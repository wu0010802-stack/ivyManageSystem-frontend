#!/usr/bin/env node
/**
 * 「直讀 response.data.detail」存量棘輪（只准降、不准升）。
 *
 * 為什麼要擋：`src/api/index.ts` 的 interceptor 已經把後端錯誤正規化成
 * `error.displayMessage`（BusinessError 的 structured detail 摳 message、
 * HTTPException 的字串 detail 直接用、其餘退友善 fallback），元件只要用
 * `friendlyError()` / `apiError()` 就能拿到最佳文案。
 *
 * 繞過它直接讀 `err.response?.data?.detail` 會有兩種退化：
 *   1. detail 是 `{code, message}` 物件或 FastAPI 422 的陣列時，`||` 會取到
 *      該物件本身。丟進 ElMessage 會被當 options 解析，使用者看到的是通用
 *      文案而非為這個錯誤寫好的引導；直接字串串接則渲染成 [object Object]。
 *   2. 5xx / network / timeout 沒有 detail，interceptor 的 DEFAULT_MESSAGES
 *      友善文案被跳過，使用者只看到 caller 自帶的乾巴巴 fallback。
 *
 * 存量 119 處不在本次範圍（逐一改需要逐個確認文案語意），但**不能再長**。
 * 這與 eslint `no-explicit-any` 的 inline disable 棘輪同構，只是改用數字
 * baseline——119 個 inline 註解會製造巨大 diff 且遮蔽 code review 視線。
 *
 * 用法：
 *   node scripts/check-error-detail-ratchet.mjs          # 檢查
 *   node scripts/check-error-detail-ratchet.mjs --list   # 列出所有出現位置
 *
 * 退出碼：0=未超標；1=超出 baseline 或低於 baseline 但未更新數字。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 修掉幾處之後**必須**同步調降這個數字，否則棘輪會鬆掉。
 * 這一步是刻意的：把成果鎖進版控，等同 eslint 的
 * `reportUnusedDisableDirectives: 'error'`。
 */
const BASELINE = 112

/** 這些檔案本來就該讀 raw detail——interceptor 與錯誤訊息 helper 自己。 */
const EXEMPT = new Set([
  'src/api/index.ts',
  'src/parent/api/index.ts',
  'src/utils/error.ts',
  'src/utils/errorMessages.ts',
])

const PATTERN = /\bdata\s*\??\.\s*detail\b/g

function scan(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      scan(full, out)
      continue
    }
    if (!/\.(ts|vue)$/.test(entry)) continue
    const rel = full.replace(/\\/g, '/')
    if (EXEMPT.has(rel)) continue

    const lines = readFileSync(full, 'utf-8').split('\n')
    lines.forEach((line, i) => {
      const hits = line.match(PATTERN)
      if (hits) out.push({ file: rel, line: i + 1, count: hits.length, text: line.trim() })
    })
  }
  return out
}

const occurrences = scan('src')
const total = occurrences.reduce((sum, o) => sum + o.count, 0)

if (process.argv.includes('--list')) {
  for (const o of occurrences) {
    console.log(`${o.file}:${o.line}  ${o.text.slice(0, 100)}`)
  }
  console.log(`\n合計 ${total} 處，分佈於 ${new Set(occurrences.map((o) => o.file)).size} 個檔案`)
  process.exit(0)
}

if (total > BASELINE) {
  console.error(
    `✗ 直讀 response.data.detail 的處數增加了：${total} > baseline ${BASELINE}\n\n` +
      `新的錯誤處理請改用：\n` +
      `  import { friendlyError } from '@/utils/errorMessages'\n` +
      `  ElMessage.error(friendlyError('儲存失敗', err))\n\n` +
      `或 apiError(err, '預設文案')。兩者都會優先採用 interceptor 算好的\n` +
      `error.displayMessage，物件型 detail 與 5xx 友善文案都已處理過。\n\n` +
      `跑 \`node scripts/check-error-detail-ratchet.mjs --list\` 看完整清單。`
  )
  process.exit(1)
}

if (total < BASELINE) {
  console.error(
    `✗ 存量已降到 ${total}（baseline 仍寫 ${BASELINE}）。\n` +
      `請把 scripts/check-error-detail-ratchet.mjs 的 BASELINE 改成 ${total}，\n` +
      `把成果鎖進版控——否則棘輪會鬆掉，之後有人加回來也不會被擋。`
  )
  process.exit(1)
}

console.log(`✓ 直讀 response.data.detail 維持 ${total} 處（baseline ${BASELINE}）`)
