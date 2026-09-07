import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Vitest concurrency contract', () => {
  it('分片失敗時仍保留 blob，並在日誌顯示失敗測試', () => {
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8')
    expect(workflow).toMatch(/--reporter=default --reporter=blob/)
    const upload = workflow.slice(workflow.indexOf('- name: Upload blob report'), workflow.indexOf('  coverage:'))
    expect(upload).toMatch(/if: always\(\)/)
  })

  it('caps workers so large runners do not turn network cleanup into unrelated timeouts', () => {
    const config = readFileSync(join(process.cwd(), 'vitest.config.js'), 'utf8')

    expect(config).toMatch(/maxWorkers:\s*2/)
  })

  it('keeps the coverage gate aligned with the current verified baseline', () => {
    const config = readFileSync(join(process.cwd(), 'vitest.config.js'), 'utf8')

    expect(config).toMatch(/statements:\s*61/)
    expect(config).toMatch(/branches:\s*54/)
    expect(config).toMatch(/functions:\s*52/)
    expect(config).toMatch(/lines:\s*63/)
  })
})
