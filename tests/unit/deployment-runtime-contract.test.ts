import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'


const root = process.cwd()


describe('production deployment runtime contract', () => {
  it('CI、Docker 與 package engines 使用同一個 Node major', () => {
    const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8')
    const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8')
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      engines?: { node?: string }
    }

    const dockerMajor = dockerfile.match(/FROM node:(\d+)-slim/)?.[1]
    const ciMajors = [...workflow.matchAll(/node-version:\s*["']?(\d+)/g)].map(
      (match) => match[1],
    )

    expect(dockerMajor).toBe('24')
    expect(new Set(ciMajors)).toEqual(new Set([dockerMajor]))
    expect(pkg.engines?.node).toBe('>=24 <25')
  })

  // CSP 契約：staging/prod 刻意保留 enforcing（業主決策，見 nginx-security-headers.conf
  // 註解「退回 report-only 等於放棄 CSP 保護」）；此檔只驗 Node major 對齊，不再斷言
  // report-only（reconciliation 2026-07-23）。

  it('CSP frame-src 放行公開頁影片播放所需的 YouTube embed 與 LIFF', () => {
    const conf = readFileSync(join(root, 'nginx-security-headers.conf'), 'utf8')
    const csp = conf.match(/Content-Security-Policy "([^"]+)"/)?.[1]
    expect(csp).toBeTruthy()
    const frameSrc = csp?.match(/frame-src ([^;]+)/)?.[1] ?? ''
    // 公開報名頁（VideoModal + CoursePickerSection hover 預覽）皆以
    // https://www.youtube.com/embed/<id> iframe 播課程影片；enforcing CSP
    // 缺這個網域時 iframe 直接被擋成灰色破圖（2026-08-01 staging 實測）。
    expect(frameSrc).toContain('https://www.youtube.com')
    expect(frameSrc).toContain('https://*.line.me')
  })
})
