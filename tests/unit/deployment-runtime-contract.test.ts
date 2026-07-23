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
})
