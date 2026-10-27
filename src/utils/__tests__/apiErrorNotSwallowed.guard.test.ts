import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/**
 * 擋整類守衛（2026-10-27 UI/UX 安全批）：`apiError()` 只「回傳」顯示文字，不會自己跳提示。
 *
 * 曾有 13 處把它當成獨立一行呼叫（`catch (e) { apiError(e, '餵藥失敗') }`），回傳值被丟掉，
 * 使用者按了「餵藥」失敗卻什麼都看不到。本測試掃描 src 下所有 .vue／.ts，凡是 `apiError(`
 * 前面緊接的不是「把值拿去用」的語法（`(`、`=`、`,`、`?`、`:`、`${`、`return`…）就視為吞錯。
 * 要顯示錯誤請寫 `ElMessage.error(apiError(e, '…'))`，或把回傳值存進畫面上的錯誤狀態。
 */

const SRC = resolve(__dirname, '../..')

function collect(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name === '_generated') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) collect(p, out)
    else if (/\.(vue|ts)$/.test(name) && !/\.(test|spec)\.ts$/.test(name) && !name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

// 前一個非空白字元（或關鍵字）代表回傳值有被使用
const USED_BEFORE = /(?:[(=,?:+|&![]|=>|\$\{|\breturn|\bawait)\s*$/

export function findSwallowedApiErrors(src: string): number[] {
  const lines: number[] = []
  const re = /(?<![\w.])apiError\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const before = src.slice(Math.max(0, m.index - 40), m.index)
    // 跳過定義本身與 import
    if (/function\s*$/.test(before) || /import[^;]*$/.test(src.slice(Math.max(0, m.index - 80), m.index))) continue
    if (!USED_BEFORE.test(before)) lines.push(src.slice(0, m.index).split('\n').length)
  }
  return lines
}

describe('apiError() 的回傳值不可被丟掉', () => {
  it('偵測器本身：獨立一行判為吞錯，包進 ElMessage／賦值／多行參數不算', () => {
    expect(findSwallowedApiErrors(`} catch (e) {\n  apiError(e, '失敗')\n}`)).toEqual([2])
    expect(findSwallowedApiErrors(`ElMessage.error(apiError(e, 'x'))`)).toEqual([])
    expect(findSwallowedApiErrors(`ElMessage.error(\n  apiError(e, 'x')\n)`)).toEqual([])
    expect(findSwallowedApiErrors('const m = apiError(e)')).toEqual([])
    expect(findSwallowedApiErrors('`${row.name}：${apiError(e, "x")}`')).toEqual([])
    expect(findSwallowedApiErrors('return apiError(e)')).toEqual([])
    expect(findSwallowedApiErrors('computed(() => apiError(err))')).toEqual([])
    expect(findSwallowedApiErrors("if (e !== 'cancel') apiError(e, 'x')")).toEqual([1])
  })

  it('src 內沒有任何吞掉 apiError 回傳值的呼叫', () => {
    const offenders: string[] = []
    for (const file of collect(SRC)) {
      if (file.endsWith(join('utils', 'error.ts'))) continue
      for (const line of findSwallowedApiErrors(readFileSync(file, 'utf8'))) {
        offenders.push(`${relative(SRC, file)}:${line}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
