import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 前端 nginx access log 不得記下 query string（F16）。
 *
 * 離職包 magic-link 是相對路徑 `/api/offboarding/download?token=<明文>`，經本 nginx
 * 反代到後端。後端 MagicLinkLogScrubMiddleware（R6-9）只遮 uvicorn access log；
 * 本層若沿用 nginx:alpine 預設 `access_log … main`（`"$request"` 含完整 query），
 * 明文 token 會先一步寫進 Railway 前端 log，30 天／3 次內可直接重放下載。
 * 同一條 log 也會記下職員查詢的 PII 參數（student_name=、payer_name=、q=…）。
 *
 * 守衛整類而非單一路徑：template 內所有 log_format 都不得含帶 query 的變數，
 * 且 server 層必須以自訂格式覆寫預設 access_log（不得用 main／combined 或省略格式）。
 */
const root = process.cwd()
const nginx = readFileSync(join(root, 'nginx.conf.template'), 'utf8')
  // 去掉註解，避免說明文字裡的 $request 等字樣造成誤判
  .split('\n')
  .map((line) => line.replace(/#.*$/, ''))
  .join('\n')

/** 會把 query string（或含 query 的完整 URL）帶進 log 的 nginx 變數。 */
const QUERY_BEARING_VARS: Array<[string, RegExp]> = [
  ['$request（完整請求列）', /\$request(?![_a-z])/],
  ['$request_uri', /\$request_uri\b/],
  ['$args', /\$args\b/],
  ['$query_string', /\$query_string\b/],
  ['$arg_*', /\$arg_\w+/],
  ['$is_args', /\$is_args\b/],
  ['$request_body', /\$request_body\b/],
  ['$http_referer（原樣 Referer 可能含別頁的 token）', /\$http_referer\b/],
]

function logFormats(): Map<string, string> {
  const out = new Map<string, string>()
  const re = /\blog_format\s+(\w+)\s+([\s\S]*?);/g
  for (const m of nginx.matchAll(re)) out.set(m[1] ?? '', m[2] ?? '')
  return out
}

function accessLogDirectives(): string[][] {
  return [...nginx.matchAll(/\baccess_log\s+([^;]+);/g)].map((m) => (m[1] ?? '').trim().split(/\s+/))
}

describe('nginx access log 不記 query string（F16）', () => {
  it('template 至少定義一個自訂 log_format', () => {
    expect(logFormats().size).toBeGreaterThan(0)
  })

  it('所有 log_format 皆不含帶 query 的變數', () => {
    for (const [name, body] of logFormats()) {
      for (const [label, re] of QUERY_BEARING_VARS) {
        expect(re.test(body), `log_format ${name} 含 ${label}`).toBe(false)
      }
    }
  })

  it('server 層在第一個 location 之前以自訂格式覆寫 access_log（否則沿用 nginx.conf 預設 main）', () => {
    const serverStart = nginx.indexOf('server {')
    const firstLocation = nginx.indexOf('location ', serverStart)
    expect(serverStart).toBeGreaterThan(-1)
    const serverPreamble = nginx.slice(serverStart, firstLocation)
    const m = serverPreamble.match(/\baccess_log\s+(\S+)\s+(\w+)/)
    expect(m, 'server 層缺 access_log <path> <format>').not.toBeNull()
    expect(logFormats().has(m?.[2] ?? '')).toBe(true)
  })

  it('每一條 access_log 都是 off，或明確指名 template 內自訂的安全格式（不得用 main／combined 或省略格式）', () => {
    const formats = logFormats()
    const directives = accessLogDirectives()
    expect(directives.length).toBeGreaterThan(0)
    for (const args of directives) {
      if (args[0] === 'off') continue
      const format = args[1]
      expect(format, `access_log ${args.join(' ')} 未指名格式（預設 combined 含 $request）`).toBeDefined()
      expect(['main', 'combined']).not.toContain(format)
      expect(formats.has(format ?? ''), `access_log 使用未在 template 定義的格式 ${format}`).toBe(true)
    }
  })
})
