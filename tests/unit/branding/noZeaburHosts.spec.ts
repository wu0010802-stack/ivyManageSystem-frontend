/**
 * F35（2026-10-19）：Zeabur 平台已於 2026-08-30 刪除，`*.zeabur.app` 子網域可被
 * 任何人重新註冊。執行期設定（tenants.json 的 hosts 白名單、nginx 設定、src
 * 業務碼、建置腳本）若仍接受或指向這些主機名，等於把信任交給陌生人。
 * docs 與歷史紀錄不在掃描範圍。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../..')
const ZEABUR_RE = /zeabur\.app/i

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name === '_generated') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, exts, out)
    else if (exts.some((e) => name.endsWith(e))) out.push(p)
  }
  return out
}

describe('F35：執行期設定不得殘留 *.zeabur.app 主機名', () => {
  it('branding/tenants.json 的 hosts 白名單不含 zeabur.app', () => {
    const cfg = JSON.parse(readFileSync(join(ROOT, 'branding/tenants.json'), 'utf8')) as {
      tenants: { slug: string; hosts: string[] }[]
    }
    const bad = cfg.tenants.flatMap((t) => t.hosts.filter((h) => ZEABUR_RE.test(h)).map((h) => `${t.slug}:${h}`))
    expect(bad).toEqual([])
  })

  it('src／scripts／nginx／Dockerfile／入口 HTML／vite 設定不含 zeabur.app', () => {
    const files = [
      ...walk(join(ROOT, 'src'), ['.ts', '.vue', '.js', '.json']),
      ...walk(join(ROOT, 'scripts'), ['.mjs', '.js', '.ts', '.sh']),
      ...walk(join(ROOT, 'branding'), ['.json']),
      ...readdirSync(ROOT)
        .filter((n) => /^nginx.*\.(conf|template)$/.test(n) || ['Dockerfile', 'index.html', 'public.html', 'vite.config.js'].includes(n))
        .map((n) => join(ROOT, n)),
      join(ROOT, 'parent/index.html'),
    ]
    const hits = files
      .filter((f) => ZEABUR_RE.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f))
    expect(hits).toEqual([])
  })
})
