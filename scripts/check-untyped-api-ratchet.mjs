#!/usr/bin/env node
/**
 * 「沒有型別的 api 呼叫」存量棘輪（只准降、不准升）。
 *
 * 為什麼要擋：後端補上 response_model 之後，`npm run gen:api` 產出的
 * `src/api/_generated/schema.d.ts` 已經描述了回應形狀，但 api 層若還是寫
 * `api.get('/x')`，回傳就是 `AxiosResponse<any>`——呼叫端只好各自手寫一份
 * interface（例如家長端 FeesView／AttendanceView 曾經這樣），後端改欄位時
 * 前端型別不會跟著紅，契約漂移要到執行期才看得到。
 *
 * 「有型別」的判定（啟發式，刻意寬鬆，只為擋增量）：
 *   1. 呼叫本身帶泛型：`api.get<Foo>(...)`；或
 *   2. 呼叫所在的 export 敘述裡，回傳型別寫了 `AxiosResp<`／`ApiResponse<`／
 *      `Promise<`（例如 `export const f = (): AxiosResp<'/x', 'get'> => api.get('/x')`）。
 * 其餘都算「沒有型別」。存量不在本次範圍，但**不能再長**。
 *
 * 掃描範圍：src/api 與 src/parent/api 底下的 .ts（排除 __tests__、_generated
 * 與兩支 axios instance 定義檔）。
 *
 * 用法：
 *   node scripts/check-untyped-api-ratchet.mjs          # 檢查
 *   node scripts/check-untyped-api-ratchet.mjs --list   # 列出所有沒有型別的呼叫
 *
 * 退出碼：0＝等於 baseline；1＝超出 baseline，或已低於 baseline 但沒更新數字。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 補好型別之後**必須**同步調降這個數字，否則棘輪會鬆掉。
 * 與 check-error-detail-ratchet.mjs 同一套作法：把成果鎖進版控。
 */
const BASELINE = 454

const ROOTS = ['src/api', 'src/parent/api']

const EXEMPT = new Set(['src/api/index.ts', 'src/parent/api/index.ts'])

const SKIP_DIRS = new Set(['__tests__', '_generated'])

const CALL = /\b(?:api|parentApi)\s*\.\s*(?:get|post|put|patch|delete)\s*(<)?/g

const TYPED_RETURN = /\b(?:AxiosResp|ApiResponse|Promise)\s*</

/** 往前找到這個呼叫所屬 export 敘述的開頭（找不到就從檔頭）。 */
function statementStart(src, pos) {
  const idx = src.lastIndexOf('\nexport ', pos)
  return idx === -1 ? 0 : idx
}

function scan(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) scan(full, out)
      continue
    }
    if (!entry.endsWith('.ts') || entry.endsWith('.d.ts')) continue
    const rel = full.replace(/\\/g, '/')
    if (EXEMPT.has(rel)) continue

    const src = readFileSync(full, 'utf-8')
    for (const m of src.matchAll(CALL)) {
      if (m[1]) continue
      const head = src.slice(statementStart(src, m.index), m.index)
      if (TYPED_RETURN.test(head)) continue
      const line = src.slice(0, m.index).split('\n').length
      const text = src.split('\n')[line - 1].trim()
      out.push({ file: rel, line, text })
    }
  }
  return out
}

const occurrences = ROOTS.flatMap((root) => scan(root))
const total = occurrences.length

if (process.argv.includes('--list')) {
  for (const o of occurrences) {
    console.log(`${o.file}:${o.line}  ${o.text.slice(0, 100)}`)
  }
  console.log(`\n合計 ${total} 處，分佈於 ${new Set(occurrences.map((o) => o.file)).size} 個檔案`)
  process.exit(0)
}

if (total > BASELINE) {
  console.error(
    `✗ 沒有型別的 api 呼叫增加了：${total} > baseline ${BASELINE}\n\n` +
      `後端端點有 response_model 時，請改用產生型別：\n` +
      `  import type { AxiosResp } from '@/api/_generated/typed'\n` +
      `  export const getFoo = (): AxiosResp<'/foo', 'get'> => api.get('/foo')\n\n` +
      `後端還沒有 response_model（schema.d.ts 是 unknown）時，先請後端補；\n` +
      `真的補不了再用 api.get<手寫型別>(...) 過渡。\n\n` +
      `跑 \`node scripts/check-untyped-api-ratchet.mjs --list\` 看完整清單。`
  )
  process.exit(1)
}

if (total < BASELINE) {
  console.error(
    `✗ 存量已降到 ${total}（baseline 仍寫 ${BASELINE}）。\n` +
      `請把 scripts/check-untyped-api-ratchet.mjs 的 BASELINE 改成 ${total}，\n` +
      `把成果鎖進版控——否則棘輪會鬆掉，之後有人加回來也不會被擋。`
  )
  process.exit(1)
}

console.log(`✓ 沒有型別的 api 呼叫維持 ${total} 處（baseline ${BASELINE}）`)
